import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'

/** Staff reads go through the signed-in session, so list access rules still apply. */
export async function q<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await keystoneClient<T>(query, variables)
  if (!r.success) throw new Error(r.error)
  return r.data as T
}

/** The organisation's default time zone (OrganizationSettings.defaultTimeZone), Los Angeles by default. */
export async function orgTimeZone(): Promise<string> {
  try {
    const d: any = await q(`{ organizationSettings { defaultTimeZone } }`)
    return d.organizationSettings?.defaultTimeZone || 'America/Los_Angeles'
  } catch {
    return 'America/Los_Angeles'
  }
}

/** Whether the signed-in role holds at least one of these permissions (for pages whose queries would otherwise be refused). */
export async function holdsAny(names: ('canReadAudit' | 'canCloseDay' | 'canReadFinancials' | 'canReadRepairOrders' | 'canManageCustomers')[]): Promise<boolean> {
  try {
    const d: any = await q(`{ authenticatedItem { ... on User { role { ${names.join(' ')} } } } }`)
    const role = d.authenticatedItem?.role
    return names.some((n) => role?.[n] === true)
  } catch {
    return false
  }
}
