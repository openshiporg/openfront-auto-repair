import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { hasTestDatabase, TEST_DATABASE_URL } from '../../../../tests/helpers/db'
import { permissionNames } from '../../../keystone/access'
import { ROLES } from '../../../keystone/seed/northgate'

/*
 * Review r3 N2: Stock, Supplier invoices and Cores returned 500 for every role without canSeeCost, because the screens did
 * BigInt(null) on the role-hidden cost. Each parts screen is rendered here as the seeded Service Advisor, Lead Technician and
 * Technician, with its data read through Keystone's own GraphQL as that role (so hidden cost really is null), and once as the
 * Parts Manager (who sees cost) as a control. Client widgets are stubbed: this checks the server render, not the forms.
 */

let role: string[] = []
let ctx: any
const sessionOf = (granted: string[]) => ({
  itemId: 'screen-reader', listKey: 'User',
  data: { name: 'Reader', email: 'reader@test.local', kind: 'staff', accessExpiresAt: null, memberships: [], role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, p === 'canAccessAllShops' ? true : granted.includes(p)])) } },
})

vi.mock('../../lib/server', () => ({
  q: async (query: string, variables: Record<string, unknown> = {}) => {
    const r = await ctx.withSession(sessionOf(role)).graphql.raw({ query, variables })
    if (r.errors?.length) throw new Error(r.errors[0].message)
    return r.data
  },
  orgTimeZone: async () => 'America/Los_Angeles',
}))
function stub(name: string) {
  const Stub = ({ children }: { children?: ReactNode }) => createElement('span', { 'data-stub': name }, children ?? null)
  Stub.displayName = name
  return Stub
}
vi.mock('./PartsActions', () => ({
  PARTS_PATHS: [], Act: stub('Act'), QuoteForm: stub('QuoteForm'), PhoneQuoteForm: stub('PhoneQuoteForm'), OrderQuoteButton: stub('OrderQuoteButton'), ReceiveForm: stub('ReceiveForm'),
  PhoneOrderForm: stub('PhoneOrderForm'), CountForm: stub('CountForm'), AdjustForm: stub('AdjustForm'), SupplierInvoiceForm: stub('SupplierInvoiceForm'), TireCompleteForm: stub('TireCompleteForm'), TinForm: stub('TinForm'),
}))
vi.mock('./PartsTabs', () => ({ PartsTabs: stub('PartsTabs') }))
vi.mock('../../components/ui', async () => {
  const pass = (name: string) => {
    const Pass = ({ children, title, name: n, value, aside }: any) => createElement('div', { 'data-ui': name }, title ?? null, n ?? null, value ?? null, aside ?? null, children ?? null)
    Pass.displayName = name
    return Pass
  }
  return { Page: pass('Page'), Row: pass('Row'), Empty: pass('Empty'), Meta: pass('Meta'), Section: pass('Section'), Stat: pass('Stat'), Status: ({ value }: any) => createElement('span', null, value ?? null), Tabs: pass('Tabs') }
})

const roleOf = (id: string) => ROLES.find(r => r.id === id)!.permissions as string[]
const SCREENS = [
  ['Stock', () => import('./StockPage')],
  ['Supplier invoices', () => import('./SupplierInvoicesPage')],
  ['Cores', () => import('./CoresPage')],
  ['Parts board', () => import('./PartsBoardPage')],
  ['Orders', () => import('./OrdersPage')],
  ['Tires', () => import('./TiresPage')],
] as const

async function render(load: () => Promise<{ default: () => Promise<ReactNode> }>) {
  const Page = (await load()).default
  return renderToStaticMarkup(createElement('div', null, await Page()))
}

