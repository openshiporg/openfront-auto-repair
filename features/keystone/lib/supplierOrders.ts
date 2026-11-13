import { actorUserId, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import { nextShopReference } from './sequence'
import { itemForPart, postMovement, reservedForJob } from './stock'
import { centsOf, choiceOf, idOf, listOf, milliOf, objectOf, textOf } from './partsInput'
import { sumMinor } from './money'
import { extendMinor } from './stockMath'
import { addDays as addCalendarDays } from './invoiceMath'
import { zonedDate } from '../../../lib/zonedTime'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Quotes, supplier orders, receiving, cores and returns (STATE-MACHINES §9). A job's parts are
 * ordered only once the job is authorized (I-S2); stock replenishment orders are the shop's own call.
 * Money and quantities are whole cents and thousandths. Supplier network calls happen outside these
 * transactions: the order is first marked `placing`, and an ambiguous send ends in `unknown`, which
 * only a resolver (a person, or a status query by the same reference) can close. Nothing re-sends.
 */

const AUTHORIZED_JOB = ['authorized', 'in_progress', 'needs_reauthorization'] as const
const OPEN_ORDER_LINE = ['open', 'partially_received'] as const
const RECEIVABLE_ORDER = ['placed', 'confirmed', 'partially_received'] as const

export async function jobFacts(tx: Tx, jobId: string) {
  const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true, status: true, repairOrder: { select: { shopId: true, roNumber: true } } } })
  if (!job?.repairOrder) throw new DomainError(Codes.NOT_FOUND, 'Job not found.', { field: 'jobId' })
  return { id: job.id, status: job.status, shopId: job.repairOrder.shopId as string, roNumber: job.repairOrder.roNumber }
}

export function requireAuthorizedJob(job: { status: string }, what: string) {
  if (!(AUTHORIZED_JOB as readonly string[]).includes(job.status)) {
    throw new DomainError(Codes.AUTHORIZATION_REQUIRED, `The customer has not authorized this job, so ${what} has to wait.`, { jobStatus: job.status })
  }
}

// ── Quotes ────────────────────────────────────────────────────────────────────

export type QuoteInput = {
  shopId: string; jobId?: string | null; jobLineId?: string | null; supplierId: string; source: 'phone' | 'api' | 'manual'
  partNumber: string; brand?: string; description?: string; unitCostMinor: unknown; listPriceMinor?: unknown; coreChargeMinor?: unknown
  availableQuantityMilli?: number; availability?: string; etaHours?: number; supplierLocation?: string; phoneEvidence?: { spokeTo?: string; note?: string } | null
}

export async function recordPartQuote(uow: UnitOfWork, actor: Actor, input: QuoteInput) {
  const { tx, now } = uow
  const supplier = await tx.supplier.findUnique({ where: { id: idOf(input.supplierId, 'a supplier') }, select: { id: true, active: true, name: true } })
  if (!supplier || !supplier.active) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found or not active.', { field: 'supplierId' })
  const partNumber = textOf(input.partNumber, 'Part number', 60, true)
  const source = choiceOf(input.source, ['phone', 'api', 'manual'] as const, 'Source')
  if (source === 'phone' && !textOf(input.phoneEvidence?.spokeTo, 'Who you spoke to', 80)) {
    throw new DomainError(Codes.INVALID_INPUT, 'For a quote taken by phone, write down who you spoke to.', { field: 'phoneEvidence' })
  }
  if (input.jobId) {
    const job = await jobFacts(tx, input.jobId)
    if (job.shopId !== input.shopId) throw new DomainError(Codes.NOT_FOUND, 'Job not found.', { field: 'jobId' })
  }
  const unitCost = centsOf(input.unitCostMinor, 'Cost')
  const row = await tx.partQuote.create({
    data: {
      shopId: input.shopId, jobId: input.jobId || null, jobLineId: input.jobLineId || null, supplierId: supplier.id, source, partNumber, brand: textOf(input.brand, 'Brand', 60),
      description: textOf(input.description, 'Description', 200), unitCostMinor: unitCost, listPriceMinor: centsOf(input.listPriceMinor, 'List price', false), coreChargeMinor: centsOf(input.coreChargeMinor, 'Core charge', false),
      availableQuantityMilli: Number.isSafeInteger(input.availableQuantityMilli) ? (input.availableQuantityMilli as number) : 0,
      availability: choiceOf(input.availability, ['in_stock_local', 'in_stock_dc', 'special_order', 'unavailable'] as const, 'Availability', 'in_stock_local'),
      etaAt: input.etaHours ? new Date(now.getTime() + Number(input.etaHours) * 3_600_000) : null, supplierLocation: textOf(input.supplierLocation, 'Location', 120),
      validUntil: new Date(now.getTime() + 24 * 3_600_000), phoneEvidence: input.phoneEvidence ? { ...input.phoneEvidence, at: now.toISOString() } : undefined,
      createdById: actorUserId(actor), status: 'received',
    },
  })
  auditCreate(uow, actor, 'PartQuote', row.id, 'part_quote.received', { supplier: supplier.name, partNumber, unitCostMinor: unitCost, source })
  return { id: row.id }
}

