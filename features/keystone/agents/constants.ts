/** Catalogue values shared by the models, the commands and the screens (kept out of models/ so the list spread stays lists only). */
export const AGENT_SCOPES = [
  'ro.read', 'ro.propose', 'estimate.price', 'estimate.send_request', 'parts.quote', 'parts.order_within_policy', 'booking.create',
  'messages.draft', 'messages.send_transactional', 'messages.send_marketing', 'diagnosis.run', 'supplier_invoice.reconcile', 'reports.read', 'customer.read_pii',
] as const
export type AgentScope = (typeof AGENT_SCOPES)[number]

export const PROPOSAL_STATES = ['drafted', 'previewed', 'confirmed', 'executing', 'executed', 'rejected', 'stale', 'failed'] as const
export const SOURCE_KINDS = ['oem', 'licensed', 'government', 'shop_history', 'forum_checked'] as const

/** What a person needs to hold for an agent to use a scope for them (the intersection rule, I-A1). Any one of the list. */
export const SCOPE_PERMISSIONS: Record<AgentScope, readonly string[]> = {
  'ro.read': ['canReadRepairOrders'],
  'ro.propose': ['canWriteRepairOrders'],
  'estimate.price': ['canPriceJobs'],
  'estimate.send_request': ['canSendEstimates'],
  'parts.quote': ['canOrderParts', 'canManageParts'],
  'parts.order_within_policy': ['canOrderParts'],
  'booking.create': ['canManageSchedule'],
  'messages.draft': ['canMessageCustomers'],
  'messages.send_transactional': ['canMessageCustomers'],
  'messages.send_marketing': ['canManageCampaigns'],
  'diagnosis.run': ['canDiagnose'],
  'supplier_invoice.reconcile': ['canManageParts', 'canApproveSupplierInvoice'],
  'reports.read': ['canReadReports'],
  'customer.read_pii': ['canReadCustomerPII'],
}

/** Plain words for the screens (no codes in the UI). */
export const SCOPE_LABELS: Record<AgentScope, string> = {
  'ro.read': 'Read repair orders, customers and vehicles',
  'ro.propose': 'Propose repair orders, jobs and comebacks',
  'estimate.price': 'Propose job prices and estimates',
  'estimate.send_request': 'Propose estimate versions and authorization links',
  'parts.quote': 'Look up parts and propose supplier quotes',
  'parts.order_within_policy': 'Propose supplier orders',
  'booking.create': 'Propose appointments and reschedules',
  'messages.draft': 'Draft messages for staff to copy',
  'messages.send_transactional': 'Draft status updates for staff to copy',
  'messages.send_marketing': 'Draft marketing wording for staff to copy',
  'diagnosis.run': 'Propose diagnosis sessions and hypotheses',
  'supplier_invoice.reconcile': 'Propose supplier invoice checks and dispute drafts',
  'reports.read': 'Read shop reports',
  'customer.read_pii': 'See customers\' phone numbers and email addresses',
}

/**
 * Nothing in the registry may do these (INTEGRATIONS §8 "never exposed"). A request for one is refused with
 * AGENT_FORBIDDEN_ACTION; a test walks the registry and the GraphQL guard against this list.
 */
export const NEVER_EXPOSED = [
  'recordAuthorization', 'recordCustomerAuthorization', 'recordJobDecision', 'finalizeInvoice', 'finalizeShopInvoice', 'issueRefund', 'refundShopPayment',
  'writeOffInvoice', 'issueCreditMemo', 'issueShopCreditMemo', 'overrideLinePrice', 'applyDiscount', 'decideApproval', 'decideApprovalRequest',
  'approveSupplierInvoice', 'mergeCustomers', 'recordConsent', 'recordContactConsent', 'overrideTrustGate', 'releaseVehicle', 'releaseShopVehicle',
  'publishPolicyVersion', 'setAgentAutonomy', 'configureConnection', 'takeShopPayment', 'closeCallbackTask',
] as const

/** Auto-confirm is only ever possible for these action classes, and only when the shop policy says auto_within_policy. */
export const AUTO_ELIGIBLE = ['send_transactional_status'] as const
