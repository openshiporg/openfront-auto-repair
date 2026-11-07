// Role permissions (SCHEMA §1.5). Operate and approve permissions come in pairs so one person never
// needs both halves of a control; the separation-of-duties check still blocks self-approval when a
// user happens to hold both.
export const permissionNames = [
  // NKS and fleet-mandatory
  'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canAccessDashboard',
  'canManageOnboarding', 'canManagePayments', 'canIssueRefunds', 'canReadAudit',
  // Organisation
  'canManageOrganization', 'canManageShops', 'canManageIntegrations', 'canAccessAllShops',
  // Policy
  'canManagePolicies', 'canPublishPolicies',
  // Customers
  'canManageCustomers', 'canApproveMerge', 'canReadCustomerPII',
  // Scheduling
  'canManageSchedule',
  // Repair orders
  'canWriteRepairOrders', 'canSendEstimates', 'canRecordAuthorizations', 'canApproveReopen', 'canApproveRelease', 'canReadRepairOrders',
  // Inspections and diagnosis
  'canPerformInspections', 'canDiagnose', 'canOverrideTrustGate',
  // Pricing
  'canPriceJobs', 'canApprovePriceOverride', 'canApproveDiscount', 'canSeeCost',
  // Parts
  'canManageParts', 'canOrderParts', 'canReceiveParts', 'canApproveSupplierInvoice', 'canApproveStockAdjustment', 'canApproveCoreWriteOff',
  // Labor
  'canClockSelf', 'canManageTime', 'canApproveTime', 'canClosePayPeriod', 'canReadTechPay',
  // Money
  'canFinalizeInvoices', 'canTakePayments', 'canCloseDay', 'canApproveRefund', 'canApproveWriteOff', 'canApproveCredit', 'canApproveCreditMemo', 'canReadFinancials',
  // Warranty
  'canManageComebacks', 'canApproveGoodwill',
  // Communications
  'canMessageCustomers', 'canManageCampaigns',
  // Tires
  'canManageTireRegistrations',
  // Agents
  'canManageAgents', 'canConfirmProposals', 'canApproveAgentAutonomy',
  // Reporting
  'canReadReports',
  // Raw status override. Never seeded on a default role; every use is audited.
  'canBreakGlass',
] as const

export type Permission = typeof permissionNames[number]

/** Permissions that let a user decide someone else's request. Assigning a role holding one of these is maker-checker. */
export const approvalPermissions = permissionNames.filter(name => name.startsWith('canApprove') || name === 'canPublishPolicies' || name === 'canBreakGlass') as Permission[]

export type Session = {
  itemId: string
  listKey: string
  data: {
    name: string
    email?: string
    kind?: string | null
    accessExpiresAt?: string | null
    role: ({ id: string; name: string } & Record<Permission, boolean>) | null
    /** Active shop memberships (SCHEMA §1.3); operational rows are filtered to these shops. */
    memberships?: { status: string; shop: { id: string } | null }[] | null
  }
}

type AccessArgs = { session?: Session | null }

/** Signed in, and not past a time-boxed access window (auditors). */
export const isSignedIn = ({ session }: AccessArgs) => {
  if (!session) return false
  const expires = session.data?.accessExpiresAt
  return !expires || Date.parse(expires) > Date.now()
}

export const hasPermission = (session: Session | null | undefined, permission: Permission) =>
  isSignedIn({ session }) && session?.data.role?.[permission] === true

export const permissions = Object.fromEntries(
  permissionNames.map(name => [name, ({ session }: AccessArgs) => hasPermission(session, name)])
) as Record<Permission, (args: AccessArgs) => boolean>

/** Any of the given permissions. */
export const anyOf = (...names: Permission[]) => ({ session }: AccessArgs) => names.some(name => hasPermission(session, name))

/** Only server code (through context.sudo()) may perform the operation. */
export const sys = () => false

/** The shops a session may see: every shop with canAccessAllShops, otherwise its active memberships. */
export function sessionShopIds(session: Session | null | undefined): string[] | 'all' {
  if (!isSignedIn({ session })) return []
  if (session!.data.role?.canAccessAllShops) return 'all'
  return (session!.data.memberships ?? []).filter(m => m.status === 'active' && m.shop?.id).map(m => m.shop!.id)
}

export const rules = {
  canReadPeople: ({ session }: AccessArgs) =>
    !isSignedIn({ session }) ? false : session!.data.role?.canSeeOtherPeople || session!.data.role?.canManagePeople ? true : { id: { equals: session!.itemId } },
  canUpdatePeople: ({ session }: AccessArgs) =>
    !isSignedIn({ session }) ? false : session!.data.role?.canEditOtherPeople || session!.data.role?.canManagePeople ? true : { id: { equals: session!.itemId } },
}