/** Choose one quote for a job line; the other open quotes for that part on that job are set aside. */
export async function selectPartQuote(uow: UnitOfWork, actor: Actor, input: { quoteId: string; expectedVersion?: number | null }) {
  const row = await transition<{ id: string; validUntil: Date | null; jobId: string | null; jobLineId: string | null; partNumber: string; shopId: string | null }>(uow, {
    model: 'PartQuote', id: input.quoteId, from: ['received', 'requested'], to: 'selected', expectedVersion: input.expectedVersion, actor, eventType: 'part_quote.selected',
    guard: q => { if (q.validUntil && q.validUntil < uow.now) throw new DomainError(Codes.GUARD_FAILED, 'That quote has expired. Ask the supplier again.') },
  })
  await uow.tx.partQuote.updateMany({
    where: { id: { not: row.id }, status: { in: ['received', 'requested'] }, shopId: row.shopId, jobId: row.jobId, partNumber: row.partNumber, ...(row.jobLineId ? { jobLineId: row.jobLineId } : {}) },
    data: { status: 'rejected', version: { increment: 1 } },
  })
  return { id: row.id }
}

// ── Orders ────────────────────────────────────────────────────────────────────

export type OrderLineInput = { partQuoteId?: string | null; partNumber?: string; brand?: string; description?: string; quantityMilli: number; unitCostMinor?: unknown; coreChargeMinor?: unknown; jobId?: string | null; jobLineId?: string | null }
export type OrderInput = { shopId: string; supplierId: string; kind?: 'job' | 'stock'; lines: OrderLineInput[]; deliveryNote?: string }

