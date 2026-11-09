import { getContext } from '@keystone-6/core/context'
import * as PrismaModule from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, TEST_DATABASE_URL, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { ROLES } from '../seed/northgate'
import { holdsCost, stripCost, stripMoneyText } from './costRedaction'

/*
 * Review r3 N3: cost was readable through JSON and text fields by roles without canSeeCost. This walks every list in the
 * schema as the seeded Service Advisor and Technician roles, selects every JSON and String field, and fails on a cost key with
 * a value, or on money in text, anywhere in what comes back. Rows that hold cost are planted first so the walk is not vacuous.
 * A positive control proves the same rows are readable in full by a role with canSeeCost.
 */

const roleOf = (id: string) => ROLES.find(r => r.id === id)!.permissions as string[]
const sessionOf = (granted: string[], itemId: string) => ({
  itemId, listKey: 'User',
  data: { name: 'Reader', email: `${itemId}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: [], role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, p === 'canAccessAllShops' ? true : granted.includes(p)])) } },
})
const ADVISOR = roleOf('seed_role_advisor')
const LEAD_TECH = roleOf('seed_role_lead_tech')
const TECH = roleOf('seed_role_tech')
// The auditor reads the audit trail but has no canSeeCost.
const AUDITOR = roleOf('seed_role_auditor')
const MANAGER = roleOf('seed_role_manager')
const COST_KEY = /cost|corecharge|variance|margin|avgcost|creditminor/i
const MONEY_TEXT = /\$\s?\d/
/** An amount: a number or a digit string. A cost-named setting such as TaxRule.coreChargeRule ("refund_refunds_tax") is not one. */
const AMOUNT = (v: unknown) => typeof v === 'number' || typeof v === 'bigint' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()))
/**
 * Lists where cost lives, so money in their text is cost. Elsewhere a "$" is a customer price, a fee law or a policy limit,
 * which every staff role may read (fee notes, a fleet customer's approval limit, the agent spend limit).
 */
const COST_TEXT_LISTS = new Set(['StockMovement', 'StockLevel', 'SupplierReturn', 'Discrepancy', 'SupplierInvoice', 'SupplierInvoiceLine', 'SupplierOrder', 'SupplierOrderLine',
  'CoreObligation', 'CycleCount', 'CycleCountLine', 'ApprovalRequest', 'AuditEvent', 'PartQuote', 'Receipt', 'ShopItem'])

/** Lists whose rows only server code reads (sessions, receipts, secrets) or that hold no cost by design; skipped for speed, not trust. */
const SKIP = new Set(['User', 'Role', 'OAuthApp', 'OAuthToken'])

function findCost(value: unknown, path: string, out: string[], text: boolean) {
  if (Array.isArray(value)) value.forEach((v, i) => findCost(v, `${path}[${i}]`, out, text))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (COST_KEY.test(k) && AMOUNT(v)) out.push(`${path}.${k}`)
      findCost(v, `${path}.${k}`, out, text)
    }
  } else if (text && typeof value === 'string' && MONEY_TEXT.test(value)) out.push(`${path} = ${value.slice(0, 60)}`)
}

describe('cost redaction helpers', () => {
  it('strips cost keys at any depth and money from text', () => {
    const v = { sku: 'X', avgCost: '4800', lines: [{ shopItemId: 'a', unitCostMinor: '15600', quantityMilli: 2000 }], nested: { coreChargeMinor: '10500', varianceValueMinor: '1' } }
    expect(holdsCost(v)).toBe(true)
    expect(stripCost(v)).toEqual({ sku: 'X', lines: [{ shopItemId: 'a', quantityMilli: 2000 }], nested: {} })
    expect(stripMoneyText('CF10285 was ordered at $11.50 and billed at $14.00.')).toBe('CF10285 was ordered at — and billed at —.')
    expect(stripMoneyText('Post count CC-1: 2300 cents of variance')).toBe('Post count CC-1: — of variance')
  })
})

describe.skipIf(!hasTestDatabase)('cost is not readable through JSON or text by roles without canSeeCost (review r3 N3)', () => {
  let prisma: PrismaClient
  let ctx: any
  const planted: Record<string, string> = {}

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    process.env.SESSION_SECRET ||= 'cost-leak-test-session-secret-0123456789abcdef'
    prisma = testPrisma(4)
    const config = (await import('../index')).default
    ctx = getContext(config, PrismaModule)
    // Plant one row of each shape the review found leaking. Server-side writes (Prisma) as the commands would make them.
    const shop = await prisma.shop.findFirst() ?? await prisma.shop.create({ data: { name: 'Leak Test Shop', code: 'LKT', timeZone: 'America/Los_Angeles', status: 'active' } as never })
    const supplier = await prisma.supplier.findFirst() ?? await prisma.supplier.create({ data: { name: uniqueKey('Leak supplier') } as never })
    const user = await prisma.user.create({ data: { name: 'leak', email: `${uniqueKey('leak')}@test.local`, password: 'x'.repeat(60) } })
    const level = await prisma.stockLevel.create({ data: { onHandMilli: 0, committedMilli: 0, onOrderMilli: 0, averageCostMinor: 4800n } as never })
    const item = await prisma.shopItem.create({ data: { shopId: shop.id, sku: uniqueKey('LEAK'), partNumber: 'LEAK-1', description: 'Leak test part', isStocked: true, stockId: level.id } as never })
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`ALTER TABLE "StockMovement" DISABLE TRIGGER USER`)
      const m = await tx.stockMovement.create({ data: { shopItemId: item.id, type: 'receipt', quantityMilli: 0, unitCostMinor: 4800n, idempotencyKey: uniqueKey('mv'), at: new Date(), after: { sku: 'LEAK', onHand: 0, committed: 0, onOrder: 0, avgCost: '4800', unitCostMinor: '4800' } } as never })
      await tx.$executeRawUnsafe(`ALTER TABLE "StockMovement" ENABLE TRIGGER USER`)
      planted.StockMovement = m.id
    })
    planted.SupplierReturn = (await prisma.supplierReturn.create({ data: { shopId: shop.id, supplierId: supplier.id, rmaNumber: uniqueKey('RMA'), reason: 'unused', status: 'requested', creditMinor: 31200n, lines: [{ shopItemId: item.id, quantityMilli: 2000, unitCostMinor: '15600' }] } as never })).id
    const inv = await prisma.supplierInvoice.create({ data: { shopId: shop.id, supplierId: supplier.id, invoiceNumber: uniqueKey('LEAK-INV'), totalMinor: 1400n, status: 'received' } as never })
    planted.Discrepancy = (await prisma.discrepancy.create({ data: { invoiceId: inv.id, kind: 'overcharge', amountMinor: 250n, detail: 'CF10285 was ordered at $11.50 and billed at $14.00.', status: 'open' } as never })).id
    planted.ApprovalRequest = (await prisma.approvalRequest.create({ data: { action: 'core.write_off', summary: 'Write off core on SR4170X: Supplier lost them', shopId: shop.id, targetList: 'CoreObligation', targetId: 'x', payload: { coreId: 'x', coreChargeMinor: '10500', reason: 'Supplier lost them' }, payloadHash: 'a'.repeat(64), requiredPermission: 'canApproveCoreWriteOff', requestedById: user.id, status: 'pending', expiresAt: new Date(Date.now() + 86_400_000) } as never })).id
  }, 120_000)

  afterAll(async () => { await prisma?.$disconnect() })

  const read = async (granted: string[], source: string) => {
    const r = await ctx.withSession(sessionOf(granted, 'cost-leak-reader')).graphql.raw({ query: source })
    return r as { data?: any; errors?: readonly { message: string }[] }
  }

  /** Every list's JSON and String fields, as one query per list. */
  function selections() {
    const schema = ctx.graphql.schema
    const q = schema.getQueryType().getFields()
    const out: { list: string; query: string; source: string }[] = []
    for (const [name, field] of Object.entries<any>(q)) {
      if (!field.args.some((a: any) => a.name === 'take')) continue
      const type = field.type.ofType?.ofType ?? field.type.ofType ?? field.type
      if (SKIP.has(type.name)) continue
      const scalar = Object.entries<any>(type.getFields()).filter(([, f]) => /^(JSON|String)!?$/.test(String(f.type)) && !f.args?.length).map(([k]) => k)
      if (!scalar.length) continue
      out.push({ list: type.name, query: name, source: `{ ${name}(take: 200) { id ${scalar.join(' ')} } }` })
    }
    return out
  }

  it('the walk covers the four fields the review named', () => {
    const lists = selections().map(s => s.list)
    for (const l of ['StockMovement', 'SupplierReturn', 'Discrepancy', 'ApprovalRequest', 'AuditEvent']) expect(lists).toContain(l)
  })

  for (const [name, granted] of [['Service Advisor', ADVISOR], ['Lead Technician', LEAD_TECH], ['Technician', TECH], ['Auditor', AUDITOR]] as const) {
    it(`${name}: no cost key with a value, and no money in text, in any list`, { timeout: 120_000 }, async () => {
      expect(granted).not.toContain('canSeeCost')
      const leaks: string[] = []
      let seen = 0
      for (const s of selections()) {
        const r = await read(granted, s.source)
        // A list the role may not read at all comes back as an access error; anything else would hide rows from the walk.
        for (const e of r.errors ?? []) if (!/access|not have access/i.test(e.message)) leaks.push(`${s.list}: query failed: ${e.message.slice(0, 80)}`)
        const rows = r.data?.[s.query] ?? []
        seen += rows.length
        for (const row of rows) findCost(row, `${s.list}(${row.id})`, leaks, COST_TEXT_LISTS.has(s.list))
      }
      expect(leaks).toEqual([])
      expect(seen).toBeGreaterThan(0)
    })
  }

  it('the advisor sees the planted rows (so the walk is not vacuous), without their cost', async () => {
    const r = await read(ADVISOR, `{ stockMovement(where: { id: "${planted.StockMovement}" }) { after unitCostMinor }
      supplierReturn(where: { id: "${planted.SupplierReturn}" }) { lines creditMinor }
      discrepancy(where: { id: "${planted.Discrepancy}" }) { detail amountMinor }
      approvalRequest(where: { id: "${planted.ApprovalRequest}" }) { payload payloadHash summary } }`)
    expect(r.errors ?? []).toEqual([])
    expect(r.data.stockMovement).toEqual({ after: { sku: 'LEAK', onHand: 0, committed: 0, onOrder: 0 }, unitCostMinor: null })
    expect(r.data.supplierReturn.lines[0]).toEqual({ shopItemId: expect.any(String), quantityMilli: 2000 })
    expect(r.data.supplierReturn.creditMinor).toBeNull()
    expect(r.data.discrepancy).toEqual({ detail: 'CF10285 was ordered at — and billed at —.', amountMinor: null })
    expect(r.data.approvalRequest.payload).toEqual({ coreId: 'x', reason: 'Supplier lost them' })
    expect(r.data.approvalRequest.payloadHash).toBeNull()
  })

  it('a role with canSeeCost (Shop Manager) reads the same rows in full', async () => {
    const r = await read(MANAGER, `{ stockMovement(where: { id: "${planted.StockMovement}" }) { after }
      supplierReturn(where: { id: "${planted.SupplierReturn}" }) { lines }
      discrepancy(where: { id: "${planted.Discrepancy}" }) { detail }
      approvalRequest(where: { id: "${planted.ApprovalRequest}" }) { payload payloadHash } }`)
    expect(r.errors ?? []).toEqual([])
    expect(r.data.stockMovement.after.avgCost).toBe('4800')
    expect(r.data.supplierReturn.lines[0].unitCostMinor).toBe('15600')
    expect(r.data.discrepancy.detail).toContain('$11.50')
    expect(r.data.approvalRequest.payload.coreChargeMinor).toBe('10500')
    expect(r.data.approvalRequest.payloadHash).toBe('a'.repeat(64))
  })
})
