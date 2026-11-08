import { actorUserId, type Actor } from './actor'
import { auditCreate, transition } from './cas'
import { Codes, DomainError } from './errors'
import { choiceOf, idOf, textOf } from './partsInput'
import { zonedDate } from '../../../lib/zonedTime'
import type { UnitOfWork } from './unitOfWork'

/*
 * New-tire records (SCHEMA §10.1, STATE-MACHINES §11). Each new tire carries a DOT tire identification number (TIN).
 * Finalising an invoice with a new tire line creates a registration obligation due 30 days after the sale. It
 * moves open → handed_over | submitted → confirmed, or becomes overdue when the day passes.
 */
export const TIRE_REGISTRATION_DAYS = 30

/** "DOT 4T3X 5Y2K 2423" and "dot4t3x5y2k2423" are the same number. */
export function normaliseTin(raw: string) {
  const compact = String(raw ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/^DOT/, '')
  if (!/^[A-Z0-9]{8,13}$/.test(compact)) throw new DomainError(Codes.INVALID_INPUT, 'A tire number (DOT TIN) is 8 to 13 letters and digits, stamped on the sidewall after "DOT".', { field: 'tin' })
  if (/[IOQ]/.test(compact.slice(0, 8))) throw new DomainError(Codes.INVALID_INPUT, 'A tire number never uses the letters I, O or Q in its plant and size code. Check the sidewall.', { field: 'tin' })
  return compact
}

export const addDaysUtc = (from: Date, days: number) => new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + days))

export async function recordJobTire(uow: UnitOfWork, actor: Actor, input: { jobId: string; tireSize?: string; position: string; tin: string }) {
  const tin = normaliseTin(input.tin)
  const job = await uow.tx.job.findUnique({ where: { id: idOf(input.jobId, 'a job') }, select: { id: true, status: true } })
  if (!job) throw new DomainError(Codes.NOT_FOUND, 'Job not found.', { field: 'jobId' })
  const position = choiceOf(input.position, ['LF', 'RF', 'LR', 'RR', 'spare', 'other'] as const, 'Position')
  const dupe = await uow.tx.jobTire.findUnique({ where: { tin }, select: { jobId: true } })
  if (dupe) throw new DomainError(Codes.DUPLICATE, 'That tire number is already recorded' + (dupe.jobId === job.id ? ' on this job.' : ' on another job. Check the sidewall.'), { field: 'tin' })
  const row = await uow.tx.jobTire.create({ data: { jobId: job.id, tireSize: textOf(input.tireSize, 'Tire size', 30), position, tin, recordedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'JobTire', row.id, 'job_tire.recorded', { position, tin, tireSize: row.tireSize })
  // A number recorded after the invoice goes onto the registration that is still owed (C2).
  const owed = await uow.tx.tireRegistrationObligation.findMany({ where: { status: { in: ['open', 'overdue'] }, jobLine: { jobId: job.id } }, select: { id: true, tins: true } })
  for (const ob of owed) {
    const tins = Array.isArray(ob.tins) ? (ob.tins as string[]) : []
    if (tins.includes(tin)) continue
    await uow.tx.tireRegistrationObligation.update({ where: { id: ob.id }, data: { tins: [...tins, tin], version: { increment: 1 } } })
    auditCreate(uow, actor, 'TireRegistrationObligation', ob.id, 'tire_registration.tin_added', { tin, count: tins.length + 1 })
  }
  return { id: row.id, tin }
}

/** Called inside invoice finalisation: one obligation for each new-tire invoice line, due 30 days after the invoice date. */
export async function createTireObligations(uow: UnitOfWork, actor: Actor, invoiceId: string) {
  const { tx } = uow
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true, shopId: true, invoiceDate: true, customerId: true, invoiceNumber: true } })
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId, kind: 'tire', sourceJobLineId: { not: null } }, include: { sourceJobLine: { select: { id: true, isNewTire: true, tireSize: true, jobId: true, quantityMilli: true } } } })
  const fresh = lines.filter(l => l.sourceJobLine?.isNewTire)
  if (!fresh.length) return 0
  const customer = invoice.customerId ? await tx.customer.findUnique({ where: { id: invoice.customerId }, select: { displayName: true, addresses: true } }) : null
  const shop = await tx.shop.findUnique({ where: { id: invoice.shopId as string }, select: { name: true, registrations: true } })
  const sale = invoice.invoiceDate ?? uow.now
  let made = 0
  for (const line of fresh) {
    const exists = await tx.tireRegistrationObligation.findFirst({ where: { invoiceLineId: line.id }, select: { id: true } })
    if (exists) continue
    const jobId = line.sourceJobLine!.jobId
    const tins = jobId ? (await tx.jobTire.findMany({ where: { jobId }, select: { tin: true } })).map(t => t.tin) : []
    const row = await tx.tireRegistrationObligation.create({
      data: {
        shopId: invoice.shopId, invoiceId, invoiceLineId: line.id, jobLineId: line.sourceJobLine!.id, tireDescription: `${Math.round((line.quantityMilli ?? 1000) / 1000)} × ${line.description}`.slice(0, 200),
        tins, purchaserName: customer?.displayName ?? '', purchaserAddress: (customer?.addresses ?? undefined) as never, dealerIdentity: { name: shop?.name ?? '', registrations: (shop?.registrations ?? {}) as never },
        dueAt: addDaysUtc(sale, TIRE_REGISTRATION_DAYS), status: 'open',
      },
    })
    auditCreate(uow, actor, 'TireRegistrationObligation', row.id, 'tire_registration.opened', { invoice: invoice.invoiceNumber, dueAt: row.dueAt, tins: tins.length })
    made += 1
  }
  return made
}