export async function createSupplierOrder(uow: UnitOfWork, actor: Actor, input: OrderInput) {
  const { tx, now } = uow
  const kind = choiceOf(input.kind, ['job', 'stock'] as const, 'Kind', 'job')
  const supplier = await tx.supplier.findUnique({ where: { id: idOf(input.supplierId, 'a supplier') }, select: { id: true, active: true, name: true } })
  if (!supplier?.active) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found or not active.', { field: 'supplierId' })
  const shop = await tx.shop.findUnique({ where: { id: input.shopId }, select: { id: true, code: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Shop not found.', { field: 'shopId' })
  const raw = listOf(input.lines, 'the order')
  const prepared: { jobId: string | null; jobLineId: string | null; partQuoteId: string | null; partNumber: string; brand: string; description: string; quantityMilli: number; unitCostMinor: bigint; coreChargeMinor: bigint }[] = []
  const checkedJobs = new Map<string, Awaited<ReturnType<typeof jobFacts>>>()
  for (const [i, entry] of raw.entries()) {
    const line = objectOf(entry, `line ${i + 1}`) as OrderLineInput
    const quote = line.partQuoteId ? await tx.partQuote.findUnique({ where: { id: line.partQuoteId } }) : null
    if (line.partQuoteId && (!quote || quote.supplierId !== supplier.id || quote.shopId !== shop.id)) throw new DomainError(Codes.INVALID_INPUT, `Line ${i + 1} uses a quote from another supplier or shop.`, { field: 'lines' })
    const partNumber = textOf(line.partNumber || quote?.partNumber, 'Part number', 60, true)
    const jobId = line.jobId || quote?.jobId || null
    if (kind === 'job') {
      if (!jobId) throw new DomainError(Codes.INVALID_INPUT, `Line ${i + 1} needs the job it is for.`, { field: 'lines' })
      const job = checkedJobs.get(jobId) ?? await jobFacts(tx, jobId)
      checkedJobs.set(jobId, job)
      if (job.shopId !== shop.id) throw new DomainError(Codes.NOT_FOUND, 'Job not found.', { field: 'lines' })
      requireAuthorizedJob(job, 'ordering its parts')
    }
    prepared.push({
      jobId: kind === 'job' ? jobId : null, jobLineId: line.jobLineId || quote?.jobLineId || null, partQuoteId: quote?.id ?? null, partNumber,
      brand: textOf(line.brand ?? quote?.brand, 'Brand', 60), description: textOf(line.description ?? quote?.description, 'Description', 200) || partNumber,
      quantityMilli: milliOf(line.quantityMilli, `Quantity on line ${i + 1}`),
      unitCostMinor: line.unitCostMinor !== undefined ? centsOf(line.unitCostMinor, 'Cost') : (quote?.unitCostMinor ?? centsOf(undefined, 'Cost')),
      coreChargeMinor: line.coreChargeMinor !== undefined ? centsOf(line.coreChargeMinor, 'Core charge', false) : (quote?.coreChargeMinor ?? 0n),
    })
  }
  const reference = await nextShopReference(tx, 'PO', shop.code, now, 5)
  const total = sumMinor(prepared.map(l => extendMinor(l.quantityMilli, l.unitCostMinor)))
  const order = await tx.supplierOrder.create({ data: { shopId: shop.id, supplierId: supplier.id, reference, kind, totalMinor: total, deliveryNote: textOf(input.deliveryNote, 'Delivery note', 300), createdById: actorUserId(actor), status: 'draft' } })
  for (const l of prepared) {
    const shopItemId = await itemForPart(uow, actor, shop.id, { partNumber: l.partNumber, brand: l.brand, description: l.description, coreChargeMinor: l.coreChargeMinor })
    await tx.supplierOrderLine.create({ data: { orderId: order.id, ...l, shopItemId, status: 'open' } })
    if (l.partQuoteId) await tx.partQuote.updateMany({ where: { id: l.partQuoteId, status: { in: ['received', 'requested'] } }, data: { status: 'selected', version: { increment: 1 } } })
  }
  auditCreate(uow, actor, 'SupplierOrder', order.id, 'supplier_order.drafted', { reference, supplier: supplier.name, kind, lines: prepared.length, totalMinor: total })
  return { id: order.id, reference, totalMinor: total.toString() }
}

/** First half of placing: draft → placing. The caller then talks to the supplier outside any transaction. */
export async function beginPlacing(uow: UnitOfWork, actor: Actor, input: { orderId: string; expectedVersion?: number | null }) {
  const order = await transition<{ reference: string; supplierId: string; kind: string; shopId: string }>(uow, {
    model: 'SupplierOrder', id: input.orderId, from: ['draft', 'failed'], to: 'placing', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_order.placing',
    guard: async () => {
      const lines = await uow.tx.supplierOrderLine.findMany({ where: { orderId: input.orderId }, select: { jobId: true } })
      if (!lines.length) throw new DomainError(Codes.GUARD_FAILED, 'This order has no lines.')
      // I-R1: an order for a job can go out only while that job is still authorized.
      for (const jobId of new Set(lines.map(l => l.jobId).filter((v): v is string => Boolean(v)))) requireAuthorizedJob(await jobFacts(uow.tx, jobId), 'ordering its parts')
    },
  })
  const supplier = await uow.tx.supplier.findUniqueOrThrow({ where: { id: order.supplierId }, select: { name: true, adapter: true } })
  const lines = await uow.tx.supplierOrderLine.findMany({ where: { orderId: input.orderId }, orderBy: { createdAt: 'asc' } })
  return { reference: order.reference, supplierName: supplier.name, adapter: supplier.adapter, lines: lines.map(l => ({ partNumber: l.partNumber, quantityMilli: l.quantityMilli, unitCostMinor: l.unitCostMinor })) }
}

async function putOnOrder(uow: UnitOfWork, actor: Actor, orderId: string) {
  const lines = await uow.tx.supplierOrderLine.findMany({ where: { orderId, status: { in: [...OPEN_ORDER_LINE] } }, orderBy: { createdAt: 'asc' } })
  for (const l of lines) if (l.shopItemId) await postMovement(uow, actor, { shopItemId: l.shopItemId, type: 'po_order', quantityMilli: l.quantityMilli - l.receivedQuantityMilli, supplierOrderLineId: l.id, jobId: l.jobId, key: `po-order:${l.id}`, reason: 'Order placed' })
}

/** Second half: the supplier took it (`placed`), did not answer clearly (`unknown`) or refused (`failed`). */
export async function finishPlacing(uow: UnitOfWork, actor: Actor, input: { orderId: string; outcome: 'placed' | 'unknown' | 'failed'; placedVia: string; supplierConfirmation?: string; detail?: string; etaAt?: Date | null }) {
  const { now } = uow
  const to = input.outcome
  const row = await transition<{ reference: string }>(uow, {
    model: 'SupplierOrder', id: input.orderId, from: ['placing'], to, actor, eventType: `supplier_order.${to}`, reason: input.detail ?? null,
    data: to === 'placed' ? { placedAt: now, placedVia: input.placedVia, supplierConfirmation: textOf(input.supplierConfirmation, 'Confirmation', 80), etaAt: input.etaAt ?? null } : { placedVia: input.placedVia },
  })
  if (to === 'placed') await putOnOrder(uow, actor, input.orderId)
  return { id: input.orderId, reference: row.reference, status: to }
}

/** A person records an order placed by phone or at the counter: draft → placed in one step. */
export async function recordManualPlacement(uow: UnitOfWork, actor: Actor, input: { orderId: string; spokeTo?: string; supplierConfirmation?: string; etaHours?: number; expectedVersion?: number | null }) {
  if (!textOf(input.spokeTo, 'Who you spoke to', 80)) throw new DomainError(Codes.INVALID_INPUT, 'Write down who took the order.', { field: 'spokeTo' })
  await beginPlacing(uow, actor, { orderId: input.orderId, expectedVersion: input.expectedVersion })
  return finishPlacing(uow, actor, {
    orderId: input.orderId, outcome: 'placed', placedVia: 'phone', supplierConfirmation: input.supplierConfirmation, detail: `Taken by ${textOf(input.spokeTo, 'Who you spoke to', 80)}`,
    etaAt: input.etaHours ? new Date(uow.now.getTime() + input.etaHours * 3_600_000) : null,
  })
}

/** The unknown-order resolver. `found` means the supplier has the order; `not_found` returns it to draft so it can go once more. */
export async function resolveUnknownOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; found: boolean; supplierConfirmation?: string; note: string; expectedVersion?: number | null }) {
  const note = textOf(input.note, 'Note', 300, true)
  const to = input.found ? 'placed' : 'draft'
  const row = await transition<{ reference: string }>(uow, {
    model: 'SupplierOrder', id: input.orderId, from: ['unknown'], to, expectedVersion: input.expectedVersion, actor, eventType: 'supplier_order.unknown_resolved', reason: note,
    data: input.found ? { placedAt: uow.now, supplierConfirmation: textOf(input.supplierConfirmation, 'Confirmation', 80) } : {},
  })
  if (input.found) await putOnOrder(uow, actor, input.orderId)
  return { id: input.orderId, reference: row.reference, status: to }
}

export async function confirmSupplierOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; supplierConfirmation?: string; etaAt?: Date | null; expectedVersion?: number | null }) {
  await transition(uow, {
    model: 'SupplierOrder', id: input.orderId, from: ['placed'], to: 'confirmed', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_order.confirmed',
    data: { supplierConfirmation: textOf(input.supplierConfirmation, 'Confirmation', 80), ...(input.etaAt ? { etaAt: input.etaAt } : {}) },
  })
  return { id: input.orderId }
}

