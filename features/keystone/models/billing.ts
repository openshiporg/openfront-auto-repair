import { graphql, list } from '@keystone-6/core'
import { calendarDay, integer, json, relationship, timestamp, virtual } from '@keystone-6/core/fields'
import { lifecycle, minor, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Invoicing, payments and day close (SCHEMA §11; STATE-MACHINES §12, §14). Every list is governed: the
 * generated API reads (with the shop row filter) and never writes. Commands in lib/invoicing.ts,
 * lib/payments.ts and lib/dayClose.ts change everything in one audited transaction. Database
 * triggers (migration phase3) refuse edits to a finalized invoice's money, to its lines, to
 * allocations and to a closed day, including raw SQL.
 */

const READ = ['canTakePayments', 'canFinalizeInvoices', 'canReadFinancials', 'canCloseDay'] as const
const money = () => shopScoped(governed([...READ]), 'shop')
const via = (path: string) => shopScoped(governed([...READ]), path)

const PAYER_KINDS = ['customer', 'business_account', 'service_contract', 'insurer', 'manufacturer'] as const
const TENDERS = ['card_present', 'card_link', 'tap_to_pay', 'ach', 'cash', 'check', 'financing', 'store_credit', 'gift_card', 'account_credit'] as const

export const Invoice = list({
  access: money(),
  ui: { labelField: 'invoiceNumber', listView: { initialColumns: ['invoiceNumber', 'repairOrder', 'payerKind', 'totalMinor', 'balanceMinor', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    invoiceNumber: systemText({ indexed: 'unique', required: true }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    payerKind: systemChoice(PAYER_KINDS),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    businessAccount: relationship({ ref: 'BusinessAccount', ...readOnly }),
    poNumber: systemText(),
    invoiceDate: calendarDay({ ...readOnly }),
    dueDate: calendarDay({ ...readOnly }),
    retentionUntil: calendarDay({ ...readOnly }),
    odometerOut: integer({ ...readOnly }),
    lines: relationship({ ref: 'InvoiceLine.invoice', many: true, ...readOnly }),
    laborSubtotalMinor: minor({ defaultValue: 0n }),
    partsSubtotalMinor: minor({ defaultValue: 0n }),
    feesSubtotalMinor: minor({ defaultValue: 0n }),
    subletSubtotalMinor: minor({ defaultValue: 0n }),
    discountMinor: minor({ defaultValue: 0n }),
    taxMinor: minor({ defaultValue: 0n }),
    totalMinor: minor({ defaultValue: 0n }),
    paidMinor: minor({ defaultValue: 0n }),
    creditedMinor: minor({ defaultValue: 0n }),
    balanceMinor: minor({ defaultValue: 0n }),
    disclosures: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Printed texts: registration numbers, authorization records, declined safety items, non-returnable parts, warranty terms.' } }),
    statement: relationship({ ref: 'Statement.invoices', ...readOnly }),
    exemptionCertificate: relationship({ ref: 'ExemptionCertificate', ...readOnly }),
    allocations: relationship({ ref: 'PaymentAllocation.invoice', many: true, ...readOnly }),
    creditMemos: relationship({ ref: 'CreditMemo.invoice', many: true, ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    sentChannel: systemText(),
    finalizedBy: relationship({ ref: 'User', ...readOnly }),
    finalizedAt: timestamp({ ...readOnly }),
    arStage: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve(item: any) {
          if (item.status === 'paid' || item.status === 'credited' || BigInt(item.balanceMinor ?? 0) <= 0n) return 'settled'
          const due = item.dueDate ? new Date(item.dueDate).getTime() + 86_400_000 : null // owed through the end of the due day
          if (due === null) return 'current'
          const days = Math.floor((due - Date.now()) / 86_400_000)
          return days < 0 ? 'overdue' : days <= 3 ? 'due_soon' : 'current'
        },
      }),
    }),
    status: lifecycle(['finalized', 'sent', 'partially_paid', 'paid', 'credited']),
    version: versionField(),
    ...trackingFields,
  },
})

export const InvoiceLine = list({
  access: via('invoice.shop'),
  ui: { labelField: 'description', listView: { initialColumns: ['invoice', 'jobNumber', 'kind', 'description', 'extendedMinor', 'taxMinor'] } },
  fields: {
    invoice: relationship({ ref: 'Invoice.lines', ...readOnly }),
    sourceJobLine: relationship({ ref: 'JobLine', ...readOnly }),
    jobNumber: integer({ ...readOnly }),
    jobTitle: systemText(),
    kind: systemChoice(['labor', 'part', 'fee', 'sublet', 'tire', 'core', 'discount', 'refrigerant']),
    description: systemText({ required: true }),
    partNumber: systemText(),
    brand: systemText(),
    condition: systemText(),
    subletVendorName: systemText(),
    quantityMilli: integer({ defaultValue: 1000, ...readOnly }),
    centiHours: integer({ defaultValue: 0, ...readOnly }),
    unitPriceMinor: minor({ defaultValue: 0n }),
    extendedMinor: minor({ defaultValue: 0n }),
    taxCategoryCode: systemText(),
    taxMinor: minor({ defaultValue: 0n }),
    sortOrder: integer({ defaultValue: 0, ...readOnly }),
    ...trackingFields,
  },
})

export const CreditMemo = list({
  access: via('invoice.shop'),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'invoice', 'totalMinor', 'status', 'reason'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    invoice: relationship({ ref: 'Invoice.creditMemos', ...readOnly }),
    reason: systemText({ required: true }),
    subtotalMinor: minor({ defaultValue: 0n }),
    taxMinor: minor({ defaultValue: 0n }),
    totalMinor: minor({ defaultValue: 0n }),
    lines: relationship({ ref: 'CreditMemoLine.creditMemo', many: true, ...readOnly }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    issuedBy: relationship({ ref: 'User', ...readOnly }),
    issuedAt: timestamp({ ...readOnly }),
    status: lifecycle(['draft', 'issued']),
    version: versionField(),
    ...trackingFields,
  },
})

export const CreditMemoLine = list({
  access: via('creditMemo.invoice.shop'),
  ui: { labelField: 'description' },
  fields: {
    creditMemo: relationship({ ref: 'CreditMemo.lines', ...readOnly }),
    invoiceLine: relationship({ ref: 'InvoiceLine', ...readOnly }),
    description: systemText(),
    amountMinor: minor({ defaultValue: 0n }),
    taxMinor: minor({ defaultValue: 0n }),
    ...trackingFields,
  },
})

export const Payment = list({
  access: money(),
  ui: { labelField: 'id', listView: { initialColumns: ['purpose', 'tender', 'amountMinor', 'businessDate', 'status', 'createdAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    purpose: systemChoice(['invoice', 'deposit']),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    targetInvoiceIds: json({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: 'The invoices this payment was taken for; the amount is spread across them when it succeeds.' } }),
    tender: systemChoice(TENDERS),
    amountMinor: minor({ defaultValue: 0n }),
    surchargeMinor: minor({ defaultValue: 0n }),
    allocatedMinor: minor({ defaultValue: 0n }),
    refundedMinor: minor({ defaultValue: 0n }),
    provider: systemChoice(['manual', 'stripe']),
    providerSessionId: systemText({ indexed: true }),
    providerPaymentId: systemText({ indexed: true }),
    idempotencyKey: systemText({ indexed: 'unique', required: true }),
    payerName: systemText(),
    checkNumber: systemText(),
    cardBrand: systemText(),
    cardLast4: systemText(),
    failureMessage: systemText(),
    businessDate: calendarDay({ ...readOnly }),
    receivedBy: relationship({ ref: 'User', ...readOnly }),
    allocations: relationship({ ref: 'PaymentAllocation.payment', many: true, ...readOnly }),
    refunds: relationship({ ref: 'Refund.payment', many: true, ...readOnly }),
    settledAt: timestamp({ ...readOnly }),
    status: lifecycle(['initiated', 'pending', 'succeeded', 'failed', 'unknown', 'partially_refunded', 'refunded']),
    version: versionField(),
    ...trackingFields,
  },
})

export const PaymentAllocation = list({
  access: via('payment.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['payment', 'invoice', 'amountMinor', 'at'] } },
  fields: {
    payment: relationship({ ref: 'Payment.allocations', ...readOnly }),
    invoice: relationship({ ref: 'Invoice.allocations', ...readOnly }),
    refund: relationship({ ref: 'Refund', ...readOnly }),
    amountMinor: minor({ defaultValue: 0n, description: 'Negative when a refund takes money back off the invoice.' }),
    at: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const Refund = list({
  access: via('payment.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['payment', 'amountMinor', 'status', 'reason', 'createdAt'] } },
  fields: {
    payment: relationship({ ref: 'Payment.refunds', ...readOnly }),
    amountMinor: minor({ defaultValue: 0n }),
    reason: systemText({ required: true }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    provider: systemChoice(['manual', 'stripe']),
    providerRefundId: systemText({ indexed: true }),
    businessDate: calendarDay({ ...readOnly }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    failureMessage: systemText(),
    settledAt: timestamp({ ...readOnly }),
    status: lifecycle(['requested', 'pending', 'succeeded', 'failed', 'unknown']),
    version: versionField(),
    ...trackingFields,
  },
})

export const FinancingApplication = list({
  access: via('repairOrder.shop'),
  ui: { labelField: 'lenderReference', listView: { initialColumns: ['repairOrder', 'requestedMinor', 'approvedMinor', 'lenderReference', 'status'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    provider: systemChoice(['operator_recorded']),
    requestedMinor: minor({ defaultValue: 0n }),
    approvedMinor: minor({ defaultValue: 0n }),
    terms: json({ ...readOnly }),
    lenderReference: systemText(),
    payment: relationship({ ref: 'Payment', ...readOnly }),
    status: lifecycle(['started', 'submitted', 'approved', 'declined', 'expired', 'funded']),
    version: versionField(),
    ...trackingFields,
  },
})

export const Statement = list({
  access: governed([...READ]),
  ui: { labelField: 'id', listView: { initialColumns: ['businessAccount', 'periodStart', 'periodEnd', 'closingMinor'] } },
  fields: {
    businessAccount: relationship({ ref: 'BusinessAccount', ...readOnly }),
    periodStart: calendarDay({ ...readOnly }),
    periodEnd: calendarDay({ ...readOnly }),
    openingMinor: minor({ defaultValue: 0n }),
    chargesMinor: minor({ defaultValue: 0n }),
    paymentsMinor: minor({ defaultValue: 0n }),
    creditsMinor: minor({ defaultValue: 0n }),
    closingMinor: minor({ defaultValue: 0n }),
    reference: systemText({ indexed: 'unique' }),
    invoices: relationship({ ref: 'Invoice.statement', many: true, ...readOnly }),
    aging: json({ ...readOnly, ui: { ...readOnly.ui, description: 'What was owed at the period end, by how late it was.' } }),
    exportedAt: timestamp({ ...readOnly }),
    exportedBy: relationship({ ref: 'User', ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const BusinessDayClose = list({
  access: money(),
  ui: { labelField: 'businessDate', listView: { initialColumns: ['shop', 'businessDate', 'drawerCountMinor', 'varianceMinor', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    businessDate: calendarDay({ ...readOnly }),
    tenderTotals: json({ defaultValue: {}, ...readOnly, ui: { ...readOnly.ui, description: '{ tender: net minor units } for the day, frozen when it closes.' } }),
    expectedCashMinor: minor({ defaultValue: 0n }),
    drawerCountMinor: minor({ defaultValue: 0n }),
    varianceMinor: minor({ defaultValue: 0n }),
    varianceReason: systemText(),
    closedBy: relationship({ ref: 'User', ...readOnly }),
    closedAt: timestamp({ ...readOnly }),
    reopenApproval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    status: lifecycle(['open', 'counting', 'closed', 'reopened']),
    version: versionField(),
    ...trackingFields,
  },
})

/** Starts at the invoice date plus the job's warranty term (months and miles); a comeback checks it (Phase 5). */
export const WarrantyCoverage = list({
  access: via('repairOrder.shop'),
  ui: { labelField: 'termName', listView: { initialColumns: ['repairOrder', 'termName', 'startsOn', 'endsOn', 'endsAtMiles', 'status'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    job: relationship({ ref: 'Job', ...readOnly }),
    invoice: relationship({ ref: 'Invoice', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    termCode: systemText(),
    termName: systemText(),
    invoiceText: systemText(),
    startsOn: calendarDay({ ...readOnly }),
    endsOn: calendarDay({ ...readOnly }),
    startMiles: integer({ ...readOnly }),
    endsAtMiles: integer({ ...readOnly }),
    status: lifecycle(['active', 'expired', 'void']),
    version: versionField(),
    ...trackingFields,
  },
})
