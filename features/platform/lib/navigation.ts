import {
  BookOpenCheck, CalendarDays, Car, ClipboardCheck, ClipboardList, Columns3, FileText, ListChecks, LucideIcon, Scale, Settings, Store, Users, Wrench, BookTemplate, Receipt, Landmark, Package, Timer, Building2, FileSpreadsheet,
  BarChart3, BookOpenText, Upload, Plug, BellRing, MessageSquare, Megaphone, Bot, Stethoscope, ListTodo,
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
  { title: 'Work board', href: '/platform/board', color: 'orange', description: 'Every open repair order by stage, with promised-time risk.', icon: Columns3, group: 'standalone' },
  { title: 'Repair orders', href: '/platform/repair-orders', color: 'orange', description: 'Jobs, lines, estimates and authorizations.', icon: FileText, group: 'standalone' },
  { title: 'Inspections', href: '/platform/inspections', color: 'green', description: 'Digital vehicle inspections: measurements, photos and findings.', icon: ListChecks, group: 'standalone' },
  { title: 'Check-in', href: '/platform/check-in', color: 'blue', description: 'Customer, vehicle, odometer, concerns and work-order signature.', icon: ClipboardList, group: 'standalone' },
  { title: 'Schedule', href: '/platform/schedule', color: 'green', description: 'Appointments by day and bay, capacity and no-shows.', icon: CalendarDays, group: 'standalone' },
  { title: 'Customers', href: '/platform/customers', color: 'violet', description: 'Customers, contacts and consent history.', icon: Users, group: 'standalone' },
  { title: 'Vehicles', href: '/platform/vehicles', color: 'cyan', description: 'VIN decode, recalls, ownership and odometer history.', icon: Car, group: 'standalone' },
  { title: 'Follow-ups', href: '/platform/follow-ups', color: 'amber', description: 'Work customers put off and services coming due, with who to call.', icon: BellRing, group: 'standalone' },
  { title: 'Messages', href: '/platform/messages', color: 'blue', description: 'The record of calls, texts and emails with customers, and the wording staff copy.', icon: MessageSquare, group: 'standalone' },
  { title: 'Campaigns', href: '/platform/campaigns', color: 'violet', description: 'Audience lists to export or copy from. Only customers who agreed to marketing in writing.', icon: Megaphone, group: 'standalone' },
  { title: 'Receivables', href: '/platform/receivables', color: 'green', description: 'Invoices still owing, with the overdue ones first.', icon: Receipt, group: 'standalone' },
  { title: 'Accounts', href: '/platform/accounts', color: 'violet', description: 'Fleet and business accounts: terms, credit, approvers, tax certificates and units.', icon: Building2, group: 'standalone' },
  { title: 'Statements', href: '/platform/statements', color: 'green', description: 'Monthly account statements, exported as files.', icon: FileSpreadsheet, group: 'standalone' },
  { title: 'Day close', href: '/platform/day-close', color: 'green', description: 'Takings by tender, the drawer count and the frozen day.', icon: Landmark, group: 'standalone' },
  { title: 'Parts', href: '/platform/parts', color: 'blue', description: 'Quotes, supplier orders, stock, cores, supplier invoices and tire registrations.', icon: Package, group: 'standalone' },
  { title: 'Labor', href: '/platform/time', color: 'orange', description: 'Time clock, technicians and certificates, flagged hours, pay periods and comebacks.', icon: Timer, group: 'standalone' },
  { title: 'Approvals', href: '/platform/approvals', color: 'amber', description: 'Maker-checker requests waiting for a second person.', icon: ClipboardCheck, group: 'standalone' },

  { title: 'Diagnosis', href: '/platform/diagnosis', color: 'cyan', description: 'Likely causes with their sources, tests, and the confidence bar before a quote.', icon: Stethoscope, group: 'standalone' },
  { title: 'Assistant plans', href: '/platform/proposals', color: 'amber', description: 'Plans assistants made, previewed and waiting for a person to confirm each step.', icon: ListTodo, group: 'standalone' },
  { title: 'Reports', href: '/platform/reports', color: 'green', description: 'Car count, ARO, ELR, gross profit, technician productivity, approval and comeback rates, with definitions and books tie-outs.', icon: BarChart3, group: 'standalone' },
  { title: 'Accounting export', href: '/platform/accounting', color: 'green', description: 'Daily journal files staged for the books. Nothing posts until a person records the books accepted it.', icon: BookOpenText, group: 'standalone' },
  { title: 'Imports', href: '/platform/imports', color: 'slate', description: 'Bring customers and vehicles in from Tekmetric, Shopmonkey or any CSV, with a preview first.', icon: Upload, group: 'settings' },
  { title: 'Integrations', href: '/platform/integrations', color: 'slate', description: 'Provider connections and what they told us.', icon: Plug, group: 'settings' },
  { title: 'Shops', href: '/platform/shops', color: 'slate', description: 'Shops, bays, hours and staff memberships.', icon: Store, group: 'settings' },
  { title: 'Canned jobs', href: '/platform/canned-jobs', color: 'slate', description: 'Job templates: lines, labor-guide codes and wording, drafted then published.', icon: BookTemplate, group: 'settings' },
  { title: 'Policies', href: '/platform/policies', color: 'slate', description: 'Jurisdiction rules, labor rates, matrices, fees, tax and warranty: draft and publish.', icon: Scale, group: 'settings' },
  { title: 'Assistants', href: '/platform/agents', color: 'slate', description: 'Assistants, what each may do, the AI provider and pausing.', icon: Bot, group: 'settings' },
  { title: 'Audit log', href: '/platform/audit', color: 'slate', description: 'Hash-chained audit events and chain verification.', icon: BookOpenCheck, group: 'settings' },
]

/** Routes that exist in this build. Others stay out of the menu until their phase ships. */
export const SHIPPED_ROUTES = new Set<string>(['/platform/follow-ups', '/platform/messages', '/platform/campaigns', '/platform/accounts', '/platform/statements', '/platform/time', '/platform/technicians', '/platform/pay-periods', '/platform/comebacks', '/platform/parts', '/platform/purchase-orders', '/platform/stock', '/platform/cores', '/platform/supplier-invoices', '/platform/tires', '/platform/board', '/platform/repair-orders', '/platform/inspections', '/platform/canned-jobs', '/platform/check-in', '/platform/schedule', '/platform/customers', '/platform/vehicles', '/platform/approvals', '/platform/receivables', '/platform/day-close', '/platform/shops', '/platform/policies', '/platform/audit', '/platform/agents', '/platform/proposals', '/platform/diagnosis'])

const shipped = platformNavItems.filter(item => SHIPPED_ROUTES.has(item.href))

export const platformStandaloneItems = shipped.filter(item => item.group === 'standalone')

export const platformNavGroups: PlatformNavGroup[] = [
  { id: 'shop', title: 'Shop', icon: Wrench, items: shipped.filter(i => i.group === 'shop') },
  { id: 'settings', title: 'Settings', icon: Settings, items: shipped.filter(i => i.group === 'settings') },
]

export function getPlatformNavItemsWithBasePath(basePath: string) {
  return shipped.map(item => ({ ...item, href: `${basePath}${item.href}` }))
}
