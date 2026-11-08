import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { assertWithinCeiling } from './ceiling'
import { Decimal, dec } from './decimal'
import { nextShopReference } from './sequence'
import { createTireObligations } from './tires'
import { sumMinor } from './money'
import { toJsonValue } from './canonical'
import { zonedDate } from '../../../lib/zonedTime'
import { addDays, addMonths, addYears, invoiceStatus, payerWeights, splitLine, totalsOf, type BillLine, type PayerShare } from './invoiceMath'
import { recordOdometer } from './vehicles'
import { deriveToken, createAccessToken, revokeTokensFor } from './publicTokens'
import { postingDate, settleDeposits } from './payments'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'
import { flagJob, shopPolicy } from './flagging'

/*
 * Invoicing (STATE-MACHINES §12; DOMAIN D§3.8, I-R6). Finalizing an invoice is one transaction: the
 * repair order's completed jobs are re-checked against what the customer authorized, split among
 * payers line by line, numbered gap-free per shop, frozen (the database refuses later edits),
 * and any deposit the customer already paid is applied, once.
 */

export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
export const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

const BILLABLE_SKIPPED = ['declined', 'deferred', 'voided']
const INVOICEABLE_RO = ['in_service', 'ready_to_invoice']

type Payer = { key: string; kind: string; businessAccountId: string | null; customerId: string | null; payorName: string; authorizationNumber: string; claimNumber: string }
type PlannedLine = BillLine & { sourceJobLineId: string; jobNumber: number; jobTitle: string; description: string; partNumber: string; brand: string; condition: string; subletVendorName: string; quantityMilli: number; centiHours: number; unitPriceMinor: bigint; taxCategoryCode: string; sortOrder: number }
export type InvoicePlan = { payer: Payer; lines: PlannedLine[]; totals: ReturnType<typeof totalsOf> }

const payerKeyOf = (kind: string, businessAccountId: string | null, name: string) => (kind === 'customer' ? 'customer' : `${kind}:${businessAccountId ?? name}`)

