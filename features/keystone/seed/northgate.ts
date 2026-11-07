import type { Permission } from '../access'

/**
 * Northgate Auto Group (BUILD-PLAN §5). Every name and address is fictitious. Ids are deterministic
 * (`seed_…`) so loading twice changes nothing.
 */

export const ORG = {
  legalName: 'Northgate Auto Group LLC',
  displayName: 'Northgate Auto Group',
  defaultTimeZone: 'America/Los_Angeles',
}

const WEEKDAY = (open: string, close: string, saturday?: [string, string]) => [
  ...[1, 2, 3, 4, 5].map(dow => ({ dow, open, close })),
  ...(saturday ? [{ dow: 6, open: saturday[0], close: saturday[1] }] : []),
]

export const SHOPS = [
  {
    id: 'seed_shop_nga', code: 'NGA', name: 'Northgate Auto Care', legalName: 'Northgate Auto Group LLC',
    addressLine1: '2215 Northgate Blvd', city: 'Sacramento', region: 'CA', postalCode: '95833', phone: '+19165550142', email: 'service@northgateautocare.com',
    registrations: { barArd: 'ARD-000000', epaId: 'CAR000000000', sellerPermit: 'SR-XX-000-000000', tireFeeAccount: 'TF-000000' },
    weeklyHours: WEEKDAY('07:30', '18:00', ['08:00', '14:00']),
    bays: [
      ...Array.from({ length: 6 }, (_, i) => ({ code: `B${i + 1}`, name: `Bay ${i + 1}`, kind: 'general' })),
      { code: 'B7', name: 'Bay 7 (heavy lift)', kind: 'lift_heavy' },
      { code: 'AL1', name: 'Alignment', kind: 'alignment' },
    ],
  },
  {
    id: 'seed_shop_ngt', code: 'NGT', name: 'Northgate Tire & Lube', legalName: 'Northgate Auto Group LLC',
    addressLine1: '480 Galleria Way', city: 'Roseville', region: 'CA', postalCode: '95678', phone: '+19165550178', email: 'roseville@northgateautocare.com',
    registrations: { barArd: 'ARD-000001', epaId: 'CAR000000001', sellerPermit: 'SR-XX-000-000001', tireFeeAccount: 'TF-000001' },
    weeklyHours: WEEKDAY('08:00', '18:00', ['08:00', '16:00']),
    bays: [
      { code: 'T1', name: 'Tire bay 1', kind: 'tire' },
      { code: 'T2', name: 'Tire bay 2', kind: 'tire' },
      { code: 'AL1', name: 'Alignment', kind: 'alignment' },
      { code: 'QL1', name: 'Quick lube 1', kind: 'quick_lube' },
      { code: 'QL2', name: 'Quick lube 2', kind: 'quick_lube' },
    ],
  },
] as const

/** Holidays both shops close for, 2026-2027 (shop choice, not law). */
export const SHOP_CLOSURES = [
  ['2026-11-26', 'Thanksgiving'], ['2026-12-25', 'Christmas Day'], ['2027-01-01', "New Year's Day"],
  ['2027-05-31', 'Memorial Day'], ['2027-07-05', 'Independence Day (observed)'], ['2027-09-06', 'Labor Day'],
  ['2027-11-25', 'Thanksgiving'], ['2027-12-24', 'Christmas Eve'], ['2027-12-31', "New Year's Eve"],
] as const
export const CALENDAR_COVERAGE_THROUGH = '2027-12-31'

type RoleSeed = { id: string; name: string; description: string; permissions: Permission[]; dashboard?: boolean }

const STAFF_BASE: Permission[] = ['canAccessDashboard', 'canSeeOtherPeople', 'canReadRepairOrders']
const COUNTER: Permission[] = ['canManageCustomers', 'canReadCustomerPII', 'canManageSchedule', 'canWriteRepairOrders', 'canSendEstimates', 'canRecordAuthorizations', 'canPriceJobs', 'canFinalizeInvoices', 'canTakePayments', 'canCloseDay', 'canMessageCustomers', 'canManageTireRegistrations']

