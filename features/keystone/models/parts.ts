import { graphql, list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, timestamp, virtual } from '@keystone-6/core/fields'
import { registrationOverdue } from '../lib/tires'
import { anyOf } from '../access'
import { lifecycle, milli, minor, optionalChoice, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { withoutCostKeys, withoutMoneyText } from '../security/costRedaction'
import { trackingFields } from './trackingFields'

/*
 * Parts, inventory, cores and supplier invoices (SCHEMA §8; STATE-MACHINES §9, §11). Every list is
 * governed: the generated API reads (with the shop row filter) and never writes. Commands in
 * lib/parts.ts, lib/supplierOrders.ts and lib/supplierInvoices.ts change everything in one audited
 * transaction. Database triggers (migration phase4) make the stock ledger append-only, let stock
 * quantities move only through the ledger command, and refuse a duplicate supplier invoice number.
 */

const READ = ['canManageParts', 'canOrderParts', 'canReceiveParts', 'canApproveSupplierInvoice', 'canApproveStockAdjustment', 'canManageTireRegistrations', 'canReadRepairOrders'] as const
const sys = () => false
/** Cost is visible to canSeeCost only. */
const cost = { read: anyOf('canSeeCost') as (args: any) => boolean, create: sys, update: sys }
const scoped = (path = 'shop') => shopScoped(governed([...READ]), path)

const SUPPLIER_KINDS = ['parts_store', 'warehouse_distributor', 'dealer_oem', 'specialty', 'tire_distributor', 'sublet_vendor', 'online'] as const
const UNITS = ['each', 'quart', 'liter', 'gallon', 'ounce', 'pound', 'foot', 'set'] as const
const MOVEMENTS = ['receipt', 'issue', 'return_to_stock', 'return_to_supplier', 'adjustment', 'count', 'commit', 'release', 'po_order', 'po_cancel'] as const
const ORDER_STATUSES = ['draft', 'placing', 'unknown', 'placed', 'confirmed', 'partially_received', 'received', 'closed', 'cancel_requested', 'cancelled', 'failed'] as const
const SOURCES = ['api', 'phone', 'web', 'counter'] as const

export const Supplier = list({
  access: governed([...READ]),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'kind', 'adapter', 'preferred', 'active'] } },
  fields: {
    name: systemText({ required: true, indexed: 'unique' }),
    kind: systemChoice(SUPPLIER_KINDS, 'parts_store'),
    adapter: systemChoice(['manual', 'fixture'], 'manual'),
    phone: systemText(),
    email: systemText(),
    website: systemText(),
    accountNumbersByShop: json({ defaultValue: {}, ...readOnly }),
    deliverySchedule: json({ defaultValue: {}, ...readOnly }),
    coreReturnWindowDays: integer({ defaultValue: 30, validation: { isRequired: true }, ...readOnly }),
    priceToleranceMinor: minor({ defaultValue: 0n, description: 'A supplier invoice line this much above the order price (per unit) still matches.' }),
    preferred: checkbox({ defaultValue: false, ...readOnly }),
    active: checkbox({ defaultValue: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ShopItem = list({
  access: scoped(),
  ui: { labelField: 'sku', listView: { initialColumns: ['sku', 'description', 'brand', 'isStocked', 'binLocation'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    sku: systemText({ required: true }),
    partNumber: systemText(),
    brand: systemText(),
    lineCode: systemText(),
    description: systemText({ required: true }),
    category: systemText(),
    unitOfMeasure: systemChoice(UNITS, 'each'),
    isStocked: checkbox({ defaultValue: false, ...readOnly }),
    binLocation: systemText(),
    minQuantityMilli: milli({ defaultValue: 0 }),
    maxQuantityMilli: milli({ defaultValue: 0 }),
    coreChargeMinor: minor({ defaultValue: 0n, access: cost, description: 'Charged by the supplier and refunded when the old part comes back.' }),
    preferredSupplier: relationship({ ref: 'Supplier', ...readOnly }),
    fitmentNotes: systemText(),
    active: checkbox({ defaultValue: true, ...readOnly }),
    stock: relationship({ ref: 'StockLevel.shopItem', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** One per item. Quantities change only inside the stock ledger command (the database enforces it). */
export const StockLevel = list({
  access: scoped('shopItem.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['shopItem', 'onHandMilli', 'committedMilli', 'onOrderMilli'] } },
  fields: {
    shopItem: relationship({ ref: 'ShopItem.stock', ...readOnly }),
    onHandMilli: milli({ defaultValue: 0 }),
    committedMilli: milli({ defaultValue: 0 }),
    onOrderMilli: milli({ defaultValue: 0 }),
    averageCostMinor: minor({ defaultValue: 0n, access: cost }),
    lastCountedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** The immutable ledger. A row says what moved, at what cost, and what the levels were afterwards. */
export const StockMovement = list({
  access: scoped('shopItem.shop'),
  ui: { labelField: 'type', listView: { initialColumns: ['shopItem', 'type', 'quantityMilli', 'unitCostMinor', 'at'] } },
  fields: {
    shopItem: relationship({ ref: 'ShopItem', ...readOnly }),
    type: systemChoice(MOVEMENTS, 'receipt'),
    quantityMilli: milli({ defaultValue: 0 }),
    unitCostMinor: minor({ defaultValue: 0n, access: cost }),
    job: relationship({ ref: 'Job', ...readOnly }),
    supplierOrderLine: relationship({ ref: 'SupplierOrderLine', ...readOnly }),
    onHandDeltaMilli: milli({ defaultValue: 0 }),
    committedDeltaMilli: milli({ defaultValue: 0 }),
    onOrderDeltaMilli: milli({ defaultValue: 0 }),
    cycleCount: relationship({ ref: 'CycleCount', ...readOnly }),
    // Free text written by people who see cost; money in it is masked, and it is not filterable, for a reader without canSeeCost (review r4 R4-2).
    reason: withoutMoneyText(systemText()),
    idempotencyKey: systemText({ indexed: 'unique', required: true }),
    actorUser: relationship({ ref: 'User', ...readOnly }),
    actorName: systemText(),
    at: timestamp({ ...readOnly }),
    // The level after the move; its avgCost is removed for a reader without canSeeCost (review r3 N3).
    after: withoutCostKeys(json({ ...readOnly })),
    ...trackingFields,
  },
})

export const CycleCount = list({
  access: scoped(),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'shop', 'status', 'createdAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    items: json({ defaultValue: [], ...readOnly }),
    varianceValueMinor: minor({ defaultValue: 0n, access: cost }),
    postedBy: relationship({ ref: 'User', ...readOnly }),
    postedAt: timestamp({ ...readOnly }),
    status: lifecycle(['open', 'counted', 'posted']),
    version: versionField(),
    ...trackingFields,
  },
})

export const PartQuote = list({
  access: scoped(),
  ui: { labelField: 'partNumber', listView: { initialColumns: ['partNumber', 'supplier', 'unitCostMinor', 'availability', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    job: relationship({ ref: 'Job', ...readOnly }),
    jobLine: relationship({ ref: 'JobLine', ...readOnly }),
    supplier: relationship({ ref: 'Supplier', ...readOnly }),
    source: systemChoice(SOURCES, 'phone'),
    partNumber: systemText({ required: true }),
    brand: systemText(),
    lineCode: systemText(),
    description: systemText(),
    unitCostMinor: minor({ defaultValue: 0n, access: cost }),
    listPriceMinor: minor({ defaultValue: 0n }),
    coreChargeMinor: minor({ defaultValue: 0n, access: cost }),
    availableQuantityMilli: milli({ defaultValue: 0 }),
    availability: systemChoice(['in_stock_local', 'in_stock_dc', 'special_order', 'unavailable'], 'in_stock_local'),
    etaAt: timestamp({ ...readOnly }),
    supplierLocation: systemText(),
    validUntil: timestamp({ ...readOnly }),
    phoneEvidence: json({ ...readOnly }),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    status: lifecycle(['requested', 'received', 'selected', 'rejected', 'expired'], 'received'),
    version: versionField(),
    ...trackingFields,
  },
})

export const SupplierOrder = list({
  access: scoped(),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'supplier', 'kind', 'totalMinor', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    supplier: relationship({ ref: 'Supplier', ...readOnly }),
    kind: systemChoice(['job', 'stock', 'sublet'], 'job'),
    placedVia: optionalChoice(SOURCES),
    supplierConfirmation: systemText(),
    etaAt: timestamp({ ...readOnly }),
    totalMinor: minor({ defaultValue: 0n, access: cost }),
    deliveryNote: withoutMoneyText(systemText()),
    lines: relationship({ ref: 'SupplierOrderLine.order', many: true, ...readOnly }),
    receipts: relationship({ ref: 'Receipt.order', many: true, ...readOnly }),
    placedAt: timestamp({ ...readOnly }),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    status: lifecycle(ORDER_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})

export const SupplierOrderLine = list({
  access: scoped('order.shop'),
  ui: { labelField: 'partNumber', listView: { initialColumns: ['order', 'partNumber', 'quantityMilli', 'receivedQuantityMilli', 'unitCostMinor'] } },
  fields: {
    order: relationship({ ref: 'SupplierOrder.lines', ...readOnly }),
    job: relationship({ ref: 'Job', ...readOnly }),
    jobLine: relationship({ ref: 'JobLine', ...readOnly }),
    shopItem: relationship({ ref: 'ShopItem', ...readOnly }),
    partQuote: relationship({ ref: 'PartQuote', ...readOnly }),
    partNumber: systemText({ required: true }),
    brand: systemText(),
    description: systemText(),
    quantityMilli: milli({ defaultValue: 1000 }),
    unitCostMinor: minor({ defaultValue: 0n, access: cost }),
    coreChargeMinor: minor({ defaultValue: 0n, access: cost }),
    receivedQuantityMilli: milli({ defaultValue: 0 }),
    invoicedQuantityMilli: milli({ defaultValue: 0 }),
    status: systemChoice(['open', 'partially_received', 'received', 'cancelled'], 'open'),
    ...trackingFields,
  },
})

export const Receipt = list({
  access: scoped('order.shop'),
  ui: { labelField: 'receiptKey', listView: { initialColumns: ['order', 'receiptKey', 'at'] } },
  fields: {
    order: relationship({ ref: 'SupplierOrder.receipts', ...readOnly }),
    receiptKey: systemText({ indexed: 'unique', required: true }),
    receivedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ ...readOnly }),
    packingSlip: relationship({ ref: 'Document', ...readOnly }),
    lines: relationship({ ref: 'ReceiptLine.receipt', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const ReceiptLine = list({
  access: scoped('receipt.order.shop'),
  ui: { labelField: 'id' },
  fields: {
    receipt: relationship({ ref: 'Receipt.lines', ...readOnly }),
    orderLine: relationship({ ref: 'SupplierOrderLine', ...readOnly }),
    quantityMilli: milli({ defaultValue: 0 }),
    condition: systemChoice(['ok', 'damaged', 'wrong_part'], 'ok'),
    ...trackingFields,
  },
})

export const CoreObligation = list({
  access: scoped(),
  ui: { labelField: 'id', listView: { initialColumns: ['supplier', 'coreChargeMinor', 'dueAt', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    job: relationship({ ref: 'Job', ...readOnly }),
    jobLine: relationship({ ref: 'JobLine', ...readOnly }),
    shopItem: relationship({ ref: 'ShopItem', ...readOnly }),
    partNumber: systemText(),
    supplier: relationship({ ref: 'Supplier', ...readOnly }),
    supplierOrderLine: relationship({ ref: 'SupplierOrderLine', ...readOnly }),
    coreChargeMinor: minor({ defaultValue: 0n, access: cost }),
    owedTo: systemChoice(['supplier', 'shop_from_customer'], 'supplier'),
    returnedAt: timestamp({ ...readOnly }),
    returnDocument: relationship({ ref: 'Document', ...readOnly }),
    returnNote: withoutMoneyText(systemText()),
    creditedAt: timestamp({ ...readOnly }),
    supplierInvoiceLine: relationship({ ref: 'SupplierInvoiceLine', ...readOnly }),
    writeOffReason: withoutMoneyText(systemText()),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    dueAt: calendarDay({ ...readOnly }),
    status: lifecycle(['owed', 'returned', 'credited', 'customer_charged', 'written_off']),
    version: versionField(),
    ...trackingFields,
  },
})

export const SupplierReturn = list({
  access: scoped(),
  ui: { labelField: 'rmaNumber', listView: { initialColumns: ['rmaNumber', 'supplier', 'reason', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    supplier: relationship({ ref: 'Supplier', ...readOnly }),
    rmaNumber: systemText(),
    lines: withoutCostKeys(json({ defaultValue: [], ...readOnly })),
    reason: systemChoice(['wrong_part', 'unused', 'defective', 'warranty', 'core'], 'unused'),
    creditMinor: minor({ defaultValue: 0n, access: cost }),
    status: lifecycle(['requested', 'shipped', 'credited', 'rejected']),
    version: versionField(),
    ...trackingFields,
  },
})

export const SupplierInvoice = list({
  access: scoped(),
  ui: { labelField: 'invoiceNumber', listView: { initialColumns: ['invoiceNumber', 'supplier', 'invoiceDate', 'totalMinor', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    supplier: relationship({ ref: 'Supplier', ...readOnly }),
    invoiceNumber: systemText({ required: true }),
    invoiceDate: calendarDay({ ...readOnly }),
    totalMinor: minor({ defaultValue: 0n, access: cost }),
    document: relationship({ ref: 'Document', ...readOnly }),
    lines: relationship({ ref: 'SupplierInvoiceLine.invoice', many: true, ...readOnly }),
    discrepancies: relationship({ ref: 'Discrepancy.invoice', many: true, ...readOnly }),
    approvedBy: relationship({ ref: 'User', ...readOnly }),
    approvedAt: timestamp({ ...readOnly }),
    exportReference: systemText(),
    reversedBy: relationship({ ref: 'User', ...readOnly }),
    reversedAt: timestamp({ ...readOnly }),
    // Written by a person who sees cost ("Header keyed as $1,150.00"): money masked and not filterable without canSeeCost (review r4 R4-2).
    reversalReason: withoutMoneyText(systemText()),
    status: lifecycle(['received', 'matching', 'matched', 'discrepancy', 'approved', 'exported', 'reversed']),
    version: versionField(),
    ...trackingFields,
  },
})

export const SupplierInvoiceLine = list({
  access: scoped('invoice.shop'),
  ui: { labelField: 'partNumber', listView: { initialColumns: ['invoice', 'partNumber', 'quantityMilli', 'unitCostMinor', 'matchStatus'] } },
  fields: {
    invoice: relationship({ ref: 'SupplierInvoice.lines', ...readOnly }),
    partNumber: systemText({ required: true }),
    quantityMilli: milli({ defaultValue: 1000 }),
    unitCostMinor: minor({ defaultValue: 0n, access: cost }),
    coreCreditMinor: minor({ defaultValue: 0n, access: cost }),
    matchedOrderLine: relationship({ ref: 'SupplierOrderLine', ...readOnly }),
    /** The order lines and quantities this line was matched against; a reversal gives exactly these back. */
    allocations: json({ defaultValue: [], ...readOnly }),
    matchStatus: systemChoice(['unmatched', 'matched', 'variance'], 'unmatched'),
    ...trackingFields,
  },
})

export const Discrepancy = list({
  access: scoped('invoice.shop'),
  ui: { labelField: 'kind', listView: { initialColumns: ['invoice', 'kind', 'amountMinor', 'status'] } },
  fields: {
    invoice: relationship({ ref: 'SupplierInvoice.discrepancies', ...readOnly }),
    line: relationship({ ref: 'SupplierInvoiceLine', ...readOnly }),
    kind: systemChoice(['overcharge', 'duplicate', 'missing_credit', 'core_not_credited', 'unordered_item', 'quantity_mismatch', 'total_mismatch'], 'overcharge'),
    amountMinor: minor({ defaultValue: 0n, access: cost }),
    // Never written with money in it now; older rows have the amounts masked for a reader without canSeeCost.
    detail: withoutMoneyText(systemText()),
    openedBy: relationship({ ref: 'User', ...readOnly }),
    openedByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    resolution: withoutMoneyText(systemText()),
    status: lifecycle(['open', 'disputed', 'resolved', 'accepted']),
    version: versionField(),
    ...trackingFields,
  },
})

/** 49 CFR 574.8: every new tire sold needs its registration handed over or submitted within 30 days. */
export const TireRegistrationObligation = list({
  access: shopScoped(governed(['canManageTireRegistrations', 'canReadRepairOrders'])),
  ui: { labelField: 'id', listView: { initialColumns: ['shop', 'invoice', 'purchaserName', 'dueAt', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    invoice: relationship({ ref: 'Invoice', ...readOnly }),
    invoiceLine: relationship({ ref: 'InvoiceLine', ...readOnly }),
    jobLine: relationship({ ref: 'JobLine', ...readOnly }),
    tireDescription: systemText(),
    tins: json({ defaultValue: [], ...readOnly }),
    purchaserName: systemText(),
    purchaserAddress: json({ ...readOnly, access: { read: anyOf('canReadCustomerPII'), create: sys, update: sys } }),
    dealerIdentity: json({ ...readOnly }),
    method: optionalChoice(['form_handed_over', 'submitted_electronic', 'submitted_paper']),
    dueAt: calendarDay({ ...readOnly }),
    /** Computed on read: still open and past its due day in the shop's own day. No scheduled job sets it. */
    isOverdue: virtual({
      field: graphql.field({
        type: graphql.Boolean,
        async resolve(item: any, _args, context) {
          const shop = item.shopId ? await context.sudo().prisma.shop.findUnique({ where: { id: item.shopId }, select: { timeZone: true } }) : null
          return registrationOverdue({ status: item.status, dueAt: item.dueAt }, shop?.timeZone)
        },
      }),
    }),
    evidence: json({ ...readOnly }),
    completedAt: timestamp({ ...readOnly }),
    status: lifecycle(['open', 'handed_over', 'submitted', 'confirmed', 'overdue']),
    version: versionField(),
    ...trackingFields,
  },
})

/** A tire's DOT tire identification number, recorded against the job it is sold on (49 CFR 574.5). */
export const JobTire = list({
  access: shopScoped(governed(['canManageParts', 'canManageTireRegistrations', 'canReadRepairOrders']), 'job.repairOrder.shop'),
  ui: { labelField: 'tin', listView: { initialColumns: ['job', 'tireSize', 'position', 'tin'] } },
  fields: {
    job: relationship({ ref: 'Job', ...readOnly }),
    tireSize: systemText(),
    position: systemChoice(['lf', 'rf', 'lr', 'rr', 'spare', 'other'], 'other'),
    tin: systemText({ required: true, indexed: 'unique' }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})