/** Everything the invoice(s) would say, and what stops them from being finalized. Writes nothing. */
export async function buildInvoicePlan(tx: Tx, repairOrderId: string, now: Date) {
  const ro = await tx.repairOrder.findUnique({
    where: { id: repairOrderId },
    include: {
      customer: true, vehicle: true, shop: true, businessAccount: true,
      jobs: { orderBy: { number: 'asc' }, include: { lines: { orderBy: { sortOrder: 'asc' } }, payerSplits: true, authorizations: { orderBy: { authorizedAt: 'desc' } }, warrantyTerm: true } },
    },
  })
  if (!ro) throw new DomainError(Codes.NOT_FOUND, 'Repair order not found.')
  const problems: string[] = []
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId! } })
  const billable = ro.jobs.filter(j => !BILLABLE_SKIPPED.includes(j.status))
  const open = billable.filter(j => j.status !== 'completed')
  if (!INVOICEABLE_RO.includes(ro.status)) problems.push(`${ro.roNumber} is ${ro.status.replaceAll('_', ' ')}; only work in service can be invoiced.`)
  for (const j of open) problems.push(`Job ${j.number}, ${j.title}, is ${j.status.replaceAll('_', ' ')}. Complete it, or decline or void it, before invoicing.`)
  if (!billable.length) problems.push('There is no completed work to invoice.')

  // I-R5: nothing is billed above what the customer authorized (plus the law's tolerance).
  for (const j of billable.filter(x => x.status === 'completed')) {
    if (BigInt(j.totalMinor) === 0n && j.noChargeReason) continue
    try {
      const includesTax = (law.toleranceRule as { includesTax?: boolean } | null)?.includesTax === true
      assertWithinCeiling({ rule: law.toleranceRule, authorizedMinor: includesTax ? j.authorizedAmountMinor : j.authorizedSubtotalMinor, priceMinor: j.subtotalMinor, taxMinor: j.taxMinor, jobId: j.id })
    } catch (error) {
      if (error instanceof DomainError && error.code === Codes.REAUTHORIZATION_REQUIRED) problems.push(`Job ${j.number}, ${j.title}, is above what the customer authorized. Send a revised estimate and record a new authorization.`)
      else throw error
    }
  }
  const law2 = law as { requireOdometerOut?: boolean }

  // Payers: each job's split rows; whatever the others don't cover is the customer's.
  const payers = new Map<string, Payer>()
  const lineBuckets = new Map<string, PlannedLine[]>()
  const customerPayer: Payer = { key: 'customer', kind: 'customer', businessAccountId: null, customerId: ro.customerId, payorName: ro.customer?.displayName ?? '', authorizationNumber: '', claimNumber: '' }
  const defaultPayer: Payer = ro.businessAccountId && ro.businessAccount
    ? { key: payerKeyOf('business_account', ro.businessAccountId, ''), kind: 'business_account', businessAccountId: ro.businessAccountId, customerId: ro.customerId, payorName: ro.businessAccount.name, authorizationNumber: '', claimNumber: '' }
    : customerPayer
  for (const j of billable.filter(x => x.status === 'completed')) {
    const splits = j.payerSplits.filter(s => s.payerKind !== 'customer' || s.percent)
    const shares: { payer: Payer; share: PayerShare }[] = []
    for (const s of splits) {
      const kind = s.payerKind
      const payer: Payer = kind === 'customer' ? customerPayer : { key: payerKeyOf(kind, s.businessAccountId, s.payorName), kind, businessAccountId: s.businessAccountId, customerId: null, payorName: s.payorName, authorizationNumber: s.authorizationNumber, claimNumber: s.claimNumber }
      shares.push({ payer, share: { key: payer.key, percent: dec(s.percent.toString()), deductibleMinor: s.deductibleMinor ?? undefined } })
    }
    const total = shares.reduce((a, s) => a.plus(s.share.percent), new Decimal(0))
    if (total.greaterThan(100)) problems.push(`Job ${j.number}: the payer shares add up to more than 100%.`)
    if (!shares.length) shares.push({ payer: defaultPayer, share: { key: defaultPayer.key, percent: new Decimal(100) } })
    else if (total.lessThan(100) && !shares.some(s => s.payer.kind === 'customer')) shares.push({ payer: defaultPayer, share: { key: defaultPayer.key, percent: new Decimal(100).minus(total) } })
    // Merge a payer that appears twice on one job.
    const merged = new Map<string, { payer: Payer; share: PayerShare }>()
    for (const s of shares) {
      const prior = merged.get(s.payer.key)
      merged.set(s.payer.key, prior ? { payer: s.payer, share: { key: s.payer.key, percent: prior.share.percent.plus(s.share.percent), deductibleMinor: (prior.share.deductibleMinor ?? 0n) + (s.share.deductibleMinor ?? 0n) } } : s)
    }
    const list = [...merged.values()]
    const weights = payerWeights(BigInt(j.totalMinor), list.map(s => s.share))
    for (const line of j.lines) {
      const parts = splitLine({ kind: line.kind, extendedMinor: line.extendedMinor, taxMinor: line.taxMinor }, weights)
      parts.forEach((part, i) => {
        if (part.extendedMinor === 0n && part.taxMinor === 0n && list.length > 1) return
        const payer = list[i].payer
        payers.set(payer.key, payer)
        const bucket = lineBuckets.get(payer.key) ?? []
        bucket.push({
          ...part, sourceJobLineId: line.id, jobNumber: j.number, jobTitle: j.title, description: line.description, partNumber: line.partNumber, brand: line.brand, condition: line.condition ?? '',
          subletVendorName: line.subletVendorName, quantityMilli: line.quantityMilli, centiHours: line.soldCentiHours, unitPriceMinor: line.kind === 'labor' ? line.rateMinor : line.unitPriceMinor,
          taxCategoryCode: line.taxCategoryCode, sortOrder: j.number * 1000 + (line.sortOrder ?? 0),
        })
        lineBuckets.set(payer.key, bucket)
      })
    }
  }
  const plans: InvoicePlan[] = [...payers.values()].map(payer => ({ payer, lines: lineBuckets.get(payer.key) ?? [], totals: totalsOf(lineBuckets.get(payer.key) ?? []) }))
    .sort((a, b) => (a.payer.kind === 'customer' ? 1 : 0) - (b.payer.kind === 'customer' ? 1 : 0) || a.payer.key.localeCompare(b.payer.key))

  for (const plan of plans) {
    const account = plan.payer.businessAccountId ? await tx.businessAccount.findUnique({ where: { id: plan.payer.businessAccountId } }) : null
    if (account?.status === 'on_hold' || account?.status === 'credit_hold') problems.push(`${account.name} is on credit hold. A manager must clear it before this is invoiced.`)
  }
  return { ro, law: { ...law, ...law2 }, plans, problems, billable }
}