describe.skipIf(!hasTestDatabase)('parts screens load for every role, with role-hidden cost (review r3 N2)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    process.env.SESSION_SECRET ||= 'parts-screens-test-session-secret-0123456789abcdef'
    // The Keystone context is built in the keystone slice; screens themselves never touch Prisma.
    ctx = (await import('../../../keystone/context')).keystoneContext
    // The screens must have rows with cost on them, or the null path is never exercised. Files run in parallel, so plant them.
    const p = ctx.sudo().prisma
    const shop = await p.shop.findFirst({ where: { id: 'seed_shop_nga' } }) ?? await p.shop.findFirst() ?? await p.shop.create({ data: { name: 'Screen Test Shop', code: 'SCR', timeZone: 'America/Los_Angeles', status: 'active' } })
    const supplier = await p.supplier.findFirst() ?? await p.supplier.create({ data: { name: `Screen supplier ${Date.now()}` } })
    const tag = Date.now().toString(36).toUpperCase()
    const level = await p.stockLevel.create({ data: { onHandMilli: 0, committedMilli: 0, onOrderMilli: 0, averageCostMinor: 4800n } })
    const item = await p.shopItem.create({ data: { shopId: shop.id, sku: `SCR-${tag}`, partNumber: `SCR-${tag}`, description: 'Screen test part', isStocked: true, stockId: level.id } })
    const inv = await p.supplierInvoice.create({ data: { shopId: shop.id, supplierId: supplier.id, invoiceNumber: `SCR-${tag}`, totalMinor: 9600n, status: 'received' } })
    await p.supplierInvoiceLine.create({ data: { invoiceId: inv.id, partNumber: `SCR-${tag}`, quantityMilli: 2000, unitCostMinor: 4800n, coreCreditMinor: 0n, matchStatus: 'unmatched' } })
    await p.coreObligation.create({ data: { shopId: shop.id, shopItemId: item.id, supplierId: supplier.id, partNumber: `SCR-${tag}`, coreChargeMinor: 9000n, status: 'owed' } })
    // Review r4 R4-2: a reversal reason written by a manager quotes the supplier amounts.
    const user = await p.user.findFirst() ?? await p.user.create({ data: { name: 'Screen user', email: `screen-${tag.toLowerCase()}@test.local`, password: 'x'.repeat(60) } })
    const rev = await p.supplierInvoice.create({ data: { shopId: shop.id, supplierId: supplier.id, invoiceNumber: `SCR-REV-${tag}`, totalMinor: 115000n, status: 'received' } })
    await p.supplierInvoiceLine.create({ data: { invoiceId: rev.id, partNumber: `SCR-${tag}`, quantityMilli: 1000, unitCostMinor: 1150n, coreCreditMinor: 0n, matchStatus: 'unmatched' } })
    await p.supplierInvoice.update({ where: { id: rev.id }, data: { status: 'reversed', reversedById: user.id, reversedAt: new Date(), reversalReason: 'Header keyed as $1,150.00; the lines total $11.50. Re-enter as billed.' } })
  }, 120_000)

  for (const [who, id] of [['Service Advisor', 'seed_role_advisor'], ['Lead Technician', 'seed_role_lead_tech'], ['Technician', 'seed_role_tech']] as const) {
    for (const [screen, load] of SCREENS) {
      it(`${screen} renders for the ${who}, with no cost on it`, { timeout: 60_000 }, async () => {
        role = roleOf(id)
        expect(role).not.toContain('canSeeCost')
        const html = await render(load as never)
        expect(html.length).toBeGreaterThan(50)
        // No figure that is a cost: the Stock value and the Cores owed total are absent, and no unit cost "at $" is printed.
        expect(html).not.toMatch(/Value on hand|avg \$| at \$|core credit \$/)
      })
    }
  }

  for (const id of ['seed_role_advisor', 'seed_role_lead_tech', 'seed_role_tech']) {
    it(`Supplier invoices shows a reversal reason to ${id} without the supplier amounts (review r4 R4-2)`, { timeout: 60_000 }, async () => {
      role = roleOf(id)
      const html = await render(SCREENS[1][1] as never)
      expect(html).toContain('Reversed: Header keyed as —; the lines total —. Re-enter as billed.')
      expect(html).not.toMatch(/\$\s?\d/)
    })
  }

  it('the Parts Manager (canSeeCost) still sees the cost on Stock and Supplier invoices', { timeout: 60_000 }, async () => {
    role = roleOf('seed_role_parts')
    expect(await render(SCREENS[0][1] as never)).toMatch(/Value on hand/)
    expect(await render(SCREENS[1][1] as never)).toMatch(/ at \$/)
  })
})
