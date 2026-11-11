import { graphql, list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'
import { anyOf } from '../access'
import { centiHours, lifecycle, milli, minor, optionalChoice, pct, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'
import { boardStage, type BoardInput } from '../../../lib/board'

/*
 * Repair orders (SCHEMA §5, STATE-MACHINES §2-3). Every list here is governed: the generated API
 * reads (with the shop row filter) and never writes. Commands in lib/repairOrders.ts, lib/pricing.ts,
 * lib/estimates.ts and lib/authorization.ts make every change in one audited transaction.
 * A repair order pins the policy versions in force when it opens (I-O2); prices never move under it.
 */

const sys = () => false
const readRO = ['canReadRepairOrders'] as const
const roScoped = (path: string) => shopScoped(governed([...readRO]), path)
/** Cost and margin are visible to canSeeCost only (SCHEMA §5.3). */
const cost = { read: anyOf('canSeeCost') as (args: any) => boolean, create: sys, update: sys }

const RO_STATUSES = ['draft', 'checked_in', 'in_service', 'on_hold', 'ready_to_invoice', 'invoiced', 'closed', 'void'] as const
const JOB_STATUSES = ['draft', 'priced', 'offered', 'authorized', 'declined', 'deferred', 'in_progress', 'needs_reauthorization', 'completed', 'voided'] as const
const PART_CONDITIONS = ['new', 'used', 'rebuilt', 'reconditioned', 'oem_crash', 'non_oem_aftermarket_crash'] as const
const HOLD_REASONS = ['none', 'customer_unreachable', 'parts_backorder', 'sublet_out', 'teardown_wait', 'other'] as const

export const RepairOrder = list({
  access: shopScoped(governed([...readRO])),
  ui: { labelField: 'roNumber', listView: { initialColumns: ['roNumber', 'shop', 'customer', 'vehicle', 'status', 'promisedAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    roNumber: systemText({ indexed: 'unique', required: true }),
    kind: systemChoice(['standard', 'comeback', 'internal', 'fleet']),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    businessAccount: relationship({ ref: 'BusinessAccount', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    fleetUnit: relationship({ ref: 'FleetUnit', ...readOnly }),
    serviceAdvisor: relationship({ ref: 'User', ...readOnly }),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    checkIn: relationship({ ref: 'CheckIn.repairOrder', ...readOnly }),
    concerns: relationship({ ref: 'Concern.repairOrder', many: true, ...readOnly }),
    jobs: relationship({ ref: 'Job.repairOrder', many: true, ...readOnly }),
    inspections: relationship({ ref: 'Inspection.repairOrder', many: true, ...readOnly }),
    estimateVersions: relationship({ ref: 'EstimateVersion.repairOrder', many: true, ...readOnly }),
    authorizationRequests: relationship({ ref: 'AuthorizationRequest.repairOrder', many: true, ...readOnly }),
    odometerIn: relationship({ ref: 'OdometerReading', ...readOnly }),
    odometerOut: relationship({ ref: 'OdometerReading', ...readOnly }),
    // Pinned at open (I-O2). Prices, disclosures and tolerances on this RO come from these, never from the shop's current pointers.
    jurisdictionPolicyVersion: relationship({ ref: 'JurisdictionPolicyVersion', ...readOnly }),
    shopPolicyVersion: relationship({ ref: 'ShopPolicyVersion', ...readOnly }),
    laborRateClassSetVersion: relationship({ ref: 'LaborRateClassSetVersion', ...readOnly }),
    laborMatrixVersion: relationship({ ref: 'LaborMatrixVersion', ...readOnly }),
    partsMatrixVersion: relationship({ ref: 'PartsMatrixVersion', ...readOnly }),
    feePolicyVersion: relationship({ ref: 'FeePolicyVersion', ...readOnly }),
    taxRuleSetVersion: relationship({ ref: 'TaxRuleSetVersion', ...readOnly }),
    warrantyTermSetVersion: relationship({ ref: 'WarrantyTermSetVersion', ...readOnly }),
    replacedPartsElection: systemChoice(['not_asked', 'return', 'do_not_return', 'show_only']),
    electedAt: timestamp({ ...readOnly }),
    designee: json({ ...readOnly, access: { read: anyOf('canReadCustomerPII', 'canRecordAuthorizations'), create: sys, update: sys }, ui: { ...readOnly.ui, description: '{ name, relationship, contact, namedAt } — a person the customer named on the work order who may authorize (CA §3354(c)).' } }),
    promisedAt: timestamp({ ...readOnly }),
    holdReason: systemChoice(HOLD_REASONS),
    holdNote: systemText(),
    heldAt: timestamp({ ...readOnly }),
    waiter: checkbox({ defaultValue: false, ...readOnly }),
    keyTag: systemText(),
    authorizedTotalMinor: minor({ defaultValue: 0n }),
    currentTotalMinor: minor({ defaultValue: 0n }),
    boardStage: virtual({
      field: graphql.field({
        type: graphql.String,
        async resolve(item: any, _args, context) {
          const jobs = await context.sudo().prisma.job.findMany({ where: { repairOrderId: item.id }, select: { status: true } })
          const inspections = await context.sudo().prisma.inspection.findMany({ where: { repairOrderId: item.id }, select: { status: true } })
          return boardStage({ status: item.status, jobs, inspections } as BoardInput)
        },
      }),
    }),
    lockedAt: timestamp({ ...readOnly }),
    releasedAt: timestamp({ ...readOnly }),
    releasedBy: relationship({ ref: 'User', ...readOnly }),
    collisionClaimRef: relationship({ ref: 'CollisionClaimRef.repairOrder', ...readOnly }),
    qualityChecks: relationship({ ref: 'QualityCheck.repairOrder', many: true, ...readOnly }),
    tasks: relationship({ ref: 'StaffTask.repairOrder', many: true, ...readOnly }),
    openedAt: timestamp({ ...readOnly }),
    openedBy: relationship({ ref: 'User', ...readOnly }),
    voidReason: systemText(),
    status: lifecycle(RO_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})

export const Concern = list({
  access: roScoped('repairOrder.shop'),
  ui: { labelField: 'customerWords', listView: { initialColumns: ['repairOrder', 'customerWords', 'category'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.concerns', ...readOnly }),
    customerWords: systemText({ required: true }),
    category: systemChoice(['other', 'noise', 'leak', 'warning_light', 'performance', 'maintenance', 'inspection_request']),
    diagnosis: systemText(),
    cause: systemText(),
    correction: systemText(),
    jobs: relationship({ ref: 'Job.concern', many: true, ...readOnly }),
    sortOrder: integer({ defaultValue: 0, ...readOnly }),
    ...trackingFields,
  },
})

export const Job = list({
  access: roScoped('repairOrder.shop'),
  ui: { labelField: 'title', listView: { initialColumns: ['repairOrder', 'number', 'title', 'status', 'totalMinor'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.jobs', ...readOnly }),
    number: integer({ validation: { isRequired: true }, ...readOnly }),
    title: systemText({ required: true }),
    customerDescription: systemText(),
    kind: systemChoice(['repair', 'maintenance', 'diagnosis', 'inspection', 'teardown', 'reassembly', 'tire', 'sublet', 'comeback', 'internal']),
    concern: relationship({ ref: 'Concern.jobs', ...readOnly }),
    source: systemChoice(['manual', 'canned_job', 'service_menu', 'inspection_finding', 'diagnosis', 'comeback', 'recommendation', 'agent']),
    cannedJobVersion: relationship({ ref: 'CannedJobVersion', ...readOnly }),
    inspectionItemResult: relationship({ ref: 'InspectionItemResult.recommendedJobs', ...readOnly }),
    lines: relationship({ ref: 'JobLine.job', many: true, ...readOnly }),
    techShares: relationship({ ref: 'JobTechShare.job', many: true, ...readOnly }),
    payerSplits: relationship({ ref: 'PayerSplit.job', many: true, ...readOnly }),
    urgency: systemChoice(['none', 'green', 'yellow', 'red']),
    warrantyTerm: relationship({ ref: 'WarrantyTerm', ...readOnly }),
    contentHash: systemText(),
    priceSnapshot: json({ ...readOnly }),
    subtotalMinor: minor({ defaultValue: 0n }),
    taxMinor: minor({ defaultValue: 0n }),
    totalMinor: minor({ defaultValue: 0n }),
    laborMinor: minor({ defaultValue: 0n }),
    partsMinor: minor({ defaultValue: 0n }),
    feesMinor: minor({ defaultValue: 0n }),
    costMinor: minor({ defaultValue: 0n, access: cost }),
    marginMinor: minor({ defaultValue: 0n, access: cost }),
    offeredInVersion: relationship({ ref: 'EstimateVersion', ...readOnly }),
    authorizedAmountMinor: minor({ defaultValue: 0n }),
    authorizedSubtotalMinor: minor({ defaultValue: 0n }),
    authorizedContentHash: systemText(),
    authorizedIdentityHash: systemText(),
    chargeCeilingMinor: minor({ defaultValue: 0n }),
    currentAuthorization: relationship({ ref: 'Authorization', ...readOnly }),
    authorizations: relationship({ ref: 'Authorization.job', many: true, ...readOnly }),
    decisions: relationship({ ref: 'JobDecision.job', many: true, ...readOnly }),
    belowThresholdRecordedAt: timestamp({ ...readOnly }),
    noChargeReason: systemText(),
    teardownDisclosure: relationship({ ref: 'TeardownDisclosure.job', ...readOnly }),
    reauthorizationReason: systemText(),
    workStartedAt: timestamp({ ...readOnly }),
    completedAt: timestamp({ ...readOnly }),
    status: lifecycle(JOB_STATUSES),
    version: versionField(),
    ...trackingFields,
  },
})
export const JobLine = list({
  access: roScoped('job.repairOrder.shop'),
  ui: { labelField: 'description', listView: { initialColumns: ['job', 'kind', 'description', 'extendedMinor', 'taxMinor'] } },
  fields: {
    job: relationship({ ref: 'Job.lines', ...readOnly }),
    kind: systemChoice(['labor', 'part', 'fee', 'sublet', 'tire', 'core', 'discount', 'refrigerant']),
    description: systemText({ required: true }),
    auto: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Computed by pricing (fees); replaced on every reprice.' } }),
    // Labor (G15: only the shop's own times or a guide reference; no licensed text).
    rateClass: relationship({ ref: 'LaborRateClass', ...readOnly }),
    soldCentiHours: centiHours({ defaultValue: 0, min: 0 }),
    guideCentiHours: centiHours({ defaultValue: 0, min: 0 }),
    overlapCentiHours: centiHours({ defaultValue: 0, min: 0 }),
    guideSnapshot: json({ ...readOnly }),
    rateMinor: minor({ defaultValue: 0n }),
    // Part and tire.
    partNumber: systemText(),
    brand: systemText(),
    partCategory: systemText(),
    condition: optionalChoice(PART_CONDITIONS),
    quantityMilli: milli({ defaultValue: 1000, min: 0 }),
    unitOfMeasure: systemText(),
    unitCostMinor: minor({ defaultValue: 0n, access: cost }),
    unitPriceMinor: minor({ defaultValue: 0n }),
    matrixTierSnapshot: json({ ...readOnly, access: cost }),
    fulfilment: systemChoice(['order_on_authorization', 'stock', 'ordered', 'customer_supplied']),
    isNewTire: checkbox({ defaultValue: false, ...readOnly }),
    tireSize: systemText(),
    // Sublet (I-R10): the vendor is named on the estimate.
    subletVendorName: systemText(),
    subletCostMinor: minor({ defaultValue: 0n, access: cost }),
    // Fee.
    feeRule: relationship({ ref: 'FeeRule', ...readOnly }),
    feeCode: systemText(),
    taxCategory: relationship({ ref: 'TaxCategory', ...readOnly }),
    taxCategoryCode: systemText(),
    taxable: checkbox({ defaultValue: false, ...readOnly }),
    taxRate: pct({ defaultValue: '0.000000' }),
    extendedMinor: minor({ defaultValue: 0n }),
    taxMinor: minor({ defaultValue: 0n }),
    override: json({ ...readOnly }),
    sortOrder: integer({ defaultValue: 0, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const JobTechShare = list({
  access: roScoped('job.repairOrder.shop'),
  fields: {
    job: relationship({ ref: 'Job.techShares', ...readOnly }),
    technician: relationship({ ref: 'User', ...readOnly }),
    sharePct: pct({ defaultValue: '1.000000' }),
    ...trackingFields,
  },
})

export const PayerSplit = list({
  access: roScoped('job.repairOrder.shop'),
  fields: {
    job: relationship({ ref: 'Job.payerSplits', ...readOnly }),
    payerKind: systemChoice(['customer', 'business_account', 'service_contract', 'insurer', 'shop_warranty', 'manufacturer_goodwill']),
    businessAccount: relationship({ ref: 'BusinessAccount', ...readOnly }),
    payorName: systemText(),
    authorizationNumber: systemText(),
    claimNumber: systemText(),
    percent: pct({ defaultValue: '1.000000' }),
    fixedMinor: minor(),
    deductibleMinor: minor(),
    warrantyTaxTreatment: systemChoice(['n_a', 'mandatory_no_deductible', 'mandatory_deductible', 'optional_repairer', 'optional_manufacturer']),
    ...trackingFields,
  },
})

/** CA §3353(c): what teardown costs, what reassembly costs and how long reassembly may take. Immutable once offered. */
export const TeardownDisclosure = list({
  access: roScoped('job.repairOrder.shop'),
  fields: {
    job: relationship({ ref: 'Job.teardownDisclosure', ...readOnly }),
    teardownCostMinor: minor({ defaultValue: 0n }),
    reassemblyCostMinor: minor({ defaultValue: 0n }),
    areaDescription: systemText(),
    destroyedParts: json({ defaultValue: [], ...readOnly }),
    restorationWarning: checkbox({ defaultValue: false, ...readOnly }),
    maxReassemblyDays: integer({ defaultValue: 3, ...readOnly }),
    disclosureText: systemText(),
    disclosureTextVersion: systemText(),
    lockedAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const QualityCheck = list({
  access: roScoped('repairOrder.shop'),
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.qualityChecks', ...readOnly }),
    performedBy: relationship({ ref: 'User', ...readOnly }),
    roadTest: checkbox({ defaultValue: false, ...readOnly }),
    checklist: json({ defaultValue: [], ...readOnly }),
    notes: systemText(),
    at: timestamp({ ...readOnly }),
    result: lifecycle(['pending', 'passed', 'failed']),
    ...trackingFields,
  },
})

/** Collision boundary only (Euler decision 2): the hook for a later module and the source of the third-party-payor notice. */
export const CollisionClaimRef = list({
  access: roScoped('repairOrder.shop'),
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.collisionClaimRef', ...readOnly }),
    insurer: systemText(),
    claimNumber: systemText(),
    adjuster: json({ ...readOnly }),
    drpProgram: systemText(),
    externalEstimateSystem: systemChoice(['other', 'ccc_one', 'mitchell', 'audatex']),
    externalEstimateRef: systemText(),
    thirdPartyEstimate: relationship({ ref: 'Document', ...readOnly }),
    notes: systemText(),
    ...trackingFields,
  },
})

/**
 * A to-do for a person (callbacks, authorization follow-ups, reassembly due). Agents and timers create
 * tasks; only staff close them. A voice "yes" becomes a callback task, never an authorization.
 */
export const StaffTask = list({
  access: shopScoped(governed(['canReadRepairOrders', 'canManageSchedule'])),
  ui: { labelField: 'title', listView: { initialColumns: ['shop', 'kind', 'title', 'dueAt', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    kind: systemChoice(['authorization_callback', 'authorization_follow_up', 'customer_callback', 'reassembly_due', 'other']),
    title: systemText({ required: true }),
    detail: systemText(),
    repairOrder: relationship({ ref: 'RepairOrder.tasks', ...readOnly }),
    authorizationRequest: relationship({ ref: 'AuthorizationRequest', ...readOnly }),
    assignee: relationship({ ref: 'User', ...readOnly }),
    createdByUser: relationship({ ref: 'User', ...readOnly }),
    createdByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    source: systemChoice(['staff', 'agent', 'voice', 'timer', 'public_api']),
    evidence: json({ ...readOnly }),
    dueAt: timestamp({ ...readOnly }),
    doneAt: timestamp({ ...readOnly }),
    doneBy: relationship({ ref: 'User', ...readOnly }),
    outcome: systemText(),
    status: lifecycle(['open', 'done', 'cancelled']),
    version: versionField(),
    ...trackingFields,
  },
})

