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
const PLANTED_HASH = 'ab'.repeat(32)
const REVERSAL = 'Header keyed as $1,150.00; the lines total $11.50. Re-enter as billed.'
const refusedFilter = (r: any) => /do not have access to perform|KS_FILTER_DENIED|KS_ACCESS_DENIED/.test(JSON.stringify(r.errors ?? []))
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
    planted.ApprovalRequest = (await prisma.approvalRequest.create({ data: { action: 'core.write_off', summary: 'Write off core on SR4170X: Supplier lost them', shopId: shop.id, targetList: 'CoreObligation', targetId: 'x', payload: { coreId: 'x', coreChargeMinor: '10500', reason: 'Supplier lost them' }, payloadHash: PLANTED_HASH, requiredPermission: 'canApproveCoreWriteOff', requestedById: user.id, status: 'pending', expiresAt: new Date(Date.now() + 86_400_000) } as never })).id
    // Review r4 R4-2: free text written by a cost role that quotes supplier money, on every field the review named.
    const reversed = await prisma.supplierInvoice.create({ data: { shopId: shop.id, supplierId: supplier.id, invoiceNumber: uniqueKey('LEAK-REV'), totalMinor: 115000n, status: 'received' } as never })
    await prisma.supplierInvoiceLine.create({ data: { invoiceId: reversed.id, partNumber: 'CF10285', quantityMilli: 1000, unitCostMinor: 1150n, matchStatus: 'unmatched' } as never })
    await prisma.supplierInvoice.update({ where: { id: reversed.id }, data: { status: 'reversed', reversedById: user.id, reversedAt: new Date(), reversalReason: REVERSAL } as never })
    planted.SupplierInvoice = reversed.id
    await prisma.discrepancy.update({ where: { id: planted.Discrepancy }, data: { resolution: 'Supplier agreed: credit $2.50 on the next statement' } as never })
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

  // Review r4 R4-2: what the output hides must not be recoverable by filtering or sorting on the stored value.
  for (const [name, granted] of [['Service Advisor', ADVISOR], ['Lead Technician', LEAD_TECH], ['Technician', TECH]] as const) {
    describe(`${name}: redacted fields are neither filterable nor sortable (review r4 R4-2)`, () => {
      const FILTERS: [string, string, string][] = [
        ['approvalRequests', 'payloadHash', `{ equals: "${PLANTED_HASH}" }`], ['approvalRequests', 'payloadHash', `{ in: ["${PLANTED_HASH}"] }`], ['approvalRequests', 'payloadHash', '{ startsWith: "ab" }'],
        ['approvalRequests', 'summary', '{ contains: "SR4170X" }'],
        ['discrepancies', 'detail', '{ contains: "ordered at $11.50" }'], ['discrepancies', 'detail', '{ startsWith: "CF10285" }'], ['discrepancies', 'detail', '{ in: ["x"] }'],
        ['discrepancies', 'resolution', '{ contains: "$2.50" }'],
        ['supplierInvoices', 'reversalReason', '{ contains: "$1,150.00" }'], ['supplierInvoices', 'reversalReason', '{ equals: "x" }'],
        ['coreObligations', 'writeOffReason', '{ contains: "$" }'], ['coreObligations', 'returnNote', '{ contains: "$" }'],
        ['supplierOrders', 'deliveryNote', '{ contains: "$" }'], ['stockMovements', 'reason', '{ contains: "$" }'],
        ['approvalDecisions', 'reason', '{ contains: "$" }'],
      ]
      for (const [query, field, where] of FILTERS) {
        it(`${query}.${field} ${where}: filter refused`, async () => {
          const r = await read(granted, `{ ${query}(where: { ${field}: ${where} }, take: 5) { id } }`)
          expect(refusedFilter(r), JSON.stringify(r)).toBe(true)
        })
      }
      it('a nested relationship filter cannot reach them either', async () => {
        const n = await read(granted, `{ supplierInvoices(where: { discrepancies: { some: { detail: { contains: "$11.50" } } } }, take: 5) { id } }`)
        expect(refusedFilter(n), JSON.stringify(n)).toBe(true)
      })
      for (const [query, field] of [['approvalRequests', 'payloadHash'], ['approvalRequests', 'summary'], ['discrepancies', 'detail'], ['discrepancies', 'resolution'], ['supplierInvoices', 'reversalReason'], ['stockMovements', 'reason']]) {
        it(`${query}.${field}: sort refused`, async () => {
          const r = await read(granted, `{ ${query}(orderBy: { ${field}: asc }, take: 5) { id } }`)
          expect(refusedFilter(r), JSON.stringify(r)).toBe(true)
        })
      }
      it('reversalReason, resolution and cost-action summaries read without the money', async () => {
        const r = await read(granted, `{ supplierInvoice(where: { id: "${planted.SupplierInvoice}" }) { reversalReason totalMinor }
          discrepancy(where: { id: "${planted.Discrepancy}" }) { resolution } }`)
        expect(r.errors ?? []).toEqual([])
        expect(r.data.supplierInvoice).toEqual({ reversalReason: 'Header keyed as —; the lines total —. Re-enter as billed.', totalMinor: null })
        expect(r.data.discrepancy.resolution).toBe('Supplier agreed: credit — on the next statement')
      })
    })
  }

  it('the reversal reason is in the audit trail too, and an auditor without canSeeCost reads it without the money or the payload hash', async () => {
    await prisma.$transaction(async tx => {
      const { appendAuditEvents } = await import('../lib/audit')
      await appendAuditEvents(tx as never, [
        { eventType: 'supplier_invoice.reversed', entityType: 'SupplierInvoice', entityId: planted.SupplierInvoice, reason: REVERSAL, after: { status: 'reversed', reversalReason: REVERSAL } },
        { eventType: 'approval.requested', entityType: 'ApprovalRequest', entityId: planted.ApprovalRequest, after: { action: 'core.write_off', payloadHash: PLANTED_HASH } },
      ])
    })
    const r = await read(AUDITOR, `{ auditEvents(where: { entityId: { in: ["${planted.SupplierInvoice}", "${planted.ApprovalRequest}"] } }, take: 10) { reason after } }`)
    expect(r.errors ?? []).toEqual([])
    const text = JSON.stringify(r.data.auditEvents)
    expect(r.data.auditEvents.length).toBe(2)
    expect(text).not.toMatch(/\$\s?\d/)
    expect(text).not.toContain(PLANTED_HASH)
    const refused = await read(AUDITOR, `{ auditEvents(where: { reason: { contains: "$1,150.00" } }, take: 1) { id } }`)
    expect(refusedFilter(refused)).toBe(true)
  })

  // Review r5 R5-1: AuditEvent.hash covers the unredacted row, so with prevHash and the row's other columns a reader without
  // canSeeCost re-adds a guessed cost and compares (the review recovered a real unitCostMinor in 112 ms). The chain links are
  // null for that reader, and not filterable, sortable or reachable through a relation filter; the verdict stays readable.
  describe('the audit chain hashes are not a cost oracle (review r5 R5-1)', () => {
    let receipt: { id: string; seq: number; eventKey: string; hash: string; prevHash: string }
    beforeAll(async () => {
      const { appendAuditEvents } = await import('../lib/audit')
      const [w] = await prisma.$transaction(tx => appendAuditEvents(tx as never, [
        { eventType: 'stock.receipt', entityType: 'StockMovement', entityId: planted.StockMovement, reason: 'Received on PO-LEAK-1', after: { sku: 'LEAK', onHand: 1000, quantityMilli: 1000, unitCostMinor: '18900' } },
      ]))
      receipt = (await prisma.auditEvent.findUniqueOrThrow({ where: { id: w.id } })) as never
    })

    for (const [name, granted] of [['Auditor', AUDITOR], ['Service Advisor', ADVISOR], ['Lead Technician', LEAD_TECH], ['Technician', TECH]] as const) {
      it(`${name}: hash, prevHash and eventKey read as null, cannot be filtered, sorted, counted on or reached through a relation`, async () => {
        expect(granted).not.toContain('canSeeCost')
        const r = await read(granted, `{ auditEvents(where: { seq: { equals: ${receipt.seq} } }, take: 1) { seq hash prevHash eventKey after } }`)
        expect(r.errors ?? []).toEqual([])
        // The Auditor reads the event (with the cost stripped); roles without canReadAudit read nothing at all.
        if (granted.includes('canReadAudit')) {
          expect(r.data.auditEvents).toEqual([{ seq: receipt.seq, hash: null, prevHash: null, eventKey: null, after: { sku: 'LEAK', onHand: 1000, quantityMilli: 1000 } }])
        } else expect(r.data.auditEvents).toEqual([])
        const one = await read(granted, `{ auditEvent(where: { id: "${receipt.id}" }) { hash prevHash eventKey } }`)
        expect(JSON.stringify(one.data ?? {})).not.toContain(receipt.hash)
        const probes = [
          `{ auditEvents(where: { hash: { equals: "${receipt.hash}" } }) { id } }`,
          `{ auditEvents(where: { hash: { in: ["${receipt.hash}"] } }) { id } }`,
          `{ auditEvents(where: { hash: { startsWith: "${receipt.hash.slice(0, 4)}" } }) { id } }`,
          `{ auditEvents(where: { prevHash: { equals: "${receipt.prevHash}" } }) { id } }`,
          `{ auditEvents(where: { eventKey: { equals: "${receipt.eventKey}" } }) { id } }`,
          `{ auditEvents(where: { NOT: { hash: { equals: "${receipt.hash}" } } }) { id } }`,
          `{ auditEvents(where: { OR: [{ seq: { equals: -1 } }, { hash: { gt: "8" } }] }) { id } }`,
          `{ auditEventsCount(where: { hash: { equals: "${receipt.hash}" } }) }`,
          `{ auditEvent(where: { hash: "${receipt.hash}" }) { id } }`,
          `{ auditEvent(where: { eventKey: "${receipt.eventKey}" }) { id } }`,
          `{ auditEvents(orderBy: { hash: asc }, take: 1) { id } }`,
          `{ auditEvents(orderBy: { prevHash: desc }, take: 1) { id } }`,
          `{ auditEvents(orderBy: { eventKey: asc }, take: 1) { id } }`,
        ]
        for (const p of probes) {
          const x = await read(granted, p)
          // Either refused, or (a role with no audit access at all) empty: never an answer that depends on the hash.
          const answer = JSON.stringify(x.data ?? {})
          expect(refusedFilter(x) || (!granted.includes('canReadAudit') && !answer.includes(receipt.id) && !/"auditEventsCount":[1-9]/.test(answer)), `${name}: ${p} -> ${JSON.stringify(x).slice(0, 200)}`).toBe(true)
        }
      })
    }

    it('the Auditor still sees whether the chain is intact, from the server, without the head hash', async () => {
      const r = await read(AUDITOR, '{ verifyAuditChain }')
      expect(r.errors ?? []).toEqual([])
      expect(r.data.verifyAuditChain).toMatchObject({ ok: true, lastHash: null })
      expect(r.data.verifyAuditChain.count).toBeGreaterThan(0)
      const m = await read(MANAGER, '{ verifyAuditChain }')
      expect(m.data.verifyAuditChain).toMatchObject({ ok: true, lastHash: expect.stringMatching(/^[0-9a-f]{64}$/) })
    })

    it('the review hashoracle, run on what Keystone serves the Auditor, recovers nothing (and does recover it from the stored row)', async () => {
      const { createHash } = await import('node:crypto')
      const { canonicalJson } = await import('../lib/canonical')
      const Q = `{ auditEvents(where: { seq: { equals: ${receipt.seq} } }) { seq eventKey eventType entityType entityId actorUser { id } actorAgent { id } approver { id } reason before after metadata requestId prevHash hash at } }`
      const body = (r: any, after: unknown) => ({ seq: r.seq, eventKey: r.eventKey, eventType: r.eventType, entityType: r.entityType, entityId: r.entityId, actorUserId: r.actorUser?.id ?? null, actorAgentId: r.actorAgent?.id ?? null, approverId: r.approver?.id ?? null, reason: r.reason || null, before: r.before ?? null, after, metadata: r.metadata ?? null, requestId: r.requestId || null, at: r.at })
      const attack = (r: any) => { if (!r.hash || !r.prevHash) return null; for (let c = 0; c <= 20_000; c++) if (createHash('sha256').update(`${r.prevHash}\n${canonicalJson(body(r, { ...r.after, unitCostMinor: String(c) }))}`).digest('hex') === r.hash) return c; return null }
      const mgr = (await read(MANAGER, Q)).data.auditEvents[0]
      // Positive control: with the hash served (manager), the recipe is the real one and the attack works on a stripped copy.
      const { unitCostMinor, ...stripped } = mgr.after
      expect(unitCostMinor).toBe('18900')
      expect(attack({ ...mgr, after: stripped })).toBe(18900)
      const aud = (await read(AUDITOR, Q)).data.auditEvents[0]
      expect(aud.after).toEqual(stripped)
      expect(attack(aud)).toBeNull()
    })

    it('the review recipe no longer has a target: the hash it needs is not served to the Auditor', async () => {
      const r = await read(AUDITOR, `{ auditEvents(where: { seq: { in: [${receipt.seq}, ${receipt.seq - 1}] } }, take: 2) { hash prevHash } }`)
      expect(JSON.stringify(r.data)).not.toMatch(/[0-9a-f]{64}/)
    })

    it('the Shop Manager (canSeeCost and canReadAudit) still reads and filters the chain', async () => {
      const r = await read(MANAGER, `{ auditEvents(where: { hash: { equals: "${receipt.hash}" } }) { id hash prevHash eventKey } }`)
      expect(r.errors ?? []).toEqual([])
      expect(r.data.auditEvents).toEqual([{ id: receipt.id, hash: receipt.hash, prevHash: receipt.prevHash, eventKey: receipt.eventKey }])
    })
  })

  // Review r5 sweep: every other hash or digest in the schema either covers no cost, or is hidden like the payload it hashes.
  describe('the other hashes in the schema (review r5 sweep)', () => {
    it('an approval payloadHash is hidden whenever the reader gets a redacted payload, and kept when the payload has no cost', async () => {
      const user = await prisma.user.findFirstOrThrow()
      const base = { shopId: null, targetList: 'X', targetId: 'x', requiredPermission: 'canPublishPolicies', requestedById: user.id, status: 'pending', expiresAt: new Date(Date.now() + 86_400_000) }
      const matrix = await prisma.approvalRequest.create({ data: { ...base, action: 'policy.publish', summary: 'Publish Parts matrix v2', payload: { kind: 'parts_matrix', versionId: 'v', contentHash: 'cd'.repeat(32), baseVersion: 1 }, payloadHash: 'ef'.repeat(32) } as never })
      const close = await prisma.approvalRequest.create({ data: { ...base, action: 'pay_period.close', summary: 'Close the pay period', payload: { payPeriodId: 'p', startsOn: '2026-11-01', endsOn: '2026-11-07' }, payloadHash: '12'.repeat(32) } as never })
      let seen = 0
      for (const granted of [AUDITOR, ADVISOR, LEAD_TECH, TECH]) {
        const r = await read(granted, `{ m: approvalRequest(where: { id: "${matrix.id}" }) { payload payloadHash } c: approvalRequest(where: { id: "${close.id}" }) { payloadHash } }`)
        if (!r.data?.m) continue
        seen += 1
        expect(r.data.m).toEqual({ payload: { kind: 'parts_matrix', versionId: 'v', baseVersion: 1 }, payloadHash: null })
        expect(r.data.c.payloadHash).toBe('12'.repeat(32))
      }
      expect(seen).toBeGreaterThanOrEqual(2)
    })

    it('audit snapshots of the parts matrix (cost brackets) and hashes copied into audit JSON are withheld', async () => {
      const { appendAuditEvents } = await import('../lib/audit')
      const pm = uniqueKey('leak-pm')
      await prisma.$transaction(tx => appendAuditEvents(tx as never, [
        { eventType: 'PartsMatrixVersion.updated', entityType: 'PartsMatrixVersion', entityId: pm, after: { tiers: [{ minCostMinor: 0, maxCostMinor: 5000, multiplier: '2.5' }], marginFloorPct: '0.3' } },
        { eventType: 'policy.published', entityType: 'PartsMatrixVersion', entityId: pm, after: { versionNumber: 2, contentHash: 'cd'.repeat(32) } },
      ]))
      const r = await read(AUDITOR, `{ auditEvents(where: { entityId: { equals: "${pm}" } }) { after } }`)
      expect(r.errors ?? []).toEqual([])
      expect(r.data.auditEvents).toEqual([{ after: {} }, { after: {} }])
    })
  })

  it('a role with canSeeCost filters on the same fields (the refusal is not a blanket one)', async () => {
    const r = await read(MANAGER, `{ a: approvalRequests(where: { payloadHash: { equals: "${PLANTED_HASH}" } }) { id } d: discrepancies(where: { detail: { contains: "ordered at $11.50" } }) { id }
      s: supplierInvoices(where: { reversalReason: { contains: "$1,150.00" } }) { id reversalReason } }`)
    expect(r.errors ?? []).toEqual([])
    expect(r.data.a.map((x: any) => x.id)).toContain(planted.ApprovalRequest)
    expect(r.data.d.map((x: any) => x.id)).toContain(planted.Discrepancy)
    // Earlier runs on the same schema leave their own planted copies; this run's must be among them, in full.
    expect(r.data.s).toContainEqual({ id: planted.SupplierInvoice, reversalReason: REVERSAL })
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
    expect(r.data.approvalRequest.payloadHash).toBe(PLANTED_HASH)
  })
})