/** The 11 seeded roles (SCHEMA §1.5, DOMAIN §9). canBreakGlass is never seeded. */
export const ROLES: RoleSeed[] = [
  {
    id: 'seed_role_owner', name: 'Owner', description: 'Everything in the organisation, including approvals of last resort.',
    permissions: [
      ...STAFF_BASE, ...COUNTER, 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canManageOnboarding', 'canManagePayments', 'canIssueRefunds', 'canReadAudit',
      'canManageOrganization', 'canManageShops', 'canManageIntegrations', 'canAccessAllShops', 'canManagePolicies', 'canPublishPolicies', 'canApproveMerge',
      'canApproveReopen', 'canApproveRelease', 'canPerformInspections', 'canDiagnose', 'canOverrideTrustGate', 'canApprovePriceOverride', 'canApproveDiscount', 'canSeeCost',
      'canManageParts', 'canOrderParts', 'canReceiveParts', 'canApproveSupplierInvoice', 'canApproveStockAdjustment', 'canApproveCoreWriteOff',
      'canManageTime', 'canApproveTime', 'canClosePayPeriod', 'canReadTechPay', 'canApproveRefund', 'canApproveWriteOff', 'canApproveCredit', 'canApproveCreditMemo', 'canReadFinancials',
      'canManageComebacks', 'canApproveGoodwill', 'canManageCampaigns', 'canManageAgents', 'canConfirmProposals', 'canApproveAgentAutonomy', 'canReadReports',
    ],
  },
  {
    id: 'seed_role_manager', name: 'Shop Manager', description: 'Runs a shop: drafts policy, approves discounts, overrides, write-offs and time.',
    permissions: [
      ...STAFF_BASE, ...COUNTER, 'canManagePeople', 'canIssueRefunds', 'canReadAudit', 'canManageShops', 'canManagePolicies', 'canApproveMerge', 'canApproveReopen', 'canApproveRelease',
      'canOverrideTrustGate', 'canApprovePriceOverride', 'canApproveDiscount', 'canSeeCost', 'canManageParts', 'canOrderParts', 'canApproveSupplierInvoice', 'canApproveStockAdjustment',
      'canApproveCoreWriteOff', 'canManageTime', 'canApproveTime', 'canClosePayPeriod', 'canReadTechPay', 'canApproveRefund', 'canApproveWriteOff', 'canApproveCredit', 'canApproveCreditMemo',
      'canReadFinancials', 'canManageComebacks', 'canApproveGoodwill', 'canManageAgents', 'canConfirmProposals', 'canReadReports',
    ],
  },
  { id: 'seed_role_advisor', name: 'Service Advisor', description: 'Front counter: customers, appointments, ROs, estimates, authorizations, invoices and payments. No cost view.', permissions: [...STAFF_BASE, ...COUNTER, 'canConfirmProposals', 'canReadReports'] },
  { id: 'seed_role_lead_tech', name: 'Lead Technician', description: 'Dispatch, quality checks and the team clocks.', permissions: [...STAFF_BASE, 'canPerformInspections', 'canDiagnose', 'canClockSelf', 'canManageTime', 'canWriteRepairOrders', 'canReadReports'] },
  { id: 'seed_role_tech', name: 'Technician', description: 'Assigned jobs, inspections, diagnosis and own clocks. No customer financials.', permissions: ['canAccessDashboard', 'canReadRepairOrders', 'canPerformInspections', 'canDiagnose', 'canClockSelf'] },
  { id: 'seed_role_parts', name: 'Parts Manager', description: 'Suppliers, quotes, orders, receiving, stock, cores and supplier invoices.', permissions: [...STAFF_BASE, 'canManageParts', 'canOrderParts', 'canReceiveParts', 'canSeeCost', 'canManageTireRegistrations', 'canReadReports'] },
  { id: 'seed_role_bookkeeper', name: 'Bookkeeper', description: 'Payments, AR, statements, day close and accounting exports.', permissions: [...STAFF_BASE, 'canTakePayments', 'canCloseDay', 'canFinalizeInvoices', 'canReadFinancials', 'canSeeCost', 'canReadTechPay', 'canManagePayments', 'canReadCustomerPII', 'canReadReports'] },
  { id: 'seed_role_marketing', name: 'Marketing', description: 'Templates, consent-gated campaigns and reviews. No RO edits.', permissions: ['canAccessDashboard', 'canManageCampaigns', 'canMessageCustomers', 'canReadReports'] },
  { id: 'seed_role_auditor', name: 'Auditor', description: 'Read-only and time-boxed by the user access expiry.', permissions: [...STAFF_BASE, 'canReadAudit', 'canReadFinancials', 'canReadCustomerPII', 'canReadReports', 'canAccessAllShops'] },
  { id: 'seed_role_portal', name: 'Customer Portal', description: 'Storefront API session only; no dashboard.', permissions: [], dashboard: false },
  { id: 'seed_role_fleet', name: 'Fleet Approver', description: 'Fleet portal API session only; no dashboard.', permissions: [], dashboard: false },
]

