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

export type InvoiceLineInput = { partNumber: string; quantityMilli: number; unitCostMinor: unknown; coreCreditMinor?: unknown }
export type SupplierInvoiceInput = { shopId: string; supplierId: string; invoiceNumber: string; invoiceDate: string; totalMinor: unknown; documentId?: string | null; lines: InvoiceLineInput[] }

export async function recordSupplierInvoice(uow: UnitOfWork, actor: Actor, input: SupplierInvoiceInput) {
  const { tx } = uow
  const number = textOf(input.invoiceNumber, 'Invoice number', 60, true)
  const supplier = await tx.supplier.findUnique({ where: { id: idOf(input.supplierId, 'a supplier') }, select: { id: true, name: true } })
  if (!supplier) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found.', { field: 'supplierId' })
  const date = new Date(`${String(input.invoiceDate).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Enter the invoice date.', { field: 'invoiceDate' })
  const dupe = await tx.supplierInvoice.findFirst({ where: { supplierId: supplier.id, invoiceNumber: { equals: number, mode: 'insensitive' } }, select: { id: true } })
  if (dupe) throw new DomainError(Codes.DUPLICATE, `${supplier.name} invoice ${number} is already recorded.`, { field: 'invoiceNumber', existingId: dupe.id })
  const lines = listOf(input.lines, 'the invoice').map((entry, i) => {
    const l = objectOf(entry, `line ${i + 1}`)
    return { partNumber: textOf(l.partNumber, 'Part number', 60, true), quantityMilli: milliOf(l.quantityMilli, `Quantity on line ${i + 1}`), unitCostMinor: centsOf(l.unitCostMinor, 'Cost'), coreCreditMinor: centsOf(l.coreCreditMinor, 'Core credit', false) }
  })
  const total = centsOf(input.totalMinor, 'Invoice total')
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
    for (const c of open) {
      if (remaining <= 0) break
      const take = Math.min(remaining, c.receivedQuantityMilli - c.invoicedQuantityMilli)
      await tx.supplierOrderLine.update({ where: { id: c.id }, data: { invoicedQuantityMilli: { increment: take } } })
      first ??= c
      remaining -= take
      const diff = BigInt(line.unitCostMinor) - BigInt(c.unitCostMinor)
      if (diff > tolerance) found.push({ kind: 'overcharge', amountMinor: extendMinor(take, diff), detail: `${line.partNumber} was ordered at ${cents(BigInt(c.unitCostMinor))} and billed at ${cents(BigInt(line.unitCostMinor))}.`, lineId: line.id })
    }
    if (remaining > 0) {
      found.push({ kind: 'quantity_mismatch', amountMinor: extendMinor(remaining, BigInt(line.unitCostMinor)), detail: `${line.partNumber}: billed ${line.quantityMilli / 1000}, but only ${(line.quantityMilli - remaining) / 1000} was received and not yet invoiced.`, lineId: line.id })
    }
    const kinds = found.filter(f => f.lineId === line.id)
    await tx.supplierInvoiceLine.update({ where: { id: line.id }, data: { matchedOrderLineId: first?.id ?? null, matchStatus: kinds.length ? 'variance' : 'matched' } })
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
      found.push({ kind: 'core_not_credited', amountMinor: BigInt(core.coreChargeMinor), detail: `The ${core.partNumber} core was returned but invoice ${invoice.invoiceNumber} shows no credit. (core ${core.id})`, lineId: null })
    }
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
  const lineSum = sumMinor(lines.map(l => extendMinor(l.quantityMilli, BigInt(l.unitCostMinor)) - BigInt(l.coreCreditMinor)))
  await transition(uow, { model: 'SupplierInvoice', id: invoice.id, from: ['received', 'matching', 'discrepancy'], to, actor, eventType: `supplier_invoice.${to}`, data: {}, metadata: { newDiscrepancies: created, linesTotalMinor: lineSum.toString() } })
  return { id: invoice.id, status: to, discrepancies: openCount, linesTotalMinor: lineSum.toString(), totalMinor: BigInt(invoice.totalMinor).toString() }
}

/** Decide a discrepancy: the supplier is right (`accepted`), we dispute it, or the supplier corrected it (`resolved`). */
export async function resolveDiscrepancy(uow: UnitOfWork, actor: Actor, input: { discrepancyId: string; outcome: 'accepted' | 'disputed' | 'resolved'; resolution: string; expectedVersion?: number | null }) {
  const resolution = textOf(input.resolution, 'Resolution', 400, true)
  if (!['accepted', 'disputed', 'resolved'].includes(input.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Choose accepted, disputed or resolved.', { field: 'outcome' })
  const row = await transition<{ invoiceId: string }>(uow, {
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
  await transition(uow, { model: 'SupplierInvoice', id: input.invoiceId, from: ['matched'], to: 'approved', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_invoice.approved', data: { approvedById: actorUserId(actor), approvedAt: uow.now } })
  return { id: input.invoiceId }
}

/** Hand the approved invoice to accounting: a stable export reference and the lines as CSV. */
export async function exportSupplierInvoice(uow: UnitOfWork, actor: Actor, input: { invoiceId: string; expectedVersion?: number | null }) {
  const row = await transition<{ invoiceNumber: string; supplierId: string }>(uow, {
    model: 'SupplierInvoice', id: idOf(input.invoiceId, 'an invoice'), from: ['approved'], to: 'exported', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_invoice.exported',
    data: row => ({ exportReference: `AP-${String(row.invoiceNumber)}`.slice(0, 80) }),
  })
  const supplier = await uow.tx.supplier.findUniqueOrThrow({ where: { id: row.supplierId }, select: { name: true } })
  const lines = await uow.tx.supplierInvoiceLine.findMany({ where: { invoiceId: input.invoiceId }, orderBy: { createdAt: 'asc' } })
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = ['supplier,invoice,part,quantity,unit_cost,core_credit,extended', ...lines.map(l => [q(supplier.name), q(row.invoiceNumber), q(l.partNumber), l.quantityMilli / 1000, cents(BigInt(l.unitCostMinor)), cents(BigInt(l.coreCreditMinor)), cents(extendMinor(l.quantityMilli, BigInt(l.unitCostMinor)) - BigInt(l.coreCreditMinor))].join(','))].join('\n')
  return { id: input.invoiceId, exportReference: `AP-${row.invoiceNumber}`, csv }
}
