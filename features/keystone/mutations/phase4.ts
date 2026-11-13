import { actorFromSession, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { needApproval } from '../lib/settlement'
import { requireShop } from './phase1'
import { adjustStock, postCycleCount, recordCounts, startCycleCount } from '../lib/cycleCounts'
import { releaseJobReservations, saveShopItem, type ItemInput } from '../lib/stock'
import {
  advanceSupplierReturn, beginPlacing, cancelSupplierOrder, confirmSupplierOrder, createSupplierOrder, createSupplierReturn, finishPlacing, issuePartToJob, markCoreReturned,
  receiveSupplierOrder, recordManualPlacement, recordPartQuote, reservePartForJob, resolveUnknownOrder, returnPartFromJob, selectPartQuote, writeOffCore,
  type ApprovalGate, type OrderInput, type QuoteInput, type ReceiveInput,
} from '../lib/supplierOrders'
import { approveSupplierInvoice, exportSupplierInvoice, matchSupplierInvoice, recordSupplierInvoice, resolveDiscrepancy, reverseSupplierInvoice, type SupplierInvoiceInput } from '../lib/supplierInvoices'
import { completeTireRegistration, confirmTireRegistration, recordJobTire } from '../lib/tires'
import { AmbiguousSendError, supplierAdapter, supplierHasApi, type QuoteRequest } from '../../integrations/parts-supplier'
import { textOf } from '../lib/partsInput'
import type { Permission } from '../access'

type Ctx = { session: any; prisma: any }
type Args = Record<string, any>

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

const PARTS: Permission[] = ['canManageParts', 'canOrderParts', 'canReceiveParts']
const gate: ApprovalGate = (uow, actor, a) => needApproval(uow, actor, { ...a, permission: a.action === 'core.write_off' ? 'canApproveCoreWriteOff' : a.action === 'supplier_invoice.approve' ? 'canApproveSupplierInvoice' : 'canApproveStockAdjustment' })

type Model = 'supplierOrder' | 'supplierInvoice' | 'cycleCount' | 'coreObligation' | 'supplierReturn' | 'shopItem' | 'partQuote' | 'discrepancy' | 'tireRegistrationObligation' | 'job'
/** The shop a record belongs to, checked against the caller's shops. */
async function shopOf(context: Ctx, model: Model, id: unknown) {
  if (typeof id !== 'string' || !id) throw new DomainError(Codes.INVALID_INPUT, 'Choose a record.')
  let shopId: string | null | undefined
  if (model === 'job') shopId = (await context.prisma.job.findUnique({ where: { id }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId
  else if (model === 'discrepancy') shopId = (await context.prisma.discrepancy.findUnique({ where: { id }, select: { invoice: { select: { shopId: true } } } }))?.invoice?.shopId
  else shopId = (await context.prisma[model].findUnique({ where: { id }, select: { shopId: true } }))?.shopId
  if (!shopId) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  return requireShop(context, shopId)
}

// ── Suppliers, items, quotes ──────────────────────────────────────────────────

export async function saveShopPartItem(_root: unknown, args: { input: ItemInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts')
  const input = args.input ?? ({} as ItemInput)
  if (input.id) await shopOf(context, 'shopItem', input.id)
  requireShop(context, input.shopId)
  return run(context, actor, 'item.save', args.idempotencyKey, input, uow => saveShopItem(uow, actor, input))
}

/** Ask a supplier for a price. A supplier with an API answers; any other supplier is quoted by phone and the price recorded. */
export async function requestSupplierQuote(_root: unknown, args: { shopId: string; supplierId: string; partNumber: string; quantityMilli: number; jobId?: string | null; jobLineId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts', 'canManageParts')
  requireShop(context, args.shopId)
  if (args.jobId) await shopOf(context, 'job', args.jobId)
  const supplier = await context.prisma.supplier.findUnique({ where: { id: args.supplierId }, select: { name: true, adapter: true, active: true } })
  if (!supplier?.active) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found.', { field: 'supplierId' })
  const request: QuoteRequest = { partNumber: textOf(args.partNumber, 'Part number', 60, true), quantityMilli: args.quantityMilli }
  const answer = await supplierAdapter(supplier.adapter, supplier.name).quote(request)
  if (!answer) return { found: false, message: !supplierHasApi() ? `${supplier.name} is quoted by phone. Record the price they gave you.` : `${supplier.name} does not carry ${request.partNumber}.` }
  const made = await run(context, actor, 'quote.record', args.idempotencyKey, args, uow => recordPartQuote(uow, actor, {
    shopId: args.shopId, jobId: args.jobId, jobLineId: args.jobLineId, supplierId: args.supplierId, source: 'api', partNumber: answer.partNumber, brand: answer.brand, description: answer.description,
    unitCostMinor: answer.unitCostMinor.toString(), listPriceMinor: answer.listPriceMinor.toString(), coreChargeMinor: answer.coreChargeMinor.toString(), availableQuantityMilli: answer.availableQuantityMilli,
    availability: answer.availability, etaHours: answer.etaHours, supplierLocation: answer.location,
  }))
  return { found: true, ...made }
}

export async function recordSupplierQuote(_root: unknown, args: { input: QuoteInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts', 'canManageParts')
  const input = args.input ?? ({} as QuoteInput)
  requireShop(context, input.shopId)
  return run(context, actor, 'quote.record', args.idempotencyKey, input, uow => recordPartQuote(uow, actor, input))
}

export async function selectSupplierQuote(_root: unknown, args: { quoteId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts', 'canManageParts')
  await shopOf(context, 'partQuote', args.quoteId)
  return run(context, actor, 'quote.select', args.idempotencyKey, args, uow => selectPartQuote(uow, actor, { quoteId: args.quoteId, expectedVersion: args.expectedVersion }))
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function createShopSupplierOrder(_root: unknown, args: { input: OrderInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts')
  const input = args.input ?? ({} as OrderInput)
  requireShop(context, input.shopId)
  return run(context, actor, 'supplier_order.create', args.idempotencyKey, input, uow => createSupplierOrder(uow, actor, input))
}

/**
 * Send the order to the supplier. Three steps, none holding a transaction open across the network:
 * mark `placing`; call the supplier once; record the outcome. A timeout becomes `unknown`: nothing sends it again.
 */
export async function placeSupplierOrder(_root: unknown, args: { orderId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts')
  await shopOf(context, 'supplierOrder', args.orderId)
  const begun = await run(context, actor, 'supplier_order.begin', `${args.idempotencyKey}:begin`, args, uow => beginPlacing(uow, actor, { orderId: args.orderId, expectedVersion: args.expectedVersion }))
  const order = await context.prisma.supplierOrder.findUniqueOrThrow({ where: { id: args.orderId }, select: { status: true, reference: true } })
  // A retry after the outcome was recorded must not call the supplier again.
  if (order.status !== 'placing') return { id: args.orderId, reference: order.reference, status: order.status, replay: true }
  if (!supplierHasApi()) {
    throw new DomainError(Codes.PROVIDER_UNAVAILABLE, `${begun.supplierName} takes orders by phone. Call them, then record who took the order.`)
  }
  let outcome: 'placed' | 'unknown' | 'failed' = 'placed'
  let confirmation = ''
  let detail = ''
  try {
    const sent = await supplierAdapter(begun.adapter, begun.supplierName).placeOrder({ reference: begun.reference, lines: begun.lines })
    confirmation = sent.supplierOrderId
  } catch (error) {
    // A timeout may have reached the supplier. Only a clear refusal is a failure.
    outcome = error instanceof AmbiguousSendError ? 'unknown' : 'failed'
    detail = error instanceof Error ? error.message.slice(0, 200) : 'The supplier did not take the order.'
  }
  const done = await run(context, actor, 'supplier_order.finish', `${args.idempotencyKey}:finish`, { ...args, outcome }, uow => finishPlacing(uow, actor, { orderId: args.orderId, outcome, placedVia: begun.adapter, supplierConfirmation: confirmation, detail }))
  return { ...done, message: outcome === 'unknown' ? 'The supplier did not answer. Check with them before sending again.' : undefined }
}

export async function recordPhoneOrder(_root: unknown, args: { orderId: string; spokeTo: string; supplierConfirmation?: string; etaHours?: number; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts')
  await shopOf(context, 'supplierOrder', args.orderId)
  return run(context, actor, 'supplier_order.phone', args.idempotencyKey, args, uow => recordManualPlacement(uow, actor, args))
}

/** Close an `unknown` order. With no answer given, the supplier is asked for its record of the reference. */
export async function resolveUnknownSupplierOrder(_root: unknown, args: { orderId: string; found?: boolean | null; supplierConfirmation?: string; note: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts')
  requireHuman(actor, 'resolve an order the supplier never confirmed')
  await shopOf(context, 'supplierOrder', args.orderId)
  let found = args.found
  let confirmation = args.supplierConfirmation
  if (found === undefined || found === null) {
    const order = await context.prisma.supplierOrder.findUniqueOrThrow({ where: { id: args.orderId }, select: { reference: true, supplier: { select: { name: true, adapter: true } } } })
    const status = await supplierAdapter(order.supplier.adapter, order.supplier.name).orderStatus(order.reference).catch(() => { throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'Call the supplier and tell us what they have.') })
    found = status.state === 'placed'
    confirmation = status.supplierOrderId ?? confirmation
  }
  const answer = found
  return run(context, actor, 'supplier_order.resolve', args.idempotencyKey, { ...args, found: answer }, uow => resolveUnknownOrder(uow, actor, { orderId: args.orderId, found: answer, supplierConfirmation: confirmation, note: args.note, expectedVersion: args.expectedVersion }))
}

export async function confirmShopSupplierOrder(_root: unknown, args: { orderId: string; supplierConfirmation?: string; etaAt?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts')
  await shopOf(context, 'supplierOrder', args.orderId)
  return run(context, actor, 'supplier_order.confirm', args.idempotencyKey, args, uow => confirmSupplierOrder(uow, actor, { orderId: args.orderId, supplierConfirmation: args.supplierConfirmation, etaAt: args.etaAt ? new Date(args.etaAt) : null, expectedVersion: args.expectedVersion }))
}

export async function cancelShopSupplierOrder(_root: unknown, args: { orderId: string; reason: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canOrderParts')
  await shopOf(context, 'supplierOrder', args.orderId)
  return run(context, actor, 'supplier_order.cancel', args.idempotencyKey, args, uow => cancelSupplierOrder(uow, actor, args))
}

export async function receiveShopSupplierOrder(_root: unknown, args: { input: ReceiveInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReceiveParts')
  const input = args.input ?? ({} as ReceiveInput)
  await shopOf(context, 'supplierOrder', input.orderId)
  return run(context, actor, 'supplier_order.receive', args.idempotencyKey, input, uow => receiveSupplierOrder(uow, actor, { ...input, receiptKey: input.receiptKey || args.idempotencyKey }))
}

// ── Stock ─────────────────────────────────────────────────────────────────────

export async function releaseShopJobReservations(_root: unknown, args: { jobId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...PARTS)
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'stock.release_job', args.idempotencyKey, args, async uow => ({ releasedMilli: await releaseJobReservations(uow, actor, args.jobId, `Released: ${textOf(args.reason, 'Reason', 200, true)}`) }))
}

export async function reserveJobPart(_root: unknown, args: { jobId: string; shopItemId: string; quantityMilli: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...PARTS)
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'stock.reserve', args.idempotencyKey, args, uow => reservePartForJob(uow, actor, { ...args, key: `reserve:${args.idempotencyKey}` }))
}

export async function issueJobPart(_root: unknown, args: { jobId: string; shopItemId: string; quantityMilli: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...PARTS)
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'stock.issue', args.idempotencyKey, args, uow => issuePartToJob(uow, actor, { ...args, key: `issue:${args.idempotencyKey}` }))
}

export async function returnJobPart(_root: unknown, args: { jobId: string; shopItemId: string; quantityMilli: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...PARTS)
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'stock.return', args.idempotencyKey, args, uow => returnPartFromJob(uow, actor, { ...args, key: `return-job:${args.idempotencyKey}` }))
}

export async function adjustShopStock(_root: unknown, args: { shopItemId: string; deltaMilli: number; reason: string; approvalRequestId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts')
  requireHuman(actor, 'adjust stock')
  await shopOf(context, 'shopItem', args.shopItemId)
  return run(context, actor, 'stock.adjust', args.idempotencyKey, args, uow => adjustStock(uow, actor, { ...args, key: `adjust:${args.idempotencyKey}` }, gate))
}

export async function startShopCycleCount(_root: unknown, args: { shopId: string; shopItemIds: string[]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts')
  requireShop(context, args.shopId)
  return run(context, actor, 'cycle_count.start', args.idempotencyKey, args, uow => startCycleCount(uow, actor, args))
}

export async function recordShopCounts(_root: unknown, args: { cycleCountId: string; counts: { shopItemId: string; countedMilli: number }[]; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts')
  await shopOf(context, 'cycleCount', args.cycleCountId)
  return run(context, actor, 'cycle_count.record', args.idempotencyKey, args, uow => recordCounts(uow, actor, args))
}

export async function postShopCycleCount(_root: unknown, args: { cycleCountId: string; approvalRequestId?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts')
  requireHuman(actor, 'post a stock count')
  await shopOf(context, 'cycleCount', args.cycleCountId)
  return run(context, actor, 'cycle_count.post', args.idempotencyKey, args, uow => postCycleCount(uow, actor, args, gate))
}

// ── Cores and returns ─────────────────────────────────────────────────────────

export async function markShopCoreReturned(_root: unknown, args: { coreId: string; note?: string; documentId?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...PARTS)
  await shopOf(context, 'coreObligation', args.coreId)
  return run(context, actor, 'core.return', args.idempotencyKey, args, uow => markCoreReturned(uow, actor, args))
}

export async function writeOffShopCore(_root: unknown, args: { coreId: string; reason: string; approvalRequestId?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts')
  requireHuman(actor, 'write off a core')
  await shopOf(context, 'coreObligation', args.coreId)
  return run(context, actor, 'core.write_off', args.idempotencyKey, args, uow => writeOffCore(uow, actor, args, gate))
}

export async function createShopSupplierReturn(_root: unknown, args: { input: Parameters<typeof createSupplierReturn>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReceiveParts', 'canManageParts')
  requireShop(context, args.input?.shopId)
  return run(context, actor, 'supplier_return.create', args.idempotencyKey, args.input, uow => createSupplierReturn(uow, actor, args.input))
}

export async function advanceShopSupplierReturn(_root: unknown, args: { returnId: string; to: 'shipped' | 'credited' | 'rejected'; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReceiveParts', 'canManageParts')
  await shopOf(context, 'supplierReturn', args.returnId)
  return run(context, actor, 'supplier_return.advance', args.idempotencyKey, args, uow => advanceSupplierReturn(uow, actor, args))
}

// ── Supplier invoices ─────────────────────────────────────────────────────────

export async function recordShopSupplierInvoice(_root: unknown, args: { input: SupplierInvoiceInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReceiveParts', 'canManageParts')
  const input = args.input ?? ({} as SupplierInvoiceInput)
  requireShop(context, input.shopId)
  return run(context, actor, 'supplier_invoice.record', args.idempotencyKey, input, uow => recordSupplierInvoice(uow, actor, input))
}

export async function matchShopSupplierInvoice(_root: unknown, args: { invoiceId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReceiveParts', 'canManageParts')
  await shopOf(context, 'supplierInvoice', args.invoiceId)
  return run(context, actor, 'supplier_invoice.match', args.idempotencyKey, args, uow => matchSupplierInvoice(uow, actor, args))
}

export async function resolveSupplierDiscrepancy(_root: unknown, args: { discrepancyId: string; outcome: 'accepted' | 'disputed' | 'resolved'; resolution: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts', 'canApproveSupplierInvoice')
  requireHuman(actor, 'settle a supplier discrepancy')
  await shopOf(context, 'discrepancy', args.discrepancyId)
  return run(context, actor, 'discrepancy.resolve', args.idempotencyKey, args, uow => resolveDiscrepancy(uow, actor, args))
}

export async function approveShopSupplierInvoice(_root: unknown, args: { invoiceId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canApproveSupplierInvoice')
  requireHuman(actor, 'approve a supplier invoice')
  await shopOf(context, 'supplierInvoice', args.invoiceId)
  return run(context, actor, 'supplier_invoice.approve', args.idempotencyKey, args, uow => approveSupplierInvoice(uow, actor, args))
}

/** Reverse an invoice entered wrong (r3 N1): append-only, it frees the number for the corrected entry. A person with the approval permission does it. */
export async function reverseShopSupplierInvoice(_root: unknown, args: { invoiceId: string; reason: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canApproveSupplierInvoice')
  requireHuman(actor, 'reverse a supplier invoice')
  await shopOf(context, 'supplierInvoice', args.invoiceId)
  return run(context, actor, 'supplier_invoice.reverse', args.idempotencyKey, args, uow => reverseSupplierInvoice(uow, actor, args))
}

export async function exportShopSupplierInvoice(_root: unknown, args: { invoiceId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canApproveSupplierInvoice')
  requireHuman(actor, 'export a supplier invoice')
  await shopOf(context, 'supplierInvoice', args.invoiceId)
  return run(context, actor, 'supplier_invoice.export', args.idempotencyKey, args, uow => exportSupplierInvoice(uow, actor, args))
}

// ── Tires ─────────────────────────────────────────────────────────────────────

export async function recordShopJobTire(_root: unknown, args: { jobId: string; tireSize?: string; position: string; tin: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTireRegistrations', 'canReceiveParts', 'canWriteRepairOrders')
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'job_tire.record', args.idempotencyKey, args, uow => recordJobTire(uow, actor, args))
}

export async function completeShopTireRegistration(_root: unknown, args: { obligationId: string; method: 'form_handed_over' | 'submitted_electronic' | 'submitted_paper'; tins?: string[]; note?: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTireRegistrations')
  requireHuman(actor, 'complete a tire registration')
  await shopOf(context, 'tireRegistrationObligation', args.obligationId)
  return run(context, actor, 'tire_registration.complete', args.idempotencyKey, args, uow => completeTireRegistration(uow, actor, args))
}

export async function confirmShopTireRegistration(_root: unknown, args: { obligationId: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTireRegistrations')
  requireHuman(actor, 'confirm a tire registration')
  await shopOf(context, 'tireRegistrationObligation', args.obligationId)
  return run(context, actor, 'tire_registration.confirm', args.idempotencyKey, args, uow => confirmTireRegistration(uow, actor, args))
}