export type FinalizeInput = { repairOrderId: string; expectedVersion: number; poNumber?: string | null; odometerOut?: number | null }

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

export async function finalizeInvoices(uow: UnitOfWork, actor: Actor, input: FinalizeInput) {
  const { tx, now } = uow
  await lockRow(tx, 'RepairOrder', input.repairOrderId)
  const built = await buildInvoicePlan(tx, input.repairOrderId, now)
  const { ro, law, plans } = built
  const problems = [...built.problems]
  const poNumber = text(input.poNumber, 80)
  const shop = ro.shop!
  const odometer = input.odometerOut ?? null
  if (law.requireOdometerOut && !ro.odometerOutId && odometer === null) problems.push('Record the odometer reading as the vehicle leaves; this state requires it on the invoice.')
  for (const plan of plans) {
    const account = plan.payer.businessAccountId ? await tx.businessAccount.findUnique({ where: { id: plan.payer.businessAccountId } }) : null
    if (account?.poRequired && !poNumber) problems.push(`${account.name} requires a purchase order number on every invoice.`)
  }
  if (problems.length) {
    const code = problems.some(p => p.includes('purchase order')) ? Codes.PO_REQUIRED : problems.some(p => p.includes('credit hold')) ? Codes.CREDIT_HOLD : problems.some(p => p.includes('above what the customer authorized')) ? Codes.REAUTHORIZATION_REQUIRED : problems.some(p => p.includes('odometer')) ? Codes.ODOMETER_REQUIRED : Codes.GUARD_FAILED
    throw new DomainError(code, problems[0], { problems })
  }

  let odometerOutId = ro.odometerOutId
  if (odometer !== null && ro.vehicleId) odometerOutId = (await recordOdometer(uow, actor, { vehicleId: ro.vehicleId, value: odometer, source: 'ro_out' })).id

  const today = zonedDate(shop.timeZone, now)
  const retentionYears = Math.max(1, law.recordRetentionYears ?? 4)
  const disclosures = await disclosuresFor(tx, ro, law, odometer, plans.some(p => p.payer.kind !== 'customer'))
  const invoices: { id: string; invoiceNumber: string; payerKind: string; totalMinor: string }[] = []

  for (const plan of plans) {
    const account = plan.payer.businessAccountId ? await tx.businessAccount.findUnique({ where: { id: plan.payer.businessAccountId } }) : null
    const dueDate = account && account.termsDays > 0 ? addDays(today, account.termsDays) : today
    const invoiceNumber = await nextShopReference(tx, 'INV', shop.code, now)
    const status = invoiceStatus({ totalMinor: plan.totals.totalMinor, paidMinor: 0n, creditedMinor: 0n, sent: false })
    const row = await tx.invoice.create({
      data: {
        shopId: shop.id, invoiceNumber, repairOrderId: ro.id, payerKind: plan.payer.kind, customerId: ro.customerId, businessAccountId: plan.payer.businessAccountId, poNumber,
        invoiceDate: dateOnly(today), dueDate: dateOnly(dueDate), retentionUntil: dateOnly(addYears(today, retentionYears)), odometerOut: odometer,
        ...plan.totals, paidMinor: 0n, creditedMinor: 0n, balanceMinor: plan.totals.totalMinor,
        disclosures: toJsonValue({ ...disclosures, payer: { kind: plan.payer.kind, name: plan.payer.payorName, authorizationNumber: plan.payer.authorizationNumber, claimNumber: plan.payer.claimNumber } }) as never,
        finalizedById: actorUserId(actor), finalizedAt: now, status: 'finalized', version: 0,
      },
    })
    await tx.invoiceLine.createMany({
      data: plan.lines.map((l, i) => ({
        invoiceId: row.id, sourceJobLineId: l.sourceJobLineId, jobNumber: l.jobNumber, jobTitle: l.jobTitle, kind: l.kind, description: l.description, partNumber: l.partNumber, brand: l.brand,
        condition: l.condition, subletVendorName: l.subletVendorName, quantityMilli: l.quantityMilli, centiHours: l.centiHours, unitPriceMinor: l.unitPriceMinor, extendedMinor: l.extendedMinor,
        taxCategoryCode: l.taxCategoryCode, taxMinor: l.taxMinor, sortOrder: l.sortOrder * 100 + i,
      })),
    })
    if (status !== 'finalized') await tx.invoice.update({ where: { id: row.id }, data: { status } })
    if (account) await tx.businessAccount.update({ where: { id: account.id }, data: { openBalanceMinor: { increment: plan.totals.totalMinor }, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Invoice', row.id, 'invoice.finalized', { invoiceNumber, repairOrder: ro.roNumber, payer: plan.payer.kind, totalMinor: plan.totals.totalMinor, taxMinor: plan.totals.taxMinor, lines: plan.lines.length, retentionUntil: addYears(today, retentionYears) })
    await createTireObligations(uow, actor, row.id)
    invoices.push({ id: row.id, invoiceNumber, payerKind: plan.payer.kind, totalMinor: plan.totals.totalMinor.toString() })
  }

  // Warranty starts when the customer is billed (SM§12).
  const firstInvoiceId = invoices.find(i => i.payerKind === 'customer')?.id ?? invoices[0]?.id ?? null
  for (const job of built.billable.filter(j => j.status === 'completed' && j.warrantyTerm)) {
    const term = job.warrantyTerm!
    const startMiles = odometer ?? null
    await tx.warrantyCoverage.create({
      data: {
        repairOrderId: ro.id, jobId: job.id, invoiceId: firstInvoiceId, vehicleId: ro.vehicleId, termCode: term.code, termName: term.name, invoiceText: term.invoiceText,
        startsOn: dateOnly(today), endsOn: dateOnly(addMonths(today, term.months)), startMiles, endsAtMiles: startMiles === null ? null : startMiles + term.miles, status: 'active',
      },
    })
  }

  if ((await shopPolicy(tx, ro.shopId!)).flagHoursAt === 'invoice_finalized') {
    for (const job of built.billable.filter(j => j.status === 'completed')) await flagJob(uow, actor, job.id, 'invoice.finalized')
  }

  await transition(uow, {
    model: 'RepairOrder', id: ro.id, from: INVOICEABLE_RO, to: 'invoiced', expectedVersion: input.expectedVersion, actor, eventType: 'repair_order.invoiced',
    data: { lockedAt: now, odometerOutId }, metadata: { invoices: invoices.map(i => i.invoiceNumber) },
  })
  await settleDeposits(uow, actor, ro.id, invoices.map(i => i.id))
  const fresh = await tx.invoice.findMany({ where: { id: { in: invoices.map(i => i.id) } }, orderBy: { invoiceNumber: 'asc' } })
  return { repairOrderId: ro.id, invoices: fresh.map(i => ({ id: i.id, invoiceNumber: i.invoiceNumber, payerKind: i.payerKind, totalMinor: i.totalMinor.toString(), balanceMinor: i.balanceMinor.toString(), status: i.status })) }
}

/** What the printed invoice must say beyond the lines (16 CCR § 3356; the pinned law lists the notices). */
async function disclosuresFor(tx: Tx, ro: any, law: any, odometerOut: number | null, thirdParty: boolean) {
  const odo = ro.odometerInId ? await tx.odometerReading.findUnique({ where: { id: ro.odometerInId } }) : null
  const declined = await tx.job.findMany({ where: { repairOrderId: ro.id, status: 'declined', urgency: { in: ['safety', 'soon'] } }, select: { number: true, title: true, urgency: true, totalMinor: true } })
  const authorizations = await tx.authorization.findMany({ where: { job: { repairOrderId: ro.id } }, orderBy: { authorizedAt: 'asc' }, select: { method: true, authorizedAt: true, amountMinor: true, actorName: true, job: { select: { number: true } } } })
  const election = ro.replacedPartsElection as string
  return {
    registrations: ro.shop.registrations ?? {},
    notices: ((law.requiredNotices as { key: string; text: string }[] | null) ?? []).filter(n => n && typeof n.text === 'string'),
    replacedParts: election === 'returned' ? 'The customer asked to have the replaced parts returned.' : election === 'declined' ? 'The customer declined to have the replaced parts returned.' : law.replacedPartsOfferRequired ? law.replacedPartsOfferText : null,
    nonReturnableNote: law.nonReturnableNoteText || null,
    thirdPartyNotice: thirdParty ? law.thirdPartyPayorNoticeText || null : null,
    odometer: { in: odo?.value ?? null, out: odometerOut },
    authorizations: authorizations.map(a => ({ job: a.job?.number, method: a.method, at: a.authorizedAt.toISOString(), amountMinor: a.amountMinor.toString(), by: a.actorName })),
    declinedSafetyItems: declined.map(d => ({ job: d.number, title: d.title, urgency: d.urgency, totalMinor: d.totalMinor.toString() })),
    warranty: (await tx.job.findMany({ where: { repairOrderId: ro.id, status: 'completed', warrantyTermId: { not: null } }, select: { number: true, warrantyTerm: { select: { name: true, invoiceText: true } } } }))
      .map(j => ({ job: j.number, name: j.warrantyTerm?.name, text: j.warrantyTerm?.invoiceText })),
  }
}

/** A pay link the shop can text or print; the customer sees one invoice and pays it by card. */
export async function invoicePayLink(uow: UnitOfWork, actor: Actor, input: { invoiceId: string }) {
  const { tx } = uow
  const invoice = await lockRow<Record<string, any>>(tx, 'Invoice', input.invoiceId)
  if (BigInt(invoice.balanceMinor) <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'This invoice is already paid.')
  await revokeTokensFor(tx, 'Invoice', invoice.id, uow.now)
  const made = await createAccessToken(uow, { purpose: 'invoice_pay', subjectType: 'Invoice', subjectId: invoice.id, shopId: invoice.shopId, ttlHours: 168, maxUses: 200 })
  await tx.invoice.update({ where: { id: invoice.id }, data: { sentAt: invoice.sentAt ?? uow.now, sentChannel: invoice.sentChannel || 'link', status: invoice.status === 'finalized' ? 'sent' : invoice.status, version: { increment: 1 } } })
  auditCreate(uow, actor, 'Invoice', invoice.id, 'invoice.pay_link_created', { expiresAt: made.expiresAt.toISOString() })
  return { path: `/pay/${made.token}`, apiPath: `/api/public/invoices/${made.token}`, expiresAt: made.expiresAt.toISOString() }
}
export const payTokenFor = (id: string) => deriveToken('invoice_pay', id)
export { sumMinor, postingDate }
