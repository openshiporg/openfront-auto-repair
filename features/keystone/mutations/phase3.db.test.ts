import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'graphql'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { mcpOperationProblem } from '../mcp-oauth/guard'
import { getInvoice, postInvoicePayment } from '../public/handlers'
import { setStripeGateway, type CheckoutSession, type StripeGateway } from '../lib/stripeGateway'
import { resolveOpen, resolvePayment } from '../lib/cardFlow'
import { decideApprovalRequest } from './approvals'
import { checkInShopVehicle } from './phase1'
import { addRepairJob, openShopRepairOrder, recordCustomerAuthorization, sendRepairEstimate, transitionRepairJob } from './phase2'
import {
  checkShopPayment, closeShopDay, createInvoicePayLink, finalizeShopInvoice, issueShopCreditMemo, previewShopInvoice, refundShopPayment, releaseShopVehicle, reopenShopDay, takeShopPayment,
} from './phase3'
import { loadNorthgateSetup } from './setup'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))
const sessionFor = (id: string, granted: string[], extra: Record<string, unknown> = {}) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: ALL_SHOPS, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
  ...extra,
})
const NGA = 'seed_shop_nga'
const SIGNATURE = { method: 'in_person' as const, signerName: 'Marcus Delgado', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] }
const COUNTER = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canMessageCustomers', 'canReadCustomerPII', 'canManageCustomers', 'canFinalizeInvoices', 'canTakePayments', 'canCloseDay']
const MANAGER = [...COUNTER, 'canIssueRefunds', 'canApproveRefund', 'canApproveRelease', 'canApproveReopen', 'canApproveCreditMemo', 'canReadFinancials']
const BRAKES = [
  { kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 160 },
  { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' },
  { kind: 'part', description: 'Front brake rotor', partNumber: '09.C394.13', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 2000, unitCostMinor: '6500' },
]
const TOTAL = 61581n

/** A processor that lives in memory: sessions are paid on demand, refunds succeed, and calls are counted. */
function fakeStripe() {
  const sessions = new Map<string, CheckoutSession & { amount: bigint }>()
  const refunds = new Map<string, { id: string; status: 'succeeded'; failureReason: string; key: string }>()
  const state = { sessionCalls: 0, refundCalls: 0, offline: false }
  const gateway: StripeGateway = {
    name: 'fake',
    async createCheckoutSession(input) {
      if (state.offline) throw new Error('network down')
      state.sessionCalls += 1
      const id = `cs_test_${sessions.size + 1}`
      const s = { id, url: `https://checkout.example/${id}`, paymentStatus: 'unpaid' as const, status: 'open' as const, paymentIntentId: null, cardBrand: '', cardLast4: '', amount: input.amountMinor }
      sessions.set(id, s)
      return s
    },
    async retrieveCheckoutSession(id) {
      if (state.offline) throw new Error('network down')
      return sessions.get(id)!
    },
    async createRefund(input) {
      if (state.offline) throw new Error('network down')
      const existing = refunds.get(input.idempotencyKey)
      if (existing) return existing
      state.refundCalls += 1
      const r = { id: `re_test_${refunds.size + 1}`, status: 'succeeded' as const, failureReason: '', key: input.idempotencyKey }
      refunds.set(input.idempotencyKey, r)
      return r
    },
    async retrieveRefund(id) { return [...refunds.values()].find(r => r.id === id)! },
  }
  const pay = (id: string) => { const s = sessions.get(id)!; Object.assign(s, { paymentStatus: 'paid', status: 'complete', paymentIntentId: `pi_test_${id}`, cardBrand: 'visa', cardLast4: '4242' }) }
  return { gateway, pay, state, sessions }
}

describe.skipIf(!hasTestDatabase)('Phase 3 invoices, payments and day close (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx, advisor: Ctx, manager: Ctx, viaMcp: Ctx, managerViaMcp: Ctx
  let roId = '', invoiceId = '', jobId = ''
  const stripe = fakeStripe()
  const key = (p: string) => uniqueKey(p)
  const ro = () => prisma.repairOrder.findUniqueOrThrow({ where: { id: roId } })
  const invoice = () => prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })

  async function newRepairOrder(customerId: string, make: string, deposit?: boolean) {
    const owned = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId, endedAt: null, ...(make ? { vehicle: { make } } : {}) }, include: { vehicle: true } })
    const checkIn = await checkInShopVehicle(null, { input: { shopId: NGA, customerId, vehicleId: owned.vehicleId!, concerns: ['Grinding from the front brakes'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: (owned.vehicle!.lastOdometer ?? 0) + 200 }, signature: SIGNATURE }, idempotencyKey: key('ci') }, advisor) as { id: string }
    const opened = await openShopRepairOrder(null, { input: { checkInId: checkIn.id }, idempotencyKey: key('ro') }, advisor) as { id: string }
    void deposit
    return opened.id
  }
  async function completedJob(repairOrderId: string) {
    const added = await addRepairJob(null, { input: { repairOrderId, title: 'Front brake pads and rotors', lines: BRAKES }, idempotencyKey: key('j') }, advisor) as { id: string }
    const row = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId } })
    const v = await sendRepairEstimate(null, { repairOrderId, expectedVersion: row.version, idempotencyKey: key('e') }, advisor) as { id: string }
    await recordCustomerAuthorization(null, { input: { estimateVersionId: v.id, method: 'oral_phone', actorName: 'Marcus Delgado', phoneNumber: '(916) 555-0104', answers: [{ jobId: added.id, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: key('a') }, advisor)
    const j1 = await prisma.job.findUniqueOrThrow({ where: { id: added.id } })
    await transitionRepairJob(null, { jobId: added.id, to: 'in_progress', expectedVersion: j1.version, idempotencyKey: key('s') }, advisor)
    const j2 = await prisma.job.findUniqueOrThrow({ where: { id: added.id } })
    await transitionRepairJob(null, { jobId: added.id, to: 'completed', expectedVersion: j2.version, cause: 'Pads worn to the backing plate', correction: 'Replaced pads and rotors, bled the brakes', idempotencyKey: key('c') }, advisor)
    return added.id
  }
  /** The odometer as the vehicle leaves: a little above whatever was last recorded. */
  const odoOut = async (repairOrderId: string) => {
    const r = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId }, include: { vehicle: true } })
    return (r.vehicle!.lastOdometer ?? 0) + 5
  }
  const settle = async (ctx: Ctx, approvalId: string) => {
    const req = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } })
    return decideApprovalRequest(null, { requestId: approvalId, decision: 'approve', reason: 'Checked with the customer', expectedVersion: req.version, idempotencyKey: key('d') }, ctx)
  }

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    setStripeGateway(stripe.gateway)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a, m] = await Promise.all([make('owner'), make('advisor'), make('manager')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => p !== 'canBreakGlass')), prisma }
    advisor = { session: sessionFor(a.id, COUNTER), prisma }
    manager = { session: sessionFor(m.id, MANAGER), prisma }
    managerViaMcp = { session: sessionFor(m.id, MANAGER, { mcp: { clientId: 'test-client', scopes: ['mcp:read', 'mcp:write'] } }), prisma }
    viaMcp = { session: sessionFor(a.id, COUNTER, { mcp: { clientId: 'test-client', scopes: ['mcp:read', 'mcp:write'] } }), prisma }
    await loadNorthgateSetup(null, { idempotencyKey: key('setup') }, owner)
    roId = await newRepairOrder('seed_cust_04', 'Toyota')
    jobId = await completedJob(roId)
  }, 900_000)

  afterAll(async () => {
    setStripeGateway(null)
    await prisma?.$disconnect()
  })

  it('a deposit is held as a liability and applied exactly once when the invoice is finalized', { timeout: 120_000 }, async () => {
    const dep = await takeShopPayment(null, { input: { purpose: 'deposit', repairOrderId: roId, tender: 'cash', amountMinor: '10000', payerName: 'Marcus Delgado' }, idempotencyKey: key('p') }, advisor) as { id: string; allocatedMinor: string }
    expect(dep.allocatedMinor).toBe('0')
    const held = await prisma.payment.findUniqueOrThrow({ where: { id: dep.id } })
    expect(held.allocatedMinor).toBe(0n)

    const preview = await previewShopInvoice(null, { repairOrderId: roId }, advisor) as unknown as { problems: string[]; invoices: { totals: { totalMinor: string } }[] }
    expect(preview.problems).toEqual([])
    expect(preview.invoices[0].totals.totalMinor).toBe(TOTAL.toString())

    const fin = await finalizeShopInvoice(null, { input: { repairOrderId: roId, expectedVersion: (await ro()).version, odometerOut: await odoOut(roId) }, idempotencyKey: key('f') }, advisor) as { invoices: { id: string; invoiceNumber: string; totalMinor: string; balanceMinor: string }[] }
    invoiceId = fin.invoices[0].id
    expect(fin.invoices[0].invoiceNumber).toMatch(/^INV-NGA-\d{4}-\d{6}$/)
    const inv = await invoice()
    expect(inv.totalMinor).toBe(TOTAL)
    expect(inv.paidMinor).toBe(10000n)
    expect(inv.balanceMinor).toBe(TOTAL - 10000n)
    expect(inv.status).toBe('partially_paid')
    const allocations = await prisma.paymentAllocation.findMany({ where: { paymentId: dep.id } })
    expect(allocations.map(x => x.amountMinor)).toEqual([10000n])
    expect((await ro()).status).toBe('invoiced')
  })

  it('records the legal retention date four years out in California, and prints disclosures', async () => {
    const inv = await invoice()
    const years = inv.retentionUntil!.getUTCFullYear() - inv.invoiceDate!.getUTCFullYear()
    expect(years).toBe(4)
    expect((inv.disclosures as { odometer: { in: number | null } }).odometer.in).not.toBeNull()
    expect(await prisma.invoiceLine.count({ where: { invoiceId } })).toBe(3)
    const coverage = await prisma.warrantyCoverage.findMany({ where: { repairOrderId: roId } })
    expect(coverage.length).toBeGreaterThanOrEqual(0)
  })

  it('a finalized invoice cannot be edited or deleted, nor its lines, even with raw SQL', async () => {
    await expect(prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "totalMinor" = 1, "balanceMinor" = 1 - "paidMinor" WHERE id = '${invoiceId}'`)).rejects.toThrow(/financial record|violates check/i)
    await expect(prisma.$executeRawUnsafe(`UPDATE "InvoiceLine" SET "extendedMinor" = 1 WHERE "invoice" = '${invoiceId}'`)).rejects.toThrow(/append-only/i)
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE id = '${invoiceId}'`)).rejects.toThrow(/cannot be deleted/i)
    await expect(prisma.$executeRawUnsafe(`UPDATE "PaymentAllocation" SET "amountMinor" = 5 WHERE "invoice" = '${invoiceId}'`)).rejects.toThrow(/append-only/i)
    await expect(finalizeShopInvoice(null, { input: { repairOrderId: roId, expectedVersion: (await ro()).version }, idempotencyKey: key('f') }, advisor)).rejects.toMatchObject({ code: expect.stringMatching(/GUARD_FAILED|INVALID_TRANSITION/) })
    // The database also refuses an allocation larger than the payment holds.
    const pay = await prisma.payment.findFirstOrThrow({ where: { repairOrderId: roId } })
    await expect(prisma.$executeRawUnsafe(`INSERT INTO "PaymentAllocation" (id, payment, invoice, "amountMinor") VALUES ('x_over', '${pay.id}', '${invoiceId}', 5000)`)).rejects.toThrow(/exceed/i)
  })

  it('a payment of the wrong size is refused, cash settles at once, and a replay with the same key does not take it twice', { timeout: 60_000 }, async () => {
    await expect(takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'cash', amountMinor: '999999999' }, idempotencyKey: key('p') }, advisor)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const k = key('p')
    const first = await takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'cash', amountMinor: '20000', payerName: 'Marcus Delgado' }, idempotencyKey: k }, advisor) as { id: string }
    const second = await takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'cash', amountMinor: '20000', payerName: 'Marcus Delgado' }, idempotencyKey: k }, advisor) as { id: string; replay: boolean }
    expect(second.replay).toBe(true)
    expect(second.id).toBe(first.id)
    expect((await invoice()).paidMinor).toBe(30000n)
    expect(await prisma.payment.count({ where: { idempotencyKey: k } })).toBe(1)
  })

  it('a card payment that goes unknown is settled exactly once, however often it is resolved or raced', { timeout: 120_000 }, async () => {
    const before = (await invoice()).paidMinor
    const balance = (await invoice()).balanceMinor
    const started = await takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'card_link', amountMinor: balance.toString() }, idempotencyKey: key('p') }, advisor) as { id: string; checkoutUrl: string }
    expect(started.checkoutUrl).toContain('checkout.example')
    // The processor is unreachable when we ask: the payment stays unresolved and nothing is counted.
    stripe.state.offline = true
    expect((await resolvePayment(prisma, started.id)).status).toBe('unknown')
    stripe.state.offline = false
    expect((await invoice()).paidMinor).toBe(before)
    stripe.pay((await prisma.payment.findUniqueOrThrow({ where: { id: started.id } })).providerSessionId)
    // Ten simultaneous resolvers (a tab, the sweep, the pay page) must capture it once.
    await Promise.all(Array.from({ length: 10 }, () => resolvePayment(prisma, started.id)))
    await resolveOpen(prisma, NGA)
    const inv = await invoice()
    expect(inv.paidMinor).toBe(before + balance)
    expect(inv.status).toBe('paid')
    expect(inv.balanceMinor).toBe(0n)
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: started.id } })
    expect(pay.status).toBe('succeeded')
    expect(pay.cardLast4).toBe('4242')
    expect(pay.allocatedMinor).toBe(balance)
    expect(await prisma.paymentAllocation.count({ where: { paymentId: started.id } })).toBe(1)
    expect((await checkShopPayment(null, { paymentId: started.id }, advisor) as { status: string }).status).toBe('succeeded')
  })

  it('a refund above the threshold needs a second person; the refund goes back once and the invoice reopens', { timeout: 120_000 }, async () => {
    const pay = await prisma.payment.findFirstOrThrow({ where: { repairOrderId: roId, provider: 'stripe', status: 'succeeded' } })
    const threshold = (await prisma.shopPolicyVersion.findFirstOrThrow({ where: { shopId: NGA, status: 'published' } })).refundApprovalMinor
    const amount = threshold > 0n ? threshold : 1000n
    const input = { paymentId: pay.id, amountMinor: amount.toString(), reason: 'Customer returned the rotors unused' }
    await expect(refundShopPayment(null, { input, idempotencyKey: key('r') }, managerViaMcp)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    const asked = await refundShopPayment(null, { input, idempotencyKey: key('r') }, manager) as { approvalRequired?: boolean; approvalRequestId?: string }
    if (threshold > 0n) {
      expect(asked.approvalRequired).toBe(true)
      expect(await prisma.refund.count({ where: { paymentId: pay.id } })).toBe(0)
      await expect(settle(manager, asked.approvalRequestId!)).rejects.toBeTruthy()
      await settle(owner, asked.approvalRequestId!)
      const done = await refundShopPayment(null, { input: { ...input, approvalRequestId: asked.approvalRequestId }, idempotencyKey: key('r') }, manager) as { status: string }
      expect(done.status).toBe('succeeded')
      // The same approval cannot be used again.
      await expect(refundShopPayment(null, { input: { ...input, approvalRequestId: asked.approvalRequestId }, idempotencyKey: key('r') }, manager)).rejects.toMatchObject({ code: 'APPROVAL_MISMATCH' })
    }
    const inv = await invoice()
    expect(inv.paidMinor).toBe(30000n + (pay.amountMinor - amount))
    expect(inv.balanceMinor).toBe(amount)
    expect(stripe.state.refundCalls).toBe(1)
    const refreshed = await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })
    expect(refreshed.status).toBe('partially_refunded')
    expect(refreshed.refundedMinor).toBe(amount)
    // Refunding more than is left on the payment is refused.
    await expect(refundShopPayment(null, { input: { paymentId: pay.id, amountMinor: pay.amountMinor.toString(), reason: 'Too much' }, idempotencyKey: key('r') }, manager)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
  })

  it('a credit memo lowers what is owed, never below zero', { timeout: 60_000 }, async () => {
    const line = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, kind: 'part' } })
    const owed = (await invoice()).balanceMinor
    await expect(issueShopCreditMemo(null, { input: { invoiceId, reason: 'Too much', lines: [{ invoiceLineId: line.id, amountMinor: (owed + 1000n).toString() }] }, idempotencyKey: key('m') }, manager)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const memo = await issueShopCreditMemo(null, { input: { invoiceId, reason: 'Goodwill after the delay', lines: [{ invoiceLineId: line.id, amountMinor: '300' }] }, idempotencyKey: key('m') }, manager) as { id: string; totalMinor?: string; approvalRequired?: boolean }
    if (!memo.approvalRequired) {
      expect((await invoice()).creditedMinor).toBeGreaterThan(0n)
      await expect(prisma.$executeRawUnsafe(`UPDATE "CreditMemo" SET reason = 'edited' WHERE id = '${memo.id}'`)).rejects.toThrow(/issued/i)
    }
  })

  it('releasing a vehicle with a balance needs a second person to approve', { timeout: 120_000 }, async () => {
    const owing = (await invoice()).balanceMinor
    expect(owing > 0n).toBe(true)
    await expect(releaseShopVehicle(null, { repairOrderId: roId, idempotencyKey: key('rel') }, advisor)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const asked = await releaseShopVehicle(null, { repairOrderId: roId, reason: 'Regular customer, paying Friday', idempotencyKey: key('rel') }, advisor) as { approvalRequired: boolean; approvalRequestId: string }
    expect(asked.approvalRequired).toBe(true)
    expect((await ro()).releasedAt).toBeNull()
    await expect(settle(advisor, asked.approvalRequestId)).rejects.toBeTruthy()
    await settle(manager, asked.approvalRequestId)
    const released = await releaseShopVehicle(null, { repairOrderId: roId, reason: 'Regular customer, paying Friday', approvalRequestId: asked.approvalRequestId, idempotencyKey: key('rel') }, advisor) as { released: boolean; closed: boolean }
    expect(released.released).toBe(true)
    expect(released.closed).toBe(false)
    expect((await ro()).status).toBe('invoiced')
    // Paying the rest closes the order by itself.
    await takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'check', checkNumber: '2041', amountMinor: (await invoice()).balanceMinor.toString(), payerName: 'Marcus Delgado' }, idempotencyKey: key('p') }, advisor)
    expect((await invoice()).balanceMinor).toBe(0n)
    expect((await ro()).status).toBe('closed')
  })

  it('the pay link shows the invoice and takes a card payment, then a refund is returned', { timeout: 120_000 }, async () => {
    const rid = await newRepairOrder('seed_cust_03', '')
    await completedJob(rid)
    const cur = await prisma.repairOrder.findUniqueOrThrow({ where: { id: rid } })
    const fin = await finalizeShopInvoice(null, { input: { repairOrderId: rid, expectedVersion: cur.version, odometerOut: await odoOut(rid) }, idempotencyKey: key('f') }, advisor) as { invoices: { id: string }[] }
    const inv2 = fin.invoices[0].id
    const link = await createInvoicePayLink(null, { invoiceId: inv2, idempotencyKey: key('l') }, advisor) as { path: string }
    const token = link.path.replace('/pay/', '')
    const get = await getInvoice(prisma, new Request('http://x/api/public/invoices/t'), token)
    const view = await get.json() as { invoiceNumber: string; totals: { balanceMinor: string }; canPayByCard: boolean }
    expect(get.status).toBe(200)
    expect(view.canPayByCard).toBe(true)
    expect((await getInvoice(prisma, new Request('http://x'), 'A'.repeat(43))).status).toBe(404)
    const start = await postInvoicePayment(prisma, new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), token)
    const started = await start.json() as { paymentId: string; checkoutUrl: string }
    expect(start.status).toBe(201)
    const callsBefore = stripe.state.sessionCalls
    // Starting again while one is open reuses it instead of opening a second page.
    const again = await postInvoicePayment(prisma, new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }), token)
    expect(((await again.json()) as { paymentId: string }).paymentId).toBe(started.paymentId)
    expect(stripe.state.sessionCalls).toBe(callsBefore)
    stripe.pay((await prisma.payment.findUniqueOrThrow({ where: { id: started.paymentId } })).providerSessionId)
    const poll = await postInvoicePayment(prisma, new Request('http://x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentId: started.paymentId }) }), token)
    expect(((await poll.json()) as { status: string }).status).toBe('succeeded')
    const paid = await prisma.invoice.findUniqueOrThrow({ where: { id: inv2 } })
    expect(paid.status).toBe('paid')
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: started.paymentId } })
    const refunded = await refundShopPayment(null, { input: { paymentId: pay.id, amountMinor: pay.amountMinor.toString(), reason: 'Customer cancelled the brake job' }, idempotencyKey: key('r') }, manager) as { status?: string; approvalRequired?: boolean; approvalRequestId?: string }
    if (refunded.approvalRequired) {
      await settle(owner, refunded.approvalRequestId!)
      await refundShopPayment(null, { input: { paymentId: pay.id, amountMinor: pay.amountMinor.toString(), reason: 'Customer cancelled the brake job', approvalRequestId: refunded.approvalRequestId }, idempotencyKey: key('r') }, manager)
    }
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('refunded')
    const reopened = await prisma.invoice.findUniqueOrThrow({ where: { id: inv2 } })
    expect(reopened.balanceMinor).toBe(reopened.totalMinor)
  })

  it('day close counts cash, needs a reason for a variance, freezes the day, and reopening needs approval', { timeout: 120_000 }, async () => {
    const day = new Date().toISOString().slice(0, 10)
    const businessDate = await prisma.payment.findFirstOrThrow({ where: { shopId: NGA, tender: 'cash', status: 'succeeded' }, select: { businessDate: true } })
    const date = businessDate.businessDate!.toISOString().slice(0, 10)
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    void day
    const sum = await prisma.payment.aggregate({ where: { shopId: NGA, tender: 'cash', businessDate: businessDate.businessDate, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } }, _sum: { amountMinor: true } })
    const expected = sum._sum.amountMinor ?? 0n
    await expect(closeShopDay(null, { shopId: NGA, businessDate: date, drawerCountMinor: (expected - 500n).toString(), idempotencyKey: key('d') }, advisor)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const closed = await closeShopDay(null, { shopId: NGA, businessDate: date, drawerCountMinor: (expected - 500n).toString(), varianceReason: 'Short on the float', idempotencyKey: key('d') }, advisor) as { id: string; varianceMinor: string }
    expect(closed.varianceMinor).toBe('-500')
    await expect(closeShopDay(null, { shopId: NGA, businessDate: date, drawerCountMinor: expected.toString(), idempotencyKey: key('d') }, advisor)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(prisma.$executeRawUnsafe(`UPDATE "BusinessDayClose" SET "drawerCountMinor" = 0, "varianceMinor" = -"expectedCashMinor" WHERE id = '${closed.id}'`)).rejects.toThrow(/closed/i)
    // A payment taken after the close lands on the next open day, not the closed one.
    const rid = await newRepairOrder('seed_cust_02', '')
    const dep = await takeShopPayment(null, { input: { purpose: 'deposit', repairOrderId: rid, tender: 'cash', amountMinor: '5000' }, idempotencyKey: key('p') }, advisor) as { id: string }
    const posted = await prisma.payment.findUniqueOrThrow({ where: { id: dep.id } })
    expect(posted.businessDate!.toISOString().slice(0, 10) > date).toBe(true)
    const asked = await reopenShopDay(null, { dayCloseId: closed.id, reason: 'A check was missed', idempotencyKey: key('o') }, advisor) as { approvalRequired: boolean; approvalRequestId: string }
    expect(asked.approvalRequired).toBe(true)
    await settle(manager, asked.approvalRequestId)
    const reopen = await reopenShopDay(null, { dayCloseId: closed.id, reason: 'A check was missed', approvalRequestId: asked.approvalRequestId, idempotencyKey: key('o') }, advisor) as { status: string }
    expect(reopen.status).toBe('reopened')
  })

  it('an assistant cannot take money, refund, finalize or close the day: GraphQL, MCP guard and raw SQL', { timeout: 60_000 }, async () => {
    const calls: [string, () => Promise<unknown>][] = [
      ['finalizeShopInvoice', () => finalizeShopInvoice(null, { input: { repairOrderId: roId, expectedVersion: 0 }, idempotencyKey: key('x') }, viaMcp)],
      ['takeShopPayment', () => takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [invoiceId], tender: 'cash', amountMinor: '100' }, idempotencyKey: key('x') }, viaMcp)],
      ['closeShopDay', () => closeShopDay(null, { shopId: NGA, businessDate: '2026-01-01', drawerCountMinor: '0', idempotencyKey: key('x') }, viaMcp)],
      ['releaseShopVehicle', () => releaseShopVehicle(null, { repairOrderId: roId, idempotencyKey: key('x') }, viaMcp)],
    ]
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
      const problem = mcpOperationProblem({ document: parse(`mutation { ${name}(idempotencyKey: "abcdefgh") }`), scopes: ['mcp:read', 'mcp:write'] })
      expect(problem, name).toBeTruthy()
    }
    // In a transaction marked as an agent's, the database itself refuses a new payment.
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.actor_kind', 'agent', true)`
      await tx.payment.create({ data: { shopId: NGA, purpose: 'invoice', tender: 'cash', amountMinor: 100n, idempotencyKey: key('raw'), status: 'succeeded' } })
    })).rejects.toThrow(/agents cannot write/i)
  })

  it('stays within the audit chain after all of it', { timeout: 120_000 }, async () => {
    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
    expect(await prisma.auditEvent.count({ where: { eventType: { in: ['invoice.finalized', 'payment.succeeded', 'refund.succeeded', 'day.closed'] } } })).toBeGreaterThanOrEqual(4)
  })
})