/** Record that the registration was handed to the customer or sent in. Every tire's number is needed first. */
export async function completeTireRegistration(uow: UnitOfWork, actor: Actor, input: { obligationId: string; method: 'form_handed_over' | 'submitted_electronic' | 'submitted_paper'; tins?: string[]; note?: string; expectedVersion?: number | null }) {
  const method = choiceOf(input.method, ['form_handed_over', 'submitted_electronic', 'submitted_paper'] as const, 'Method')
  const row = await uow.tx.tireRegistrationObligation.findUnique({ where: { id: idOf(input.obligationId, 'a registration') }, include: { jobLine: { select: { quantityMilli: true } } } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Registration not found.')
  const given = (input.tins ?? []).map(normaliseTin)
  const tins = [...new Set([...(Array.isArray(row.tins) ? (row.tins as string[]) : []), ...given])]
  const need = Math.max(1, Math.round((row.jobLine?.quantityMilli ?? 1000) / 1000))
  if (tins.length < need) throw new DomainError(Codes.TIN_REQUIRED, `This sale needs ${need} tire number${need === 1 ? '' : 's'}; ${tins.length} recorded.`, { field: 'tins' })
  await transition(uow, {
    model: 'TireRegistrationObligation', id: row.id, from: ['open', 'overdue'], to: method === 'form_handed_over' ? 'handed_over' : 'submitted', expectedVersion: input.expectedVersion, actor, eventType: 'tire_registration.completed',
    data: { method, tins, completedAt: uow.now, evidence: { note: textOf(input.note, 'Note', 300), by: actorUserId(actor), at: uow.now.toISOString() } },
  })
  return { id: row.id, tins: tins.length }
}

export async function confirmTireRegistration(uow: UnitOfWork, actor: Actor, input: { obligationId: string; expectedVersion?: number | null }) {
  await transition(uow, { model: 'TireRegistrationObligation', id: idOf(input.obligationId, 'a registration'), from: ['handed_over', 'submitted'], to: 'confirmed', expectedVersion: input.expectedVersion, actor, eventType: 'tire_registration.confirmed' })
  return { id: input.obligationId }
}

/** Worker sweep: open registrations past their due day, counted in each shop's own day, become overdue. */
export async function sweepTireRegistrations(uow: UnitOfWork, actor: Actor) {
  const open = await uow.tx.tireRegistrationObligation.findMany({ where: { status: 'open', dueAt: { not: null } }, select: { id: true, dueAt: true, shop: { select: { timeZone: true } } } })
  let n = 0
  for (const d of open) {
    const today = zonedDate(d.shop?.timeZone || 'America/Los_Angeles', uow.now)
    if (d.dueAt!.toISOString().slice(0, 10) >= today) continue
    await transition(uow, { model: 'TireRegistrationObligation', id: d.id, from: ['open'], to: 'overdue', actor, eventType: 'tire_registration.overdue' })
    n += 1
  }
  return n
}