export async function cancelSupplierOrder(uow: UnitOfWork, actor: Actor, input: { orderId: string; reason: string; expectedVersion?: number | null }) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  const was = await lockRow<{ status: string }>(uow.tx, 'SupplierOrder', input.orderId)
  await transition(uow, { model: 'SupplierOrder', id: input.orderId, from: ['draft', 'failed', 'placed', 'confirmed', 'partially_received'], to: 'cancelled', expectedVersion: input.expectedVersion, actor, eventType: 'supplier_order.cancelled', reason })
  if (!['draft', 'failed'].includes(was.status)) {
    const lines = await uow.tx.supplierOrderLine.findMany({ where: { orderId: input.orderId, status: { in: [...OPEN_ORDER_LINE] } } })
    for (const l of lines) {
      const left = l.quantityMilli - l.receivedQuantityMilli
      if (left > 0 && l.shopItemId) await postMovement(uow, actor, { shopItemId: l.shopItemId, type: 'po_cancel', quantityMilli: left, supplierOrderLineId: l.id, jobId: l.jobId, key: `po-cancel:${l.id}`, reason })
    }
  }
  await uow.tx.supplierOrderLine.updateMany({ where: { orderId: input.orderId, status: { in: [...OPEN_ORDER_LINE] } }, data: { status: 'cancelled' } })
  return { id: input.orderId }
}

