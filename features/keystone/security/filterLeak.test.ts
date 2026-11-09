import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { permissionNames } from '../access'

/*
 * Review r2 F1: a Service Advisor (no canSeeCost) could not read cost fields but could filter and sort on them, and so recover
 * the stored value. Every field whose read access is a role function is now neither filterable nor orderable for a reader who
 * cannot read it. These tests run through Keystone's own access layer; a refused request never reaches the database, so they
 * need no database. The positive control (a role that can see cost is not refused) only checks that the refusal is not a
 * blanket one: it is allowed to fail later at the database, but never with a filter/order access error.
 */

const ADVISOR = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canFinalizeInvoices', 'canTakePayments', 'canManageCustomers', 'canManageParts', 'canOrderParts', 'canReceiveParts', 'canManageComebacks', 'canManageTireRegistrations', 'canReadFinancials', 'canManageSchedule', 'canMessageCustomers']
const sessionOf = (granted: string[], accessAll = true) => ({
  itemId: 'filter-leak-user', listKey: 'User',
  data: { name: 'Advisor', email: 'advisor@test.local', kind: 'staff', accessExpiresAt: null, memberships: [], role: { id: 'r', name: 'r', canAccessAllShops: accessAll, ...Object.fromEntries(permissionNames.map(p => [p, p === 'canAccessAllShops' ? accessAll : granted.includes(p)])) } },
})

let ctx: any
beforeAll(async () => {
  process.env.DATABASE_URL = 'postgresql://nobody:nobody@127.0.0.1:1/none?schema=vitest&connect_timeout=1'
  process.env.SESSION_SECRET ||= 'filter-leak-test-session-secret-0123456789abcdef'
  const config = (await import('../index')).default
  ctx = getContext(config, PrismaModule)
})

const run = async (granted: string[], source: string) => {
  // Keystone's own executor (same graphql instance as its schema), as the signed-in user.
  const c = ctx.withSession(sessionOf(granted))
  return c.graphql.raw({ query: source }) as Promise<{ data?: unknown; errors?: readonly { message: string }[] }>
}
const refused = (r: any) => /do not have access to perform|KS_FILTER_DENIED/.test(JSON.stringify(r.errors ?? []))

// [list query, count query, hidden field, a where value, role that CAN see it]
const COST_FIELDS: [string, string, string, string][] = [
  ['jobs', 'Job', 'costMinor', '{ gte: "0" }'], ['jobs', 'Job', 'marginMinor', '{ gte: "0" }'],
  ['jobLines', 'JobLine', 'unitCostMinor', '{ gte: "0" }'], ['jobLines', 'JobLine', 'subletCostMinor', '{ gte: "0" }'],
  ['stockLevels', 'StockLevel', 'averageCostMinor', '{ gte: "0" }'],
  ['stockMovements', 'StockMovement', 'unitCostMinor', '{ gte: "0" }'],
  ['cycleCounts', 'CycleCount', 'varianceValueMinor', '{ gte: "0" }'],
  ['supplierOrderLines', 'SupplierOrderLine', 'unitCostMinor', '{ gte: "0" }'], ['supplierOrderLines', 'SupplierOrderLine', 'coreChargeMinor', '{ gte: "0" }'],
  ['supplierInvoiceLines', 'SupplierInvoiceLine', 'unitCostMinor', '{ gte: "0" }'],
  ['supplierInvoices', 'SupplierInvoice', 'totalMinor', '{ gte: "0" }'],
  ['discrepancies', 'Discrepancy', 'amountMinor', '{ gte: "0" }'],
  ['coreObligations', 'CoreObligation', 'coreChargeMinor', '{ gte: "0" }'],
  ['supplierReturns', 'SupplierReturn', 'creditMinor', '{ gte: "0" }'],
  ['partWarrantyClaims', 'PartWarrantyClaim', 'laborReimbursementMinor', '{ gte: "0" }'],
  ['partQuotes', 'PartQuote', 'unitCostMinor', '{ gte: "0" }'],
]

