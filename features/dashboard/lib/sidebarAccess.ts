/**
 * Sidebar filtering from capabilities the session already has: the role's
 * canAccessDashboard flag and Keystone's per-session list `isHidden` from admin meta.
 * Plain module: no 'use server' / 'use client', no @/ imports.
 */

type SidebarList = { path: string; isHidden?: boolean | null }
type PagePermission = 'canReadAudit' | 'canCloseDay' | 'canReadFinancials' | 'canReadReports' | 'canManageIntegrations' | 'canMessageCustomers' | 'canManageCustomers' | 'canManageCampaigns' | 'canReadRepairOrders' | 'canManagePolicies' | 'canManageShops'
type SidebarUser = { role?: ({ canAccessDashboard?: boolean | null; canManageRoles?: boolean | null; canManageOrganization?: boolean | null } & Partial<Record<PagePermission, boolean | null>>) | null } | null | undefined

/** Pages that need a permission the role may lack: the link is shown only when the role holds one of them. */
const PLATFORM_PAGE_PERMISSIONS: Record<string, PagePermission[]> = {
  audit: ['canReadAudit'],
  'day-close': ['canCloseDay', 'canReadFinancials'],
  statements: ['canReadFinancials'],
  reports: ['canReadReports', 'canReadFinancials'],
  accounting: ['canCloseDay', 'canReadFinancials'],
  imports: ['canManageIntegrations'],
  integrations: ['canManageIntegrations'],
  messages: ['canMessageCustomers', 'canManageCustomers', 'canManageCampaigns'],
  campaigns: ['canManageCampaigns', 'canMessageCustomers'],
  accounts: ['canReadRepairOrders', 'canManageCustomers'],
  website: ['canManagePolicies', 'canManageShops'],
}

/** Only an explicit false hides navigation; an unknown user is left to the middleware. */
export function canUseDashboardNav(user: SidebarUser) {
  return user?.role?.canAccessDashboard !== false
}

/**
 * The raw record lists ("Models") are for whoever administers the system: a role that manages roles or the
 * organisation (the owner, the first account). Everyone else works from the shop pages above them.
 */
export function canSeeModels(user: SidebarUser) {
  return canUseDashboardNav(user) && Boolean(user?.role?.canManageRoles || user?.role?.canManageOrganization)
}

export function visibleSidebarLists<T extends SidebarList>(lists: T[], user: SidebarUser): T[] {
  if (!canUseDashboardNav(user)) return []
  return lists.filter((list) => !list.isHidden)
}

/**
 * A platform page whose first segment is a list path follows that list's visibility;
 * pages that are not tied to one list stay visible to dashboard users.
 */
export function visiblePlatformItems<T extends { href: string }>(
  items: T[],
  lists: SidebarList[],
  user: SidebarUser
): T[] {
  if (!canUseDashboardNav(user)) return []
  const hiddenPaths = new Set(lists.filter((list) => list.isHidden).map((list) => list.path))
  return items.filter((item) => {
    const slug = item.href.split('/platform/')[1]?.split(/[/?#]/)[0]
    if (slug && hiddenPaths.has(slug)) return false
    const needs = slug ? PLATFORM_PAGE_PERMISSIONS[slug] : undefined
    return !needs || needs.some((name) => user?.role?.[name] === true)
  })
}