// ── Receiving ─────────────────────────────────────────────────────────────────

export type ReceiveInput = { orderId: string; receiptKey: string; packingSlipDocumentId?: string | null; lines: { orderLineId: string; quantityMilli: number; condition?: string }[] }

/**
 * Receive against an order. The receipt key makes it safe to retry: the same key returns the same
 * receipt and moves no stock twice. Good parts go on the shelf at the price paid; a part with a core
 * charge makes a CoreObligation due back to the supplier; a part meant for a job is reserved for it.
 */
export async function receiveSupplierOrder(uow: UnitOfWork, actor: Actor, input: ReceiveInput) {
  const { tx, now } = uow
  const key = textOf(input.receiptKey, 'Receipt key', 80, true)
  const earlier = await tx.receipt.findUnique({ where: { receiptKey: key }, select: { id: true } })
  if (earlier) return { receiptId: earlier.id, replay: true, received: 0 }
  const order = await lockRow<{ id: string; status: string; supplierId: string; shopId: string; reference: string; version: number }>(tx, 'SupplierOrder', idOf(input.orderId, 'an order'))
  if (!(RECEIVABLE_ORDER as readonly string[]).includes(order.status)) throw new DomainError(Codes.INVALID_TRANSITION, `An order that is ${order.status.replace(/_/g, ' ')} cannot be received against.`, { currentStatus: order.status })
  const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: order.supplierId }, select: { coreReturnWindowDays: true } })
  const receipt = await tx.receipt.create({ data: { orderId: order.id, receiptKey: key, receivedById: actorUserId(actor), at: now, packingSlipId: input.packingSlipDocumentId || null } })
  let received = 0
  for (const entry of listOf(input.lines, 'the receipt')) {
    const line = objectOf(entry, 'a receipt line')
    const orderLine = await lockRow<Record<string, any>>(tx, 'SupplierOrderLine', idOf(line.orderLineId, 'an order line'))
    if (orderLine.orderId !== order.id) throw new DomainError(Codes.INVALID_INPUT, 'That line is not on this order.', { field: 'orderLineId' })
    const qty = milliOf(line.quantityMilli, 'Quantity received')
    const condition = choiceOf(line.condition, ['ok', 'damaged', 'wrong_part'] as const, 'Condition', 'ok')
    const left = orderLine.quantityMilli - orderLine.receivedQuantityMilli
    if (qty > left) throw new DomainError(Codes.GUARD_FAILED, `Only ${left / 1000} of ${orderLine.partNumber} is still due.`, { field: 'quantityMilli' })
    await tx.receiptLine.create({ data: { receiptId: receipt.id, orderLineId: orderLine.id, quantityMilli: qty, condition } })
    if (condition !== 'ok') {
      auditCreate(uow, actor, 'Receipt', receipt.id, 'receipt.line_refused', { partNumber: orderLine.partNumber, quantityMilli: qty, condition })
      continue
    }
    received += qty
    const newReceived = orderLine.receivedQuantityMilli + qty
    await tx.supplierOrderLine.update({ where: { id: orderLine.id }, data: { receivedQuantityMilli: newReceived, status: newReceived >= orderLine.quantityMilli ? 'received' : 'partially_received' } })
    if (orderLine.shopItemId) {
      await postMovement(uow, actor, { shopItemId: orderLine.shopItemId, type: 'receipt', quantityMilli: qty, unitCostMinor: BigInt(orderLine.unitCostMinor), supplierOrderLineId: orderLine.id, jobId: orderLine.jobId, key: `receipt:${receipt.id}:${orderLine.id}`, reason: `Received on ${order.reference}` })
      if (orderLine.jobId) await postMovement(uow, actor, { shopItemId: orderLine.shopItemId, type: 'commit', quantityMilli: qty, jobId: orderLine.jobId, key: `commit:${receipt.id}:${orderLine.id}`, reason: 'Held for the job' })
    }
    const core = BigInt(orderLine.coreChargeMinor)
    if (core > 0n) await addCoreOwed(uow, actor, { shopId: order.shopId, supplierId: order.supplierId, orderLine, quantityMilli: qty, windowDays: supplier.coreReturnWindowDays })
  }
  const lines = await tx.supplierOrderLine.findMany({ where: { orderId: order.id, status: { not: 'cancelled' } }, select: { quantityMilli: true, receivedQuantityMilli: true } })
  const complete = lines.every(l => l.receivedQuantityMilli >= l.quantityMilli)
  const to = complete ? 'received' : 'partially_received'
  if (received > 0 && order.status !== to) await transition(uow, { model: 'SupplierOrder', id: order.id, from: [...RECEIVABLE_ORDER], to, actor, eventType: `supplier_order.${to}` })
  auditCreate(uow, actor, 'Receipt', receipt.id, 'receipt.recorded', { order: order.reference, goodQuantityMilli: received, receiptKey: key })
  return { receiptId: receipt.id, replay: false, received, orderStatus: received > 0 ? to : order.status }
}