describe('cost fields: filtering and sorting are refused for a role without canSeeCost (r2 F1)', () => {
  it('the table names real fields (every entry resolves to a refusal, never to "unknown field")', async () => {
    for (const [query, , field] of COST_FIELDS) {
      const r = await run(ADVISOR, `{ ${query}Count(where: { ${field}: { gte: "0" } }) }`)
      expect(JSON.stringify(r.errors ?? []), `${query}.${field}`).not.toMatch(/Unknown argument|Field "[^"]+" is not defined|Cannot query field/)
    }
  })
  for (const [query, typeName, field, where] of COST_FIELDS) {
    it(`${typeName}.${field}: filter refused`, async () => {
      const r = await run(ADVISOR, `{ ${query}Count(where: { ${field}: ${where} }) }`)
      expect(refused(r), JSON.stringify(r.errors)).toBe(true)
    })
    it(`${typeName}.${field}: sort refused`, async () => {
      const r = await run(ADVISOR, `{ ${query}(orderBy: { ${field}: asc }, take: 1) { id } }`)
      expect(refused(r), JSON.stringify(r.errors)).toBe(true)
    })
  }
  it('a role with canSeeCost is not refused', async () => {
    const r = await run([...ADVISOR, 'canSeeCost'], '{ jobsCount(where: { costMinor: { gte: "0" } }) }')
    expect(refused(r)).toBe(false)
  })
  it('a nested relationship filter cannot reach cost either', async () => {
    const r = await run(ADVISOR, '{ repairOrdersCount(where: { jobs: { some: { costMinor: { gte: "0" } } } }) }')
    expect(refused(r), JSON.stringify(r.errors)).toBe(true)
  })
})

describe('other role-hidden fields are neither filterable nor sortable (r2 F1 / F2)', () => {
  it('technician pay needs canReadTechPay', async () => {
    const r = await run(ADVISOR, '{ technicianProfilesCount(where: { flatRateMinor: { gte: "0" } }) }')
    expect(refused(r), JSON.stringify(r.errors)).toBe(true)
    const o = await run(ADVISOR, '{ technicianProfiles(orderBy: { hourlyRateMinor: asc }, take: 1) { id } }')
    expect(refused(o), JSON.stringify(o.errors)).toBe(true)
  })
  it('customer contact value needs canReadCustomerPII', async () => {
    const r = await run(ADVISOR, '{ customerContactsCount(where: { value: { contains: "555" } }) }')
    expect(refused(r), JSON.stringify(r.errors)).toBe(true)
    const o = await run(ADVISOR, '{ customerContacts(orderBy: { value: asc }, take: 1) { id } }')
    expect(refused(o), JSON.stringify(o.errors)).toBe(true)
  })
  it('the contact valueHash is not in the API at all, for any role', async () => {
    const all = [...permissionNames]
    for (const source of [
      '{ customerContacts(take: 1) { valueHash } }',
      '{ customerContactsCount(where: { valueHash: { startsWith: "h1:" } }) }',
      '{ customerContacts(orderBy: { valueHash: asc }, take: 1) { id } }',
    ]) {
      const r = await run(all, source)
      expect(r.errors?.length, source).toBeGreaterThan(0)
      expect(JSON.stringify(r.errors)).toMatch(/valueHash|Cannot query|not defined|Unknown/)
    }
  })
})

describe('every list query is bounded (r2 F3)', () => {
  it('rejects an oversized take on a list', async () => {
    const r = await run(ADVISOR, '{ jobs(take: 100000) { id } }')
    expect(JSON.stringify(r.errors ?? [])).toMatch(/limit|take|exceed/i)
  })
  it('a nested relationship list carries the same bound (its take defaults to the limit and is required)', () => {
    const schema = ctx.withSession(sessionOf(ADVISOR)).graphql.schema
    const take = schema.getType('RepairOrder').getFields().jobs.args.find((a: any) => a.name === 'take')
    expect(String(take.type)).toBe('Int!')
    expect(take.defaultValue).toBe(1000)
  })
  it('every list has a maxTake', () => {
    const schema = ctx.withSession(sessionOf(ADVISOR)).graphql.schema
    const q = schema.getQueryType().getFields()
    const unbounded = Object.entries(q).filter(([, f]: any) => f.args.some((a: any) => a.name === 'take') && String(f.args.find((a: any) => a.name === 'take').type) !== 'Int!').map(([n]) => n)
    expect(unbounded).toEqual(['organizationSettingsItems']) // a one-row list; the guard below bounds it
  })
})
