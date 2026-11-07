import {
  BookOpenCheck, CalendarDays, Car, ClipboardCheck, ClipboardList, LucideIcon, Scale, Settings, Store, Users, Wrench,
} from 'lucide-react'

export interface PlatformNavItem {
  title: string
  href: string
  color: string
  description: string
  icon: LucideIcon
  group?: string
}

export interface PlatformNavGroup {
  id: string
  title: string
  icon: LucideIcon
  items: PlatformNavItem[]
}

/**
 * Staff dashboard screens (BUILD-PLAN §2). Each route is a thin wrapper in app/dashboard/(admin)/platform
 * over a feature slice in features/platform/<slice>. A screen is listed here when it ships.
 * No customer-facing screens live here: the storefront waits for the owner's design pick (BUILD-PLAN §3).
 */
export const platformNavItems: PlatformNavItem[] = [
  { title: 'Check-in', href: '/platform/check-in', color: 'blue', description: 'Customer, vehicle, odometer, concerns and work-order signature.', icon: ClipboardList, group: 'standalone' },
  { title: 'Schedule', href: '/platform/schedule', color: 'green', description: 'Appointments by day and bay, capacity and no-shows.', icon: CalendarDays, group: 'standalone' },
  { title: 'Customers', href: '/platform/customers', color: 'violet', description: 'Customers, contacts and consent history.', icon: Users, group: 'standalone' },
  { title: 'Vehicles', href: '/platform/vehicles', color: 'cyan', description: 'VIN decode, recalls, ownership and odometer history.', icon: Car, group: 'standalone' },
  { title: 'Approvals', href: '/platform/approvals', color: 'amber', description: 'Maker-checker requests waiting for a second person.', icon: ClipboardCheck, group: 'standalone' },

  { title: 'Shops', href: '/platform/shops', color: 'slate', description: 'Shops, bays, hours and staff memberships.', icon: Store, group: 'settings' },
  { title: 'Policies', href: '/platform/policies', color: 'slate', description: 'Jurisdiction rules, labor rates, matrices, fees, tax and warranty: draft and publish.', icon: Scale, group: 'settings' },
  { title: 'Audit log', href: '/platform/audit', color: 'slate', description: 'Hash-chained audit events and chain verification.', icon: BookOpenCheck, group: 'settings' },
]

/** Routes that exist in this build. Others stay out of the menu until their phase ships. */
export const SHIPPED_ROUTES = new Set<string>(['/platform/check-in', '/platform/schedule', '/platform/customers', '/platform/vehicles', '/platform/approvals', '/platform/shops', '/platform/policies', '/platform/audit'])

const shipped = platformNavItems.filter(item => SHIPPED_ROUTES.has(item.href))

export const platformStandaloneItems = shipped.filter(item => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'shop', title: 'Shop', icon: Wrench, items: shipped.filter(i => i.group === 'shop') },
  { id: 'settings', title: 'Settings', icon: Settings, items: shipped.filter(i => i.group === 'settings') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return shipped.map(item => ({ ...item, href: `${basePath}${item.href}` }))
}