export type StaffSeed = { id: string; name: string; email: string; title: string; roleId: string; kind: 'staff' | 'auditor'; shops: string[]; accessDays?: number }

const shopBoth = ['seed_shop_nga', 'seed_shop_ngt']
const email = (local: string) => `${local}@northgateautocare.com`

export const STAFF: StaffSeed[] = [
  { id: 'seed_user_whitfield', name: 'Dana Whitfield', email: email('dana.whitfield'), title: 'Owner', roleId: 'seed_role_owner', kind: 'staff', shops: shopBoth },
  { id: 'seed_user_ortega', name: 'Marcus Ortega', email: email('marcus.ortega'), title: 'Shop Manager, Northgate Auto Care', roleId: 'seed_role_manager', kind: 'staff', shops: ['seed_shop_nga'] },
  { id: 'seed_user_shah', name: 'Priya Shah', email: email('priya.shah'), title: 'Service Advisor', roleId: 'seed_role_advisor', kind: 'staff', shops: ['seed_shop_nga'] },
  { id: 'seed_user_becker', name: 'Tom Becker', email: email('tom.becker'), title: 'Service Advisor', roleId: 'seed_role_advisor', kind: 'staff', shops: ['seed_shop_ngt'] },
  { id: 'seed_user_ramirez', name: 'Luis Ramirez', email: email('luis.ramirez'), title: 'Lead Technician (ASE A1-A8, EPA 609)', roleId: 'seed_role_lead_tech', kind: 'staff', shops: ['seed_shop_nga'] },
  { id: 'seed_user_tran', name: 'Kevin Tran', email: email('kevin.tran'), title: 'Technician', roleId: 'seed_role_tech', kind: 'staff', shops: ['seed_shop_nga'] },
  { id: 'seed_user_morgan', name: 'Aisha Morgan', email: email('aisha.morgan'), title: 'Technician', roleId: 'seed_role_tech', kind: 'staff', shops: ['seed_shop_ngt'] },
  { id: 'seed_user_holloway', name: 'Jake Holloway', email: email('jake.holloway'), title: 'Technician (EPA 609 expired)', roleId: 'seed_role_tech', kind: 'staff', shops: ['seed_shop_nga'] },
  { id: 'seed_user_delgado', name: 'Rosa Delgado', email: email('rosa.delgado'), title: 'Parts Manager', roleId: 'seed_role_parts', kind: 'staff', shops: shopBoth },
  { id: 'seed_user_park', name: 'Helen Park', email: email('helen.park'), title: 'Bookkeeper', roleId: 'seed_role_bookkeeper', kind: 'staff', shops: shopBoth },
  { id: 'seed_user_ito', name: 'Sam Ito', email: email('sam.ito'), title: 'Marketing', roleId: 'seed_role_marketing', kind: 'staff', shops: shopBoth },
  { id: 'seed_user_auditor', name: 'L. Navarro', email: 'l.navarro@navarrocpa.com', title: 'CPA, Navarro & Co (guest)', roleId: 'seed_role_auditor', kind: 'auditor', shops: [], accessDays: 30 },
]

export const AGENTS = [
  { id: 'seed_agent_front_desk', name: 'Front Desk Assistant', kind: 'llm_agent', ownerId: 'seed_user_ortega', shops: shopBoth },
  { id: 'seed_agent_parts_runner', name: 'Parts Runner', kind: 'llm_agent', ownerId: 'seed_user_delgado', shops: shopBoth },
  { id: 'seed_agent_diag_helper', name: 'Diag Helper', kind: 'llm_agent', ownerId: 'seed_user_ramirez', shops: ['seed_shop_nga'] },
] as const