// ── Cores ─────────────────────────────────────────────────────────────────────

async function addCoreOwed(uow: UnitOfWork, actor: Actor, a: { shopId: string; supplierId: string; orderLine: Record<string, any>; quantityMilli: number; windowDays: number }) {
  const { tx, now } = uow
  const amount = extendMinor(a.quantityMilli, BigInt(a.orderLine.coreChargeMinor))
  const existing = await tx.coreObligation.findFirst({ where: { supplierOrderLineId: a.orderLine.id, status: 'owed' } })
  if (existing) {
    await tx.coreObligation.update({ where: { id: existing.id }, data: { coreChargeMinor: { increment: amount } } })
    return
  }
  // The return window runs in the shop's days (M1): today there, plus the window, stored as a calendar day.
  const zone = (await tx.shop.findUnique({ where: { id: a.shopId }, select: { timeZone: true } }))?.timeZone || 'America/Los_Angeles'
  const dueAt = new Date(`${addCalendarDays(zonedDate(zone, now), a.windowDays)}T00:00:00.000Z`)
  const row = await tx.coreObligation.create({
    data: {
      shopId: a.shopId, supplierId: a.supplierId, jobId: a.orderLine.jobId, jobLineId: a.orderLine.jobLineId ?? null, shopItemId: a.orderLine.shopItemId, partNumber: a.orderLine.partNumber,
      supplierOrderLineId: a.orderLine.id, coreChargeMinor: amount, owedTo: 'supplier', dueAt, status: 'owed',
    },
  })
  auditCreate(uow, actor, 'CoreObligation', row.id, 'core.owed', { partNumber: a.orderLine.partNumber, coreChargeMinor: amount, dueAt: dueAt.toISOString().slice(0, 10) })
}

