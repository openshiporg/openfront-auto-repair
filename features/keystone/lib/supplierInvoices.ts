import { actorUserId, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import { cents, centsOf, idOf, listOf, milliOf, objectOf, textOf } from './partsInput'
import { extendMinor } from './stockMath'
import { sumMinor } from './money'
import type { UnitOfWork } from './unitOfWork'

/*
 * Supplier invoices and the three-way match (STATE-MACHINES §9.5; DOMAIN I-S6). The order says what we
 * asked for, the receipt says what arrived, the invoice says what the supplier wants paid. Anything that
 * disagrees becomes a Discrepancy, and an invoice with an open discrepancy cannot be approved.
 * A supplier's invoice number is used once per supplier, enforced here and by a unique index.
 */

const normalise = (n: string) => n.trim().toLowerCase()

/** A supplier's header may round each line its own way; anything more than a cent apart is a different bill (review r3 N1). */
export const TOTAL_TOLERANCE_MINOR = 1n
type Billable = { quantityMilli: number; unitCostMinor: bigint | number | string; coreCreditMinor: bigint | number | string }
/** What the lines add up to: each line extended and rounded to the cent, less its core credit. */
export const linesTotalMinor = (lines: Billable[]) => sumMinor(lines.map(l => extendMinor(l.quantityMilli, BigInt(l.unitCostMinor)) - BigInt(l.coreCreditMinor)))
const apart = (a: bigint, b: bigint) => (a > b ? a - b : b - a) > TOTAL_TOLERANCE_MINOR

export type InvoiceLineInput = { partNumber: string; quantityMilli: number; unitCostMinor: unknown; coreCreditMinor?: unknown }
export type SupplierInvoiceInput = { shopId: string; supplierId: string; invoiceNumber: string; invoiceDate: string; totalMinor: unknown; documentId?: string | null; lines: InvoiceLineInput[] }

export async function recordSupplierInvoice(uow: UnitOfWork, actor: Actor, input: SupplierInvoiceInput) {
  const { tx } = uow
  const number = textOf(input.invoiceNumber, 'Invoice number', 60, true)
  const supplier = await tx.supplier.findUnique({ where: { id: idOf(input.supplierId, 'a supplier') }, select: { id: true, name: true } })
  if (!supplier) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found.', { field: 'supplierId' })
  const date = new Date(`${String(input.invoiceDate).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Enter the invoice date.', { field: 'invoiceDate' })
  // A reversed invoice keeps its number in the history but frees it for the corrected one.
  const dupe = await tx.supplierInvoice.findFirst({ where: { supplierId: supplier.id, invoiceNumber: { equals: number, mode: 'insensitive' }, status: { not: 'reversed' } }, select: { id: true } })
  if (dupe) throw new DomainError(Codes.DUPLICATE, `${supplier.name} invoice ${number} is already recorded.`, { field: 'invoiceNumber', existingId: dupe.id })
  const lines = listOf(input.lines, 'the invoice').map((entry, i) => {
    const l = objectOf(entry, `line ${i + 1}`)
    return { partNumber: textOf(l.partNumber, 'Part number', 60, true), quantityMilli: milliOf(l.quantityMilli, `Quantity on line ${i + 1}`), unitCostMinor: centsOf(l.unitCostMinor, 'Cost'), coreCreditMinor: centsOf(l.coreCreditMinor, 'Core credit', false) }
  })
  const total = centsOf(input.totalMinor, 'Invoice total')
  if (total <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The invoice total must be above zero. Enter a supplier credit as a return, not as an invoice.', { field: 'totalMinor' })
  const sum = linesTotalMinor(lines)
  if (apart(total, sum)) {
    throw new DomainError(Codes.INVALID_INPUT, `The invoice total is ${cents(total)} but its lines add up to ${cents(sum)}. Check the total and each line against the paper invoice.`, { field: 'totalMinor', totalMinor: total.toString(), linesTotalMinor: sum.toString() })
  }
  const row = await tx.supplierInvoice.create({ data: { shopId: input.shopId, supplierId: supplier.id, invoiceNumber: number, invoiceDate: date, totalMinor: total, documentId: input.documentId || null, status: 'received' } })
  await tx.supplierInvoiceLine.createMany({ data: lines.map(l => ({ invoiceId: row.id, ...l, matchStatus: 'unmatched' })) })
  auditCreate(uow, actor, 'SupplierInvoice', row.id, 'supplier_invoice.received', { supplier: supplier.name, invoiceNumber: number, totalMinor: total, lines: lines.length })
  return { id: row.id }
}

type Found = { kind: string; amountMinor: bigint; detail: string; lineId: string | null }

/** Match every line, record what disagrees, and move the invoice to `matched` or `discrepancy`. Safe to run again: it keeps open discrepancies and adds none twice. */
export async function matchSupplierInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string }) {
  const { tx } = uow
  const invoice = await lockRow<Record<string, any>>(tx, 'SupplierInvoice', idOf(input.invoiceId, 'an invoice'))
  if (!['received', 'matching', 'discrepancy'].includes(invoice.status)) throw new DomainError(Codes.INVALID_TRANSITION, `An invoice that is ${invoice.status} cannot be matched again.`, { currentStatus: invoice.status })
  const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: invoice.supplierId }, select: { priceToleranceMinor: true } })
  const tolerance = BigInt(supplier.priceToleranceMinor)
  const lines = await tx.supplierInvoiceLine.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: 'asc' } })
  const found: Found[] = []

  for (const line of lines) {
    if (line.matchStatus !== 'unmatched') continue
    // Oldest open order lines first; this line may span several partial receipts.
    const candidates = await tx.supplierOrderLine.findMany({
      where: { partNumber: { equals: line.partNumber, mode: 'insensitive' }, order: { supplierId: invoice.supplierId, shopId: invoice.shopId, status: { notIn: ['draft', 'cancelled', 'failed'] } } },
      orderBy: { createdAt: 'asc' },
    })
    const open = candidates.filter(c => c.receivedQuantityMilli > c.invoicedQuantityMilli)
    if (!candidates.length) {
      await tx.supplierInvoiceLine.update({ where: { id: line.id }, data: { matchStatus: 'variance' } })
      found.push({ kind: 'unordered_item', amountMinor: extendMinor(line.quantityMilli, BigInt(line.unitCostMinor)), detail: `${line.partNumber} was billed but never ordered.`, lineId: line.id })
      continue
    }
    let remaining = line.quantityMilli
    let first: (typeof open)[number] | null = null
    const allocations: { orderLineId: string; quantityMilli: number }[] = []
    for (const c of open) {
      if (remaining <= 0) break
      const take = Math.min(remaining, c.receivedQuantityMilli - c.invoicedQuantityMilli)
      await tx.supplierOrderLine.update({ where: { id: c.id }, data: { invoicedQuantityMilli: { increment: take } } })
      first ??= c
      allocations.push({ orderLineId: c.id, quantityMilli: take })
      remaining -= take
      const diff = BigInt(line.unitCostMinor) - BigInt(c.unitCostMinor)
      if (diff > tolerance) found.push({ kind: 'overcharge', amountMinor: extendMinor(take, diff), detail: `${line.partNumber} was billed above the ordered price on ${take / 1000} unit${take === 1000 ? '' : 's'}.`, lineId: line.id })
    }
    if (remaining > 0) {
      found.push({ kind: 'quantity_mismatch', amountMinor: extendMinor(remaining, BigInt(line.unitCostMinor)), detail: `${line.partNumber}: billed ${line.quantityMilli / 1000}, but only ${(line.quantityMilli - remaining) / 1000} was received and not yet invoiced.`, lineId: line.id })
    }
    const kinds = found.filter(f => f.lineId === line.id)
    await tx.supplierInvoiceLine.update({ where: { id: line.id }, data: { matchedOrderLineId: first?.id ?? null, allocations, matchStatus: kinds.length ? 'variance' : 'matched' } })
  }

  // Cores we sent back should be credited by this supplier: the credit must appear on the invoice.
  const returned = await tx.coreObligation.findMany({ where: { supplierId: invoice.supplierId, shopId: invoice.shopId, status: 'returned', returnedAt: { lte: new Date(invoice.invoiceDate.getTime() + 86_400_000) } } })
  const credits = lines.map(l => ({ line: l, left: BigInt(l.coreCreditMinor) }))
  for (const core of returned) {
    const credit = credits.find(c => c.left >= BigInt(core.coreChargeMinor) && c.line.partNumber.toLowerCase() === core.partNumber.toLowerCase()) ?? credits.find(c => c.left >= BigInt(core.coreChargeMinor) && c.left > 0n && !returned.some(o => o !== core && o.partNumber.toLowerCase() === c.line.partNumber.toLowerCase()))
    if (credit) {
      credit.left -= BigInt(core.coreChargeMinor)
      await tx.coreObligation.update({ where: { id: core.id }, data: { status: 'credited', creditedAt: uow.now, supplierInvoiceLineId: credit.line.id, version: { increment: 1 } } })
      auditCreate(uow, actor, 'CoreObligation', core.id, 'core.credited', { invoice: invoice.invoiceNumber, coreChargeMinor: core.coreChargeMinor })
    } else {
      // Say it once (L1): a core already reported on an earlier invoice is not reported again on every later one.
      const already = await tx.discrepancy.count({ where: { kind: 'core_not_credited', detail: { contains: `(core ${core.id})` }, invoiceId: { not: invoice.id } } })
      if (already) continue
      found.push({ kind: 'core_not_credited', amountMinor: BigInt(core.coreChargeMinor), detail: `The ${core.partNumber} core was returned but invoice ${invoice.invoiceNumber} shows no credit. (core ${core.id})`, lineId: null })
    }
  }

  // The header must agree with the lines (N1). Recorded invoices are checked at entry; this catches any that predate that check.
  const lineSum = linesTotalMinor(lines)
  const header = BigInt(invoice.totalMinor)
  if (apart(header, lineSum)) {
    found.push({ kind: 'total_mismatch', amountMinor: header > lineSum ? header - lineSum : lineSum - header, detail: `Invoice ${invoice.invoiceNumber}: the header total does not match the sum of its lines.`, lineId: null })
  }

  const stillOpen = await tx.discrepancy.findMany({ where: { invoiceId: invoice.id }, select: { kind: true, detail: true } })
  const seen = new Set(stillOpen.map(d => `${d.kind}|${d.detail}`))
  let created = 0
  for (const f of found) {
    if (seen.has(`${f.kind}|${f.detail}`)) continue
    const d = await tx.discrepancy.create({ data: { invoiceId: invoice.id, lineId: f.lineId, kind: f.kind, amountMinor: f.amountMinor, detail: f.detail, openedById: actor.kind === 'user' ? actorUserId(actor) : null, openedByAgentId: actor.kind === 'agent' ? actor.agentId : null, status: 'open' } })
    auditCreate(uow, actor, 'Discrepancy', d.id, 'discrepancy.opened', { kind: f.kind, amountMinor: f.amountMinor, invoice: invoice.invoiceNumber })
    created += 1
  }
  const openCount = await tx.discrepancy.count({ where: { invoiceId: invoice.id, status: { in: ['open', 'disputed'] } } })
  const to = openCount ? 'discrepancy' : 'matched'
  await transition(uow, { model: 'SupplierInvoice', id: invoice.id, from: ['received', 'matching', 'discrepancy'], to, actor, eventType: `supplier_invoice.${to}`, data: {}, metadata: { newDiscrepancies: created, linesTotalMinor: lineSum.toString() } })
  return { id: invoice.id, status: to, discrepancies: openCount, linesTotalMinor: lineSum.toString(), totalMinor: header.toString() }
}

/** Decide a discrepancy: the supplier is right (`accepted`), we dispute it, or the supplier corrected it (`resolved`). */
export async function resolveDiscrepancy(uow: UnitOfWork, actor: Actor, input: { discrepancyId: string; outcome: 'accepted' | 'disputed' | 'resolved'; resolution: string; expectedVersion?: number | null }) {
  const resolution = textOf(input.resolution, 'Resolution', 400, true)
  if (!['accepted', 'disputed', 'resolved'].includes(input.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Choose accepted, disputed or resolved.', { field: 'outcome' })
  const row = await transition<{ invoiceId: string; kind: string }>(uow, {
    guard: d => {
      // A header that disagrees with its lines is not settled by a note: the invoice is reversed and entered again (N1).
      if (d.kind === 'total_mismatch' && input.outcome !== 'disputed') throw new DomainError(Codes.GUARD_FAILED, 'The header total does not match the lines. Reverse this invoice and enter it again as billed.')
    },
    model: 'Discrepancy', id: idOf(input.discrepancyId, 'a discrepancy'), from: input.outcome === 'disputed' ? ['open'] : ['open', 'disputed'], to: input.outcome, expectedVersion: input.expectedVersion, actor,
    eventType: `discrepancy.${input.outcome}`, reason: resolution, data: { resolution },
  })
  const openCount = await uow.tx.discrepancy.count({ where: { invoiceId: row.invoiceId, status: { in: ['open', 'disputed'] } } })
  const invoice = await uow.tx.supplierInvoice.findUniqueOrThrow({ where: { id: row.invoiceId }, select: { status: true } })
  if (invoice.status === 'discrepancy' && !openCount) {
    await transition(uow, { model: 'SupplierInvoice', id: row.invoiceId, from: ['discrepancy'], to: 'matched', actor, eventType: 'supplier_invoice.matched', reason: 'Every discrepancy is settled' })
  }
  return { id: input.discrepancyId, invoiceStatus: openCount ? 'discrepancy' : 'matched' }
}

/** Approve for payment. A person with the permission does this (an assistant is refused by the database too); open discrepancies block it. */
export async function approveSupplierInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string; expectedVersion?: number | null }) {
  const open = await uow.tx.discrepancy.count({ where: { invoiceId: idOf(input.invoiceId, 'an invoice'), status: { in: ['open', 'disputed'] } } })
  if (open) throw new DomainError(Codes.GUARD_FAILED, `${open} discrepanc${open === 1 ? 'y is' : 'ies are'} still open on this invoice. Settle them first.`)
  await transition(uow, {
    model: 'SupplierInvoice', id: input.invoiceId, from: ['matched'], to: 'approved', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_invoice.approved', data: { approvedById: actorUserId(actor), approvedAt: uow.now },
    guard: async row => {
      const lines = await uow.tx.supplierInvoiceLine.findMany({ where: { invoiceId: input.invoiceId } })
      const sum = linesTotalMinor(lines)
      if (!lines.length || apart(BigInt(row.totalMinor as bigint), sum)) {
        throw new DomainError(Codes.GUARD_FAILED, `The invoice total is ${cents(BigInt(row.totalMinor as bigint))} but its lines add up to ${cents(sum)}. It cannot be approved for payment; reverse it and enter it again.`, { totalMinor: String(row.totalMinor), linesTotalMinor: sum.toString() })
      }
    },
  })
  return { id: input.invoiceId }
}

/**
 * Reverse an invoice that was entered wrong (N1). Nothing is deleted: the row, its lines and its discrepancies stay, the status
 * becomes `reversed` (final), and what it consumed is given back: the order quantities it matched, and the cores it credited.
 * The supplier's number is then free to be entered again, as billed. An exported invoice is already in the books and is
 * corrected there with a supplier credit, so it cannot be reversed here.
 */
export async function reverseSupplierInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string; reason: string; expectedVersion?: number | null }) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  const id = idOf(input.invoiceId, 'an invoice')
  const row = await transition<{ invoiceNumber: string }>(uow, {
    model: 'SupplierInvoice', id, from: ['received', 'matching', 'matched', 'discrepancy', 'approved'], to: 'reversed', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_invoice.reversed', reason,
    data: { reversedById: actorUserId(actor), reversedAt: uow.now, reversalReason: reason },
  })
  const lines = await uow.tx.supplierInvoiceLine.findMany({ where: { invoiceId: id } })
  let released = 0
  for (const line of lines) {
    if (line.matchStatus === 'unmatched') continue
    // Give back what this line took, newest receipts first, never more than the order line was invoiced.
    const taken = Array.isArray(line.allocations) ? (line.allocations as { orderLineId: string; quantityMilli: number }[]) : line.matchedOrderLineId ? [{ orderLineId: line.matchedOrderLineId, quantityMilli: line.quantityMilli }] : []
    for (const a of taken) {
      const ol = await uow.tx.supplierOrderLine.findUnique({ where: { id: a.orderLineId }, select: { invoicedQuantityMilli: true } })
      const give = Math.min(a.quantityMilli, ol?.invoicedQuantityMilli ?? 0)
      if (give > 0) { await uow.tx.supplierOrderLine.update({ where: { id: a.orderLineId }, data: { invoicedQuantityMilli: { decrement: give } } }); released += give }
    }
  }
  const cores = await uow.tx.coreObligation.findMany({ where: { supplierInvoiceLineId: { in: lines.map(l => l.id) }, status: 'credited' } })
  for (const core of cores) {
    await uow.tx.coreObligation.update({ where: { id: core.id }, data: { status: 'returned', creditedAt: null, supplierInvoiceLineId: null, version: { increment: 1 } } })
    auditCreate(uow, actor, 'CoreObligation', core.id, 'core.credit_reversed', { invoice: row.invoiceNumber }, { reason })
  }
  const open = await uow.tx.discrepancy.findMany({ where: { invoiceId: id, status: { in: ['open', 'disputed'] } }, select: { id: true } })
  for (const d of open) {
    await transition(uow, { model: 'Discrepancy', id: d.id, from: ['open', 'disputed'], to: 'resolved', actor, eventType: 'discrepancy.resolved', reason: `Invoice reversed: ${reason}`, data: { resolution: `Invoice reversed: ${reason}` } })
  }
  return { id, status: 'reversed', releasedQuantityMilli: released, coresReopened: cores.length, discrepanciesClosed: open.length }
}

/** Hand the approved invoice to accounting: a stable export reference and the lines as CSV. */
export async function exportSupplierInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string; expectedVersion?: number | null }) {
  const row = await transition<{ invoiceNumber: string; supplierId: string; totalMinor: bigint }>(uow, {
    model: 'SupplierInvoice', id: idOf(input.invoiceId, 'an invoice'), from: ['approved'], to: 'exported', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_invoice.exported',
    data: row => ({ exportReference: `AP-${String(row.invoiceNumber)}`.slice(0, 80) }),
    guard: async row => {
      // An invoice approved before the header check (VW-EO299-4) is never handed to accounting: it is reversed instead.
      const sum = linesTotalMinor(await uow.tx.supplierInvoiceLine.findMany({ where: { invoiceId: input.invoiceId } }))
      if (apart(BigInt(row.totalMinor as bigint), sum)) throw new DomainError(Codes.GUARD_FAILED, `The invoice total is ${cents(BigInt(row.totalMinor as bigint))} but its lines add up to ${cents(sum)}. Reverse it and enter it again as billed.`)
    },
  })
  const supplier = await uow.tx.supplier.findUniqueOrThrow({ where: { id: row.supplierId }, select: { name: true } })
  const lines = await uow.tx.supplierInvoiceLine.findMany({ where: { invoiceId: input.invoiceId }, orderBy: { createdAt: 'asc' } })
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = ['supplier,invoice,part,quantity,unit_cost,core_credit,extended', ...lines.map(l => [q(supplier.name), q(row.invoiceNumber), q(l.partNumber), l.quantityMilli / 1000, cents(BigInt(l.unitCostMinor)), cents(BigInt(l.coreCreditMinor)), cents(extendMinor(l.quantityMilli, BigInt(l.unitCostMinor)) - BigInt(l.coreCreditMinor))].join(','))].join('\n')
  return { id: input.invoiceId, exportReference: `AP-${row.invoiceNumber}`, csv }
}
