import { systemActor } from '../lib/actor'
import { isDomainError } from '../lib/errors'
import { runInTransaction } from '../lib/unitOfWork'
import { toJsonValue } from '../lib/canonical'
import { answerAuthorizationRequest, viewAuthorizationRequest, type PublicAnswerInput } from '../lib/authorization'
import { resolveAccessToken } from '../lib/publicTokens'
import { createPayment } from '../lib/payments'
import { openCardPage, resolvePayment } from '../lib/cardFlow'
import { cardPaymentsConfigured } from '../lib/stripeGateway'
import { closeIfSettled } from '../lib/settlement'
import { randomUUID } from 'node:crypto'
import type { Db } from '../lib/db'

/*
 * Public customer APIs (SCHEMA §17). APIs only: the customer pages that call them belong to the
 * storefront (Phase S), which this repo does not build. Each call is token-scoped; the token
 * resolves to one subject and one purpose. Nothing here reads a session.
 */

const CUSTOMER = systemActor('customer-link')
const STATUS: Record<string, number> = {
  TOKEN_INVALID: 404, TOKEN_EXPIRED: 410, ESTIMATE_SUPERSEDED: 409, CONTENT_CHANGED: 409, METHOD_NOT_ALLOWED: 403,
  EVIDENCE_MISSING: 422, PROVIDER_UNAVAILABLE: 503, GUARD_FAILED: 409, NOT_FOUND: 404, NOT_AUTHORIZED: 403, CREDIT_HOLD: 409, PO_REQUIRED: 422, INVALID_INPUT: 422, DISCLOSURE_MISSING: 422, INVALID_TRANSITION: 409, STALE_STATE: 409, RATE_LIMITED: 429,
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(toJsonValue(body)), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
})