/** The old part went back to the supplier. */
export async function markCoreReturned(uow: UnitOfWork, actor: Actor, input: { coreId: string; note?: string; documentId?: string | null; expectedVersion?: number | null }) {
  await transition(uow, {
    model: 'CoreObligation', id: input.coreId, from: ['owed'], to: 'returned', expectedVersion: input.expectedVersion, actor, eventType: 'core.returned',
    data: { returnedAt: uow.now, returnNote: textOf(input.note, 'Note', 300), returnDocumentId: input.documentId || null },
  })
  return { id: input.coreId }
}

export type ApprovalGate = (uow: UnitOfWork, actor: Actor, a: { action: string; targetList: string; targetId: string; payload: unknown; summary: string; approvalRequestId?: string | null }) => Promise<{ approved: boolean; approvalRequestId: string }>

/** Write off a core the supplier never credited. A manager approves it first. */
export async function writeOffCore(uow: UnitOfWork, actor: Actor, input: { coreId: string; reason: string; approvalRequestId?: string | null; expectedVersion?: number | null }, gate: ApprovalGate) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  if (reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why it is written off.', { field: 'reason' })
  const core = await lockRow<Record<string, any>>(uow.tx, 'CoreObligation', idOf(input.coreId, 'a core'))
  if (!['owed', 'returned'].includes(core.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A core that is ${core.status.replace(/_/g, ' ')} cannot be written off.`, { currentStatus: core.status })
  const g = await gate(uow, actor, { action: 'core.write_off', targetList: 'CoreObligation', targetId: core.id, payload: { coreId: core.id, coreChargeMinor: core.coreChargeMinor.toString(), reason }, summary: `Write off core on ${core.partNumber}: ${reason}`, approvalRequestId: input.approvalRequestId })
  if (!g.approved) return { approvalRequired: true as const, approvalRequestId: g.approvalRequestId }
  await transition(uow, { model: 'CoreObligation', id: core.id, from: ['owed', 'returned'], to: 'written_off', expectedVersion: input.expectedVersion, actor, eventType: 'core.written_off', reason, data: { writeOffReason: reason, approvalId: g.approvalRequestId } })
  return { approvalRequired: false as const, id: core.id }
}

// ── Returns to the supplier ───────────────────────────────────────────────────

export async function createSupplierReturn(uow: UnitOfWork, actor: Actor, input: { shopId: string; supplierId: string; rmaNumber?: string; reason: string; lines: { shopItemId: string; quantityMilli: number }[] }) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  const supplier = await uow.tx.supplier.findUnique({ where: { id: idOf(input.supplierId, 'a supplier') }, select: { id: true, name: true } })
  if (!supplier) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found.', { field: 'supplierId' })
  const row = await uow.tx.supplierReturn.create({ data: { shopId: input.shopId, supplierId: supplier.id, rmaNumber: textOf(input.rmaNumber, 'RMA', 60), reason, status: 'requested', lines: [] } })
  const saved: { shopItemId: string; quantityMilli: number; unitCostMinor: string }[] = []
  let credit = 0n
  for (const entry of listOf(input.lines, 'the return')) {
    const l = objectOf(entry, 'a return line')
    const qty = milliOf(l.quantityMilli, 'Quantity')
    const moved = await postMovement(uow, actor, { shopItemId: idOf(l.shopItemId, 'a part'), type: 'return_to_supplier', quantityMilli: qty, key: `return:${row.id}:${l.shopItemId}`, reason: `Returned to ${supplier.name}: ${reason}` })
    saved.push({ shopItemId: l.shopItemId, quantityMilli: qty, unitCostMinor: moved.unitCostMinor.toString() })
    credit += extendMinor(qty, moved.unitCostMinor)
  }
  await uow.tx.supplierReturn.update({ where: { id: row.id }, data: { lines: saved, creditMinor: credit } })
  auditCreate(uow, actor, 'SupplierReturn', row.id, 'supplier_return.requested', { supplier: supplier.name, lines: saved.length, expectedCreditMinor: credit }, { reason })
  return { id: row.id, expectedCreditMinor: credit.toString() }
}

export async function advanceSupplierReturn(uow: UnitOfWork, actor: Actor, input: { returnId: string; to: 'shipped' | 'credited' | 'rejected'; expectedVersion?: number | null }) {
  const from = input.to === 'shipped' ? ['requested'] : ['requested', 'shipped']
  await transition(uow, { model: 'SupplierReturn', id: input.returnId, from, to: input.to, expectedVersion: input.expectedVersion, actor, eventType: `supplier_return.${input.to}` })
  return { id: input.returnId }
}

// ── Issuing parts to a job (I-S2) ────────────────────────────────────────────

/** Reserve shelf stock for an authorized job. */
export async function reservePartForJob(uow: UnitOfWork, actor: Actor, input: { jobId: string; shopItemId: string; quantityMilli: number; key: string }) {
  const job = await jobFacts(uow.tx, input.jobId)
  requireAuthorizedJob(job, 'reserving its parts')
  const moved = await postMovement(uow, actor, { shopItemId: input.shopItemId, type: 'commit', quantityMilli: milliOf(input.quantityMilli, 'Quantity'), jobId: job.id, key: input.key, reason: `Held for ${job.roNumber}` })
  return { movementId: moved.movementId, replay: moved.replay }
}

/** Take parts off the shelf onto an authorized job at the weighted-average cost. What the job reserved is used first. */
export async function issuePartToJob(uow: UnitOfWork, actor: Actor, input: { jobId: string; shopItemId: string; quantityMilli: number; key: string }) {
  const job = await jobFacts(uow.tx, input.jobId)
  requireAuthorizedJob(job, 'issuing its parts')
  const qty = milliOf(input.quantityMilli, 'Quantity')
  const reserved = await reservedForJob(uow, job.id, input.shopItemId)
  const moved = await postMovement(uow, actor, { shopItemId: input.shopItemId, type: 'issue', quantityMilli: qty, fromCommittedMilli: Math.min(reserved, qty), jobId: job.id, key: input.key, reason: `Issued to ${job.roNumber}` })
  return { movementId: moved.movementId, replay: moved.replay, unitCostMinor: moved.unitCostMinor.toString(), extendedCostMinor: extendMinor(qty, moved.unitCostMinor).toString() }
}

/** An unused part comes back from the job to the shelf at the cost it left with. */
export async function returnPartFromJob(uow: UnitOfWork, actor: Actor, input: { jobId: string; shopItemId: string; quantityMilli: number; key: string }) {
  const job = await jobFacts(uow.tx, input.jobId)
  const issued = await uow.tx.stockMovement.aggregate({ where: { jobId: job.id, shopItemId: input.shopItemId, type: { in: ['issue', 'return_to_stock'] } }, _sum: { onHandDeltaMilli: true } })
  const outstanding = -(issued._sum.onHandDeltaMilli ?? 0)
  const qty = milliOf(input.quantityMilli, 'Quantity')
  if (qty > outstanding) throw new DomainError(Codes.GUARD_FAILED, `Only ${Math.max(outstanding, 0) / 1000} was issued to this job.`, { field: 'quantityMilli' })
  const moved = await postMovement(uow, actor, { shopItemId: input.shopItemId, type: 'return_to_stock', quantityMilli: qty, jobId: job.id, key: input.key, reason: `Returned from ${job.roNumber}` })
  return { movementId: moved.movementId, replay: moved.replay }
}