export type PolicySeed = { action: string; description: string; requiredPermission: Permission; expiresAfterMinutes: number; thresholdMinor?: bigint }

/** Maker-checker actions (SCHEMA §19 [AP]). Later phases consume these by action name. */
export const APPROVAL_POLICIES: PolicySeed[] = [
  { action: 'policy.publish', description: 'Publish a policy version (jurisdiction, labor, parts, fees, tax, warranty, shop policy).', requiredPermission: 'canPublishPolicies', expiresAfterMinutes: 3 * 1440 },
  { action: 'customer.merge', description: 'Merge two customer records.', requiredPermission: 'canApproveMerge', expiresAfterMinutes: 1440 },
  { action: 'ro.reopen', description: 'Reopen an invoiced or closed repair order.', requiredPermission: 'canApproveReopen', expiresAfterMinutes: 240 },
  { action: 'vehicle.release_with_balance', description: 'Release a vehicle with an unpaid balance.', requiredPermission: 'canApproveRelease', expiresAfterMinutes: 240 },
  { action: 'price.override', description: 'Price a line below the margin floor.', requiredPermission: 'canApprovePriceOverride', expiresAfterMinutes: 240 },
  { action: 'discount.over_limit', description: "Discount above the requester's role limit.", requiredPermission: 'canApproveDiscount', expiresAfterMinutes: 240 },
  { action: 'trust_gate.override', description: 'Send a diagnosis-based job below the confidence threshold.', requiredPermission: 'canOverrideTrustGate', expiresAfterMinutes: 240 },
  { action: 'supplier_invoice.approve', description: 'Approve a supplier invoice for payment.', requiredPermission: 'canApproveSupplierInvoice', expiresAfterMinutes: 3 * 1440 },
  { action: 'stock.adjust', description: 'Post a cycle-count variance or stock adjustment.', requiredPermission: 'canApproveStockAdjustment', expiresAfterMinutes: 1440 },
  { action: 'core.write_off', description: 'Write off an uncredited core.', requiredPermission: 'canApproveCoreWriteOff', expiresAfterMinutes: 1440 },
  { action: 'time.correction', description: 'Correct a clock entry.', requiredPermission: 'canApproveTime', expiresAfterMinutes: 3 * 1440 },
  { action: 'pay_period.close', description: 'Close a pay period.', requiredPermission: 'canClosePayPeriod', expiresAfterMinutes: 1440 },
  { action: 'refund.issue', description: 'Refund a customer payment.', requiredPermission: 'canApproveRefund', expiresAfterMinutes: 240, thresholdMinor: 0n },
  { action: 'invoice.write_off', description: 'Write off an invoice balance.', requiredPermission: 'canApproveWriteOff', expiresAfterMinutes: 1440 },
  { action: 'credit_memo.issue', description: 'Issue a credit memo above the threshold.', requiredPermission: 'canApproveCreditMemo', expiresAfterMinutes: 1440, thresholdMinor: 5000n },
  { action: 'account.credit_hold_release', description: 'Release a business account from credit hold or extend credit.', requiredPermission: 'canApproveCredit', expiresAfterMinutes: 1440 },
  { action: 'day.reopen', description: 'Reopen a closed business day.', requiredPermission: 'canApproveRefund', expiresAfterMinutes: 240 },
  { action: 'goodwill.approve', description: 'No-charge comeback outside coverage.', requiredPermission: 'canApproveGoodwill', expiresAfterMinutes: 1440 },
  { action: 'agent_grant.activate', description: 'Activate a tool grant for an AI agent.', requiredPermission: 'canApproveAgentAutonomy', expiresAfterMinutes: 1440 },
  { action: 'agent.autonomy', description: 'Change agent autonomy for an action class.', requiredPermission: 'canApproveAgentAutonomy', expiresAfterMinutes: 1440 },
  { action: 'org.controls', description: 'Change organisation-wide agent controls.', requiredPermission: 'canApproveAgentAutonomy', expiresAfterMinutes: 1440 },
  { action: 'role.assign_approval', description: 'Give a person a role that can approve.', requiredPermission: 'canManageRoles', expiresAfterMinutes: 1440 },
]