function fail(error: unknown) {
  if (isDomainError(error)) {
    const field = typeof error.details.field === 'string' ? { field: error.details.field } : {}
    return respond({ error: { code: error.code, message: error.message, ...field } }, STATUS[error.code] ?? 400)
  }
  console.error('[public] request failed')
  return respond({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again or call the shop.' } }, 500)
}

const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || ''

// A small per-address limit so a link can't be hammered. Per process; Railway runs one replica.
const hits = new Map<string, { n: number; reset: number }>()
function limited(request: Request, bucket: string, perMinute: number) {
  const key = `${bucket}:${clientIp(request)}`
  const now = Date.now()
  const row = hits.get(key)
  if (!row || row.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); if (hits.size > 5000) hits.clear(); return false }
  row.n += 1
  return row.n > perMinute
}
const tooMany = () => respond({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a minute and try again.' } }, 429)

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return {}
  const text = await request.text()
  if (text.length > 200_000) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function getAuthorization(db: Db, request: Request, token: string) {
  if (limited(request, 'auth-get', 60)) return tooMany()
  try {
    const view = await runInTransaction(db, uow => viewAuthorizationRequest(uow, CUSTOMER, { token, ip: clientIp(request), userAgent: request.headers.get('user-agent') }), { actorKind: 'system' })
    return respond(view)
  } catch (error) {
    return fail(error)
  }
}

/** POST { answers: [{jobId, decision}], signerName, consent: true, replacedPartsElection?, signature? } or { callMe: true, callMeNote? }. */
export async function postAuthorization(db: Db, request: Request, token: string) {
  if (limited(request, 'auth-post', 20)) return tooMany()
  try {
    const input = await body(request)
    const answer: PublicAnswerInput = {
      token,
      answers: Array.isArray(input.answers) ? (input.answers as PublicAnswerInput['answers'])!.slice(0, 40) : [],
      signerName: typeof input.signerName === 'string' ? input.signerName : '',
      consent: input.consent === true,
      replacedPartsElection: (typeof input.replacedPartsElection === 'string' ? input.replacedPartsElection : null) as PublicAnswerInput['replacedPartsElection'],
      signature: (input.signature && typeof input.signature === 'object' ? input.signature : null) as PublicAnswerInput['signature'],
      callMe: input.callMe === true,
      callMeNote: typeof input.callMeNote === 'string' ? input.callMeNote : null,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }
    const result = await runInTransaction(db, uow => answerAuthorizationRequest(uow, CUSTOMER, answer), { actorKind: 'system' })
    return respond(result, (result as { replay?: boolean }).replay ? 200 : 201)
  } catch (error) {
    return fail(error)
  }
}

export async function getInspection(db: Db, request: Request, token: string) {
  if (limited(request, 'inspection-get', 60)) return tooMany()
  try {
    const view = await runInTransaction(db, async uow => {
      const row = await resolveAccessToken(uow.tx, 'inspection', token, uow.now)
      const inspection = await uow.tx.inspection.findUniqueOrThrow({
        where: { id: row.subjectId },
        include: {
          repairOrder: { select: { roNumber: true, shop: { select: { name: true, phone: true } }, vehicle: { select: { year: true, make: true, model: true } } } },
          results: { include: { templateItem: { select: { section: true, label: true, sortOrder: true } }, media: { select: { id: true, kind: true } } } },
        },
      })
      if (!inspection.viewedAt) await uow.tx.inspection.update({ where: { id: inspection.id }, data: { viewedAt: uow.now } })
      const v = inspection.repairOrder?.vehicle
      return {
        shop: inspection.repairOrder?.shop, repairOrder: inspection.repairOrder?.roNumber, vehicle: v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '',
        completedAt: inspection.completedAt,
        items: inspection.results
          .filter(r => r.condition !== 'not_inspected')
          .sort((a, b) => (a.templateItem?.sortOrder ?? 0) - (b.templateItem?.sortOrder ?? 0))
          .map(r => ({ section: r.templateItem?.section ?? '', label: r.templateItem?.label ?? '', condition: r.condition, measurements: r.measurements, notes: r.notes, media: r.media.length })),
      }
    }, { actorKind: 'system' })
    return respond(view)
  } catch (error) {
    return fail(error)
  }
}

// ── Paying an invoice by link ─────────────────────────────────────────────────

async function invoiceView(db: Db, token: string, consume: boolean) {
  return runInTransaction(db, async uow => {
    const access = await resolveAccessToken(uow.tx, 'invoice_pay', token, uow.now, { consume })
    const invoice = await uow.tx.invoice.findUnique({
      where: { id: access.subjectId },
      include: { shop: { select: { name: true, legalName: true, phone: true, addressLine1: true, city: true, region: true, postalCode: true } }, customer: { select: { displayName: true } }, repairOrder: { select: { roNumber: true, vehicle: { select: { year: true, make: true, model: true } } } }, lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!invoice) throw new (await import('../lib/errors')).DomainError('TOKEN_INVALID', 'This link is not valid.')
    const pending = await uow.tx.payment.findFirst({ where: { targetInvoiceIds: { equals: [invoice.id] as never }, status: { in: ['initiated', 'pending', 'unknown'] } }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    return {
      invoiceNumber: invoice.invoiceNumber, status: invoice.status, shop: invoice.shop, customerName: invoice.customer?.displayName ?? '', roNumber: invoice.repairOrder?.roNumber, vehicle: [invoice.repairOrder?.vehicle?.year, invoice.repairOrder?.vehicle?.make, invoice.repairOrder?.vehicle?.model].filter(Boolean).join(' '),
      invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10), dueDate: invoice.dueDate?.toISOString().slice(0, 10),
      totals: { subtotalMinor: (invoice.totalMinor - invoice.taxMinor).toString(), taxMinor: invoice.taxMinor.toString(), totalMinor: invoice.totalMinor.toString(), paidMinor: invoice.paidMinor.toString(), creditedMinor: invoice.creditedMinor.toString(), balanceMinor: invoice.balanceMinor.toString() },
      lines: invoice.lines.map(l => ({ job: l.jobNumber, kind: l.kind, description: l.description, quantityMilli: l.quantityMilli, centiHours: l.centiHours, extendedMinor: l.extendedMinor.toString() })),
      canPayByCard: cardPaymentsConfigured() && invoice.balanceMinor > 0n,
      paymentInProgress: pending?.id ?? null,
    }
  }, { actorKind: 'system' })
}

export async function getInvoice(db: Db, request: Request, token: string) {
  if (limited(request, 'inv-get', 60)) return tooMany()
  try { return respond(await invoiceView(db, token, true)) } catch (error) { return fail(error) }
}

/** POST {} starts a card payment for the whole balance and returns the Stripe page. POST { paymentId } asks where it stands. */
export async function postInvoicePayment(db: Db, request: Request, token: string) {
  if (limited(request, 'inv-post', 12)) return tooMany()
  try {
    const input = await body(request)
    const view = await invoiceView(db, token, false)
    const access = await db.publicAccessToken.findUnique({ where: { tokenHash: (await import('../lib/publicTokens')).hashToken('invoice_pay', token) } })
    const invoiceId = access!.subjectId
    if (typeof input.paymentId === 'string') {
      const payment = await db.payment.findUnique({ where: { id: input.paymentId }, select: { id: true, targetInvoiceIds: true } })
      if (!payment || !(payment.targetInvoiceIds as string[]).includes(invoiceId)) throw new (await import('../lib/errors')).DomainError('TOKEN_INVALID', 'This link is not valid.')
      const result = await resolvePayment(db, payment.id, CUSTOMER)
      return respond({ status: result.status, invoice: await invoiceView(db, token, false) })
    }
    if (!cardPaymentsConfigured()) throw new (await import('../lib/errors')).DomainError('PROVIDER_UNAVAILABLE', 'Card payments are not available right now. Please call the shop.')
    if (BigInt(view.totals.balanceMinor) <= 0n) throw new (await import('../lib/errors')).DomainError('GUARD_FAILED', 'This invoice is already paid.')
    if (view.paymentInProgress) {
      const resolved = await resolvePayment(db, view.paymentInProgress, CUSTOMER)
      if (['initiated', 'pending', 'unknown'].includes(resolved.status)) {
        const again = await openCardPage(db, view.paymentInProgress, { description: `Invoice ${view.invoiceNumber}`, returnPath: `/pay/${token}` })
        return respond({ status: 'pending', paymentId: view.paymentInProgress, checkoutUrl: again.url })
      }
    }
    const made = await runInTransaction(db, async uow => {
      const key = `link-${randomUUID()}`
      return createPayment(uow, CUSTOMER, { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'card_link', amountMinor: view.totals.balanceMinor, payerName: view.customerName }, key)
    }, { actorKind: 'system' })
    const page = await openCardPage(db, made.id, { description: `Invoice ${view.invoiceNumber}`, returnPath: `/pay/${token}` })
    return respond({ status: 'pending', paymentId: made.id, checkoutUrl: page.url }, 201)
  } catch (error) {
    return fail(error)
  }
}
export { closeIfSettled }

// ── Fleet accounts by link (SCHEMA §17: /api/public/fleet/*) ──────────────────

async function fleetContext(uow: import('../lib/unitOfWork').UnitOfWork, token: string, consume: boolean) {
  const access = await resolveAccessToken(uow.tx, 'fleet_magic_link', token, uow.now, { consume })
  const contact = await uow.tx.businessAccountContact.findUnique({ where: { id: access.subjectId } })
  if (!contact || !contact.active || !contact.businessAccountId) throw new (await import('../lib/errors')).DomainError('TOKEN_INVALID', 'This link is not valid.')
  const account = await uow.tx.businessAccount.findUniqueOrThrow({ where: { id: contact.businessAccountId } })
  const approver = await uow.tx.fleetApprover.findFirst({ where: { businessAccountId: account.id, contactId: contact.id, active: true } })
  return { contact, account, approver }
}

async function fleetView(db: Db, token: string, consume: boolean) {
  return runInTransaction(db, async uow => {
    const { tx } = uow
    const { contact, account, approver } = await fleetContext(uow, token, consume)
    const { standingOf } = await import('../lib/fleet')
    const standing = await standingOf(tx, account.id, uow.now)
    const units = await tx.fleetUnit.findMany({ where: { businessAccountId: account.id }, orderBy: { unitNumber: 'asc' }, include: { vehicle: { select: { year: true, make: true, model: true } } } })
    const invoices = await tx.invoice.findMany({ where: { businessAccountId: account.id }, orderBy: { invoiceDate: 'desc' }, take: 50, select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, totalMinor: true, balanceMinor: true, poNumber: true, status: true } })
    const statements = await tx.statement.findMany({ where: { businessAccountId: account.id }, orderBy: { periodStart: 'desc' }, take: 24, select: { id: true, reference: true, periodStart: true, periodEnd: true, closingMinor: true } })
    const estimates = await tx.estimateVersion.findMany({ where: { status: 'sent', repairOrder: { businessAccountId: account.id } }, orderBy: { sentAt: 'desc' }, take: 25, select: { id: true, reference: true, totalMinor: true, includedJobIds: true, repairOrder: { select: { roNumber: true, fleetUnit: { select: { unitNumber: true } } } } } })
    const waiting = []
    for (const e of estimates) {
      const jobs = await tx.job.findMany({ where: { id: { in: (e.includedJobIds as string[]) ?? [] }, status: 'offered' }, orderBy: { number: 'asc' }, select: { id: true, number: true, title: true, totalMinor: true } })
      if (jobs.length) waiting.push({ estimateVersionId: e.id, estimate: e.reference, repairOrder: e.repairOrder?.roNumber, unit: e.repairOrder?.fleetUnit?.unitNumber ?? '', jobs: jobs.map(j => ({ jobId: j.id, number: j.number, title: j.title, totalMinor: j.totalMinor, withinYourLimit: approver ? j.totalMinor <= approver.limitMinor : false })) })
    }
    return {
      account: { name: account.name, termsDays: account.termsDays, poRequired: account.poRequired, creditLimitMinor: account.creditLimitMinor, openBalanceMinor: account.openBalanceMinor, onHold: standing.blocked, holdReason: standing.blocked ? standing.reason : '' },
      you: { name: contact.name, canApprove: Boolean(approver), approvalLimitMinor: approver?.limitMinor ?? null },
      aging: standing.aging,
      units: units.map(u => ({ unitNumber: u.unitNumber, driverName: u.driverName, costCenter: u.costCenter, vehicle: [u.vehicle?.year, u.vehicle?.make, u.vehicle?.model].filter(Boolean).join(' ') })),
      waitingForApproval: waiting,
      invoices: invoices.map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, invoiceDate: i.invoiceDate?.toISOString().slice(0, 10), dueDate: i.dueDate?.toISOString().slice(0, 10), totalMinor: i.totalMinor, balanceMinor: i.balanceMinor, poNumber: i.poNumber, status: i.status })),
      statements: statements.map(s => ({ id: s.id, reference: s.reference, periodStart: s.periodStart?.toISOString().slice(0, 10), periodEnd: s.periodEnd?.toISOString().slice(0, 10), closingMinor: s.closingMinor })),
      canPayByCard: cardPaymentsConfigured(),
    }
  }, { actorKind: 'system' })
}

export async function getFleet(db: Db, request: Request, token: string) {
  if (limited(request, 'fleet-get', 60)) return tooMany()
  try { return respond(await fleetView(db, token, true)) } catch (error) { return fail(error) }
}

/** POST { action: 'approve', estimateVersionId, jobIds, poNumber?, replacedPartsElection? } authorizes within the caller's limit. POST { action: 'pay', invoiceId } opens a card page for one invoice. */
export async function postFleet(db: Db, request: Request, token: string) {
  if (limited(request, 'fleet-post', 20)) return tooMany()
  try {
    const input = await body(request)
    const { DomainError } = await import('../lib/errors')
    if (input.action === 'approve') {
      const result = await runInTransaction(db, async uow => {
        const { contact, approver } = await fleetContext(uow, token, false)
        if (!approver) throw new DomainError('NOT_AUTHORIZED', 'You are not an approver on this account.')
        const ev = await uow.tx.estimateVersion.findUnique({ where: { id: String(input.estimateVersionId ?? '') }, include: { repairOrder: { select: { businessAccountId: true } } } })
        if (!ev || ev.repairOrder?.businessAccountId !== approver.businessAccountId) throw new DomainError('NOT_FOUND', 'That estimate was not found.')
        const jobIds = (Array.isArray(input.jobIds) ? input.jobIds : []).filter((x): x is string => typeof x === 'string').slice(0, 40)
        if (!jobIds.length) throw new DomainError('INVALID_INPUT', 'Choose the jobs to approve.', { field: 'jobIds' })
        const { recordAuthorization } = await import('../lib/authorization')
        return recordAuthorization(uow, CUSTOMER, {
          estimateVersionId: ev.id, method: 'fleet_po', actorKind: 'fleet_approver', actorName: contact.name, fleetApproverId: approver.id, poNumber: typeof input.poNumber === 'string' ? input.poNumber : null,
          replacedPartsElection: (typeof input.replacedPartsElection === 'string' ? input.replacedPartsElection : null) as 'return' | 'do_not_return' | 'show_only' | null,
          answers: jobIds.map(jobId => ({ jobId, decision: 'approve' as const })),
        })
      }, { actorKind: 'system' })
      return respond({ ok: true, result, ...(await fleetView(db, token, false)) }, 201)
    }
    if (input.action === 'pay') {
      if (!cardPaymentsConfigured()) throw new DomainError('PROVIDER_UNAVAILABLE', 'Card payments are not available right now. Please call the shop.')
      const made = await runInTransaction(db, async uow => {
        const { account } = await fleetContext(uow, token, false)
        const invoice = await uow.tx.invoice.findUnique({ where: { id: String(input.invoiceId ?? '') }, select: { id: true, businessAccountId: true, balanceMinor: true, invoiceNumber: true } })
        if (!invoice || invoice.businessAccountId !== account.id) throw new DomainError('NOT_FOUND', 'That invoice was not found.')
        const payment = await createPayment(uow, CUSTOMER, { purpose: 'invoice', invoiceIds: [invoice.id], tender: 'card_link', amountMinor: invoice.balanceMinor.toString(), payerName: account.name }, `fleet-${randomUUID()}`)
        return { paymentId: payment.id, invoiceNumber: invoice.invoiceNumber }
      }, { actorKind: 'system' })
      const page = await openCardPage(db, made.paymentId, { description: `Invoice ${made.invoiceNumber}`, returnPath: `/fleet/${token}` })
      return respond({ status: 'pending', paymentId: made.paymentId, checkoutUrl: page.url }, 201)
    }
    throw new DomainError('INVALID_INPUT', 'Say what you want to do: approve or pay.', { field: 'action' })
  } catch (error) {
    return fail(error)
  }
}

/** A statement as a spreadsheet file. */
export async function getFleetStatement(db: Db, request: Request, token: string, statementId: string) {
  if (limited(request, 'fleet-statement', 30)) return tooMany()
  try {
    const out = await runInTransaction(db, async uow => {
      const { account } = await fleetContext(uow, token, false)
      const statement = await uow.tx.statement.findUnique({ where: { id: statementId }, select: { id: true, businessAccountId: true } })
      if (!statement || statement.businessAccountId !== account.id) throw new (await import('../lib/errors')).DomainError('NOT_FOUND', 'That statement was not found.')
      const { exportStatement } = await import('../lib/fleet')
      return exportStatement(uow, CUSTOMER, { statementId: statement.id })
    }, { actorKind: 'system' })
    return new Response(out.csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
  } catch (error) {
    return fail(error)
  }
}
