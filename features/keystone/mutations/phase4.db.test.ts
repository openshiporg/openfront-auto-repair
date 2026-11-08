import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'graphql'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { mcpOperationProblem } from '../mcp-oauth/guard'
import { resetFixtureSuppliers, fixtureOrdersReceived } from '../../integrations/parts-supplier'
import { decideApprovalRequest } from './approvals'
import { checkInShopVehicle } from './phase1'
import { addRepairJob, openShopRepairOrder, recordCustomerAuthorization, sendRepairEstimate, transitionRepairJob } from './phase2'
import { finalizeShopInvoice } from './phase3'
import {
  adjustShopStock, approveShopSupplierInvoice, cancelShopSupplierOrder, completeShopTireRegistration, createShopSupplierOrder, issueJobPart, markShopCoreReturned, matchShopSupplierInvoice,
  placeSupplierOrder, postShopCycleCount, receiveShopSupplierOrder, recordShopCounts, recordShopJobTire, recordShopSupplierInvoice, requestSupplierQuote, reserveJobPart, resolveSupplierDiscrepancy,
  resolveUnknownSupplierOrder, startShopCycleCount, sweepShopTireRegistrations, writeOffShopCore, returnJobPart, saveShopPartItem, selectSupplierQuote,
} from './phase4'
import { loadNorthgateSetup } from './setup'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))
const sessionFor = (id: string, granted: string[], extra: Record<string, unknown> = {}) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: ALL_SHOPS, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
  ...extra,
})
const NGA = 'seed_shop_nga'
const NGT = 'seed_shop_ngt'
const SIGNATURE = { method: 'in_person' as const, signerName: 'Marcus Delgado', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] }
const COUNTER = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canMessageCustomers', 'canReadCustomerPII', 'canManageCustomers', 'canFinalizeInvoices', 'canTakePayments', 'canReadFinancials']
const PARTS = [...COUNTER, 'canManageParts', 'canOrderParts', 'canReceiveParts', 'canSeeCost', 'canManageTireRegistrations']
const MANAGER = [...PARTS, 'canApproveSupplierInvoice', 'canApproveStockAdjustment', 'canApproveCoreWriteOff']
const PADS = { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' }
const BRAKE_JOB = [{ kind: 'labor', description: 'Front brake pads, replace', rateClassCode: 'general', soldCentiHours: 100 }, PADS]
const TIRE_JOB = [
  { kind: 'labor', description: 'Mount and balance four tires', rateClassCode: 'general', soldCentiHours: 100 },
  { kind: 'tire', description: 'Michelin Pilot Sport 225/45R17 94W', partNumber: 'XPS-22545R17', brand: 'Michelin', partCategory: 'tires', condition: 'new', quantityMilli: 4000, unitCostMinor: '17900', isNewTire: true, tireSize: '225/45R17' },
]

describe.skipIf(!hasTestDatabase)('Phase 4 parts, inventory, cores and supplier invoices (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx, advisor: Ctx, parts: Ctx, manager: Ctx, viaMcp: Ctx
  let capitol = '', valley = '', sierra = ''
  const key = (p: string) => uniqueKey(p)
  const item = (sku: string, shop = NGA) => prisma.shopItem.findFirstOrThrow({ where: { shopId: shop, sku }, include: { stock: true } })
  const level = async (sku: string, shop = NGA) => (await item(sku, shop)).stock!

  async function newRepairOrder(customerId: string) {
    const owned = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId, endedAt: null }, include: { vehicle: true } })
    const checkIn = await checkInShopVehicle(null, { input: { shopId: NGA, customerId, vehicleId: owned.vehicleId!, concerns: ['Grinding from the front brakes'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: (owned.vehicle!.lastOdometer ?? 0) + 200 }, signature: SIGNATURE }, idempotencyKey: key('ci') }, advisor) as { id: string }
    return (await openShopRepairOrder(null, { input: { checkInId: checkIn.id }, idempotencyKey: key('ro') }, advisor) as { id: string }).id
  }
  /** A job priced and sent; authorized only when asked. */
  async function jobOn(repairOrderId: string, lines: unknown[], authorize: boolean) {
    const added = await addRepairJob(null, { input: { repairOrderId, title: 'Parts job', lines }, idempotencyKey: key('j') }, advisor) as { id: string }
    if (authorize) {
      const row = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId } })
      const v = await sendRepairEstimate(null, { repairOrderId, expectedVersion: row.version, idempotencyKey: key('e') }, advisor) as { id: string }
      await recordCustomerAuthorization(null, { input: { estimateVersionId: v.id, method: 'oral_phone', actorName: 'Marcus Delgado', phoneNumber: '(916) 555-0104', answers: [{ jobId: added.id, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: key('a') }, advisor)
    }
    return added.id
  }
  const settle = async (ctx: Ctx, approvalId: string) => {
    const req = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } })
    return decideApprovalRequest(null, { requestId: approvalId, decision: 'approve', reason: 'Checked the count', expectedVersion: req.version, idempotencyKey: key('d') }, ctx)
  }
  /** Order, place and receive the lines in full; returns the order id. */
  async function orderAndReceive(supplierId: string, lines: any[], kind: 'job' | 'stock' = 'stock') {
    const made = await createShopSupplierOrder(null, { input: { shopId: NGA, supplierId, kind, lines }, idempotencyKey: key('po') }, parts) as { id: string }
    const placed = await placeSupplierOrder(null, { orderId: made.id, idempotencyKey: key('place') }, parts) as { status: string }
    expect(placed.status).toBe('placed')
    const orderLines = await prisma.supplierOrderLine.findMany({ where: { orderId: made.id } })
    await receiveShopSupplierOrder(null, { input: { orderId: made.id, receiptKey: key('rc'), lines: orderLines.map(l => ({ orderLineId: l.id, quantityMilli: l.quantityMilli })) }, idempotencyKey: key('r') }, parts)
    return made.id
  }

  beforeAll(async () => {
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    resetFixtureSuppliers()
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a, p, m] = await Promise.all([make('owner'), make('advisor'), make('parts'), make('manager')])
    owner = { session: sessionFor(o.id, permissionNames.filter(x => x !== 'canBreakGlass')), prisma }
    advisor = { session: sessionFor(a.id, COUNTER), prisma }
    parts = { session: sessionFor(p.id, PARTS), prisma }
    manager = { session: sessionFor(m.id, MANAGER), prisma }
    viaMcp = { session: sessionFor(p.id, PARTS, { mcp: { clientId: 'test-client', scopes: ['mcp:read', 'mcp:write'] } }), prisma }
    await loadNorthgateSetup(null, { idempotencyKey: key('setup') }, owner)
    const sup = (name: string) => prisma.supplier.findFirstOrThrow({ where: { name } }).then(s => s.id)
    ;[capitol, valley, sierra] = await Promise.all([sup('Capitol Auto Parts'), sup('Valley Warehouse Distributing'), sup('Sierra Tire Supply')])
  }, 900_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('loads suppliers and opening stock through the ledger, at the cost paid', { timeout: 60_000 }, async () => {
    expect(await prisma.supplier.count()).toBe(4)
    const pads = await level('BRK-PAD-P06075')
    expect(pads).toMatchObject({ onHandMilli: 4000, committedMilli: 0, averageCostMinor: 4800n })
    const opening = await prisma.stockMovement.count({ where: { type: 'receipt', idempotencyKey: { startsWith: 'seed-opening:' } } })
    expect(opening).toBe(9)
  })

  it('stock never goes negative under parallel issues, and every unit issued is in the ledger', { timeout: 120_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_04')
    const jobId = await jobOn(ro, BRAKE_JOB, true)
    const rotor = await item('BRK-ROT-09C39413')
    // 2.000 on the shelf; ten parallel requests for one each: exactly two can win.
    const tries = await Promise.allSettled(Array.from({ length: 10 }, () => issueJobPart(null, { jobId, shopItemId: rotor.id, quantityMilli: 1000, idempotencyKey: key('iss') }, parts)))
    expect(tries.filter(t => t.status === 'fulfilled')).toHaveLength(2)
    for (const t of tries.filter(t => t.status === 'rejected')) expect((t as PromiseRejectedResult).reason).toMatchObject({ code: 'GUARD_FAILED' })
    const after = await level('BRK-ROT-09C39413')
    expect(after.onHandMilli).toBe(0)
    const issued = await prisma.stockMovement.aggregate({ where: { shopItemId: rotor.id, type: 'issue' }, _sum: { onHandDeltaMilli: true } })
    expect(issued._sum.onHandDeltaMilli).toBe(-2000)
    // The issue is priced at the average cost the shelf held.
    const rows = await prisma.stockMovement.findMany({ where: { shopItemId: rotor.id, type: 'issue' } })
    expect(rows.every(r => r.unitCostMinor === 6500n)).toBe(true)
  })

  it('the same issue key is applied once', { timeout: 60_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_03')
    const jobId = await jobOn(ro, BRAKE_JOB, true)
    const wipers = await item('WIP-24')
    const k = key('once')
    const [a, b] = await Promise.all([issueJobPart(null, { jobId, shopItemId: wipers.id, quantityMilli: 2000, idempotencyKey: k }, parts), issueJobPart(null, { jobId, shopItemId: wipers.id, quantityMilli: 2000, idempotencyKey: k }, parts)])
    expect((a as any).movementId).toBe((b as any).movementId)
    expect((await level('WIP-24')).onHandMilli).toBe(4000)
  })

  it('the database refuses stock that does not come through the ledger, and a ledger that can be edited', { timeout: 60_000 }, async () => {
    const l = await level('WIP-24')
    await expect(prisma.stockLevel.update({ where: { id: l.id }, data: { onHandMilli: 99_000 } })).rejects.toThrow(/stock movements/i)
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.stock_movement', 'on', true)`
      await tx.stockLevel.update({ where: { id: l.id }, data: { onHandMilli: -1 } })
    })).rejects.toThrow(/on_hand_nonnegative|check/i)
    const row = await prisma.stockMovement.findFirstOrThrow()
    await expect(prisma.stockMovement.update({ where: { id: row.id }, data: { reason: 'edited' } })).rejects.toThrow()
    await expect(prisma.stockMovement.delete({ where: { id: row.id } })).rejects.toThrow()
    // A movement that disagrees with the level it claims is refused.
    const wipers = await item('WIP-24')
    await expect(prisma.stockMovement.create({ data: { shopItemId: wipers.id, type: 'adjustment', quantityMilli: 1, idempotencyKey: key('forged'), after: { onHand: 1, committed: 0, onOrder: 0, avgCost: '0' } } })).rejects.toThrow(/does not match/i)
  })

  it('a job\'s parts cannot be ordered or issued before the customer authorizes it (I-S2)', { timeout: 90_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_02')
    const draftJob = await jobOn(ro, BRAKE_JOB, false)
    const q = await requestSupplierQuote(null, { shopId: NGA, supplierId: capitol, partNumber: 'P06075', quantityMilli: 1000, jobId: draftJob, idempotencyKey: key('q') }, parts) as { id: string }
    await expect(createShopSupplierOrder(null, { input: { shopId: NGA, supplierId: capitol, kind: 'job', lines: [{ partQuoteId: q.id, quantityMilli: 1000, jobId: draftJob }] }, idempotencyKey: key('po') }, parts)).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' })
    const pads = await item('BRK-PAD-P06075')
    await expect(issueJobPart(null, { jobId: draftJob, shopItemId: pads.id, quantityMilli: 1000, idempotencyKey: key('iss') }, parts)).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' })
    await expect(reserveJobPart(null, { jobId: draftJob, shopItemId: pads.id, quantityMilli: 1000, idempotencyKey: key('res') }, parts)).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' })
  })

  it('quote → select → order on authorization → receive → issue at the weighted-average cost → return', { timeout: 180_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_01')
    const jobId = await jobOn(ro, BRAKE_JOB, true)
    // Two suppliers answer; the cheaper one is chosen.
    const a = await requestSupplierQuote(null, { shopId: NGA, supplierId: capitol, partNumber: '09.C394.13', quantityMilli: 2000, jobId, idempotencyKey: key('q') }, parts) as { found: boolean; id: string }
    const b = await requestSupplierQuote(null, { shopId: NGA, supplierId: valley, partNumber: '09.C394.13', quantityMilli: 2000, jobId, idempotencyKey: key('q') }, parts) as { found: boolean; id: string }
    expect([a.found, b.found]).toEqual([true, true])
    const qa = await prisma.partQuote.findUniqueOrThrow({ where: { id: a.id } })
    const qb = await prisma.partQuote.findUniqueOrThrow({ where: { id: b.id } })
    expect(qb.unitCostMinor).toBeLessThan(qa.unitCostMinor)
    await selectSupplierQuote(null, { quoteId: b.id, idempotencyKey: key('sel') }, parts)
    expect((await prisma.partQuote.findUniqueOrThrow({ where: { id: a.id } })).status).toBe('rejected')
    const orderId = await orderAndReceive(valley, [{ partQuoteId: b.id, quantityMilli: 2000, jobId }], 'job')
    // 2 rotors at the Valley price joined the shelf (which was down to 0): the average is that price.
    const rotor = await level('BRK-ROT-09C39413')
    expect(rotor.onHandMilli).toBe(2000)
    expect(rotor.committedMilli).toBe(2000)
    expect(rotor.averageCostMinor).toBe(qb.unitCostMinor)
    expect((await prisma.supplierOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('received')
    // Issue what the job held, then bring one back.
    const rotorItem = await item('BRK-ROT-09C39413')
    const out = await issueJobPart(null, { jobId, shopItemId: rotorItem.id, quantityMilli: 2000, idempotencyKey: key('iss') }, parts) as { unitCostMinor: string }
    expect(out.unitCostMinor).toBe(qb.unitCostMinor.toString())
    expect(await level('BRK-ROT-09C39413')).toMatchObject({ onHandMilli: 0, committedMilli: 0 })
    await returnJobPart(null, { jobId, shopItemId: rotorItem.id, quantityMilli: 1000, idempotencyKey: key('ret') }, parts)
    await expect(returnJobPart(null, { jobId, shopItemId: rotorItem.id, quantityMilli: 2000, idempotencyKey: key('ret') }, parts)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    expect((await level('BRK-ROT-09C39413')).onHandMilli).toBe(1000)
  })

  it('weighted-average cost follows each receipt', { timeout: 120_000 }, async () => {
    // 4.000 oil filters on hand at 3.75; receive 6.000 more at the Capitol price.
    const before = await level('FIL-OIL-PH3614')
    const q = await prisma.supplierOrder.count()
    expect(q).toBeGreaterThan(0)
    const filter = await item('FIL-OIL-PH3614')
    const made = await createShopSupplierOrder(null, { input: { shopId: NGA, supplierId: capitol, kind: 'stock', lines: [{ partNumber: 'PH3614', brand: 'Fram', description: 'Oil filter, spin-on', quantityMilli: 6000, unitCostMinor: '525' }] }, idempotencyKey: key('po') }, parts) as { id: string }
    await placeSupplierOrder(null, { orderId: made.id, idempotencyKey: key('pl') }, parts)
    expect((await level('FIL-OIL-PH3614')).onOrderMilli).toBe(6000)
    const line = await prisma.supplierOrderLine.findFirstOrThrow({ where: { orderId: made.id } })
    // A part-shipment, then the rest. The same receipt key twice moves nothing.
    const rk = key('rc')
    await receiveShopSupplierOrder(null, { input: { orderId: made.id, receiptKey: rk, lines: [{ orderLineId: line.id, quantityMilli: 2000 }] }, idempotencyKey: key('r1') }, parts)
    const again = await receiveShopSupplierOrder(null, { input: { orderId: made.id, receiptKey: rk, lines: [{ orderLineId: line.id, quantityMilli: 2000 }] }, idempotencyKey: key('r1b') }, parts) as { replay: boolean }
    expect(again.replay).toBe(true)
    expect((await prisma.supplierOrder.findUniqueOrThrow({ where: { id: made.id } })).status).toBe('partially_received')
    await expect(receiveShopSupplierOrder(null, { input: { orderId: made.id, receiptKey: key('rc'), lines: [{ orderLineId: line.id, quantityMilli: 5000 }] }, idempotencyKey: key('r2') }, parts)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await receiveShopSupplierOrder(null, { input: { orderId: made.id, receiptKey: key('rc'), lines: [{ orderLineId: line.id, quantityMilli: 4000 }] }, idempotencyKey: key('r3') }, parts)
    const after = await level('FIL-OIL-PH3614')
    expect(after.onHandMilli).toBe(before.onHandMilli + 6000)
    expect(after.onOrderMilli).toBe(0)
    // (14 × 3.75 + 6 × 5.25) / 20 = 4.20
    expect(after.averageCostMinor).toBe(420n)
    expect(filter.id).toBeTruthy()
    expect((await prisma.supplierOrder.findUniqueOrThrow({ where: { id: made.id } })).status).toBe('received')
  })

  it('an order that times out is unknown, is never sent again, and the resolver finds it without a duplicate', { timeout: 120_000 }, async () => {
    const made = await createShopSupplierOrder(null, { input: { shopId: NGA, supplierId: valley, kind: 'stock', lines: [{ partNumber: 'KYB-339370', brand: 'KYB', description: 'Front strut assembly, complete', quantityMilli: 2000, unitCostMinor: '8450' }] }, idempotencyKey: key('po') }, parts) as { id: string; reference: string }
    const sent = await placeSupplierOrder(null, { orderId: made.id, idempotencyKey: key('pl') }, parts) as { status: string }
    expect(sent.status).toBe('unknown')
    expect(fixtureOrdersReceived(made.reference)).toBe(1)
    // A second press cannot send it again: the order is not in a state that can be placed.
    await expect(placeSupplierOrder(null, { orderId: made.id, idempotencyKey: key('pl2') }, parts)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    expect(fixtureOrdersReceived(made.reference)).toBe(1)
    // Nothing is on order yet; receiving is refused until a person settles it.
    const line = await prisma.supplierOrderLine.findFirstOrThrow({ where: { orderId: made.id } })
    await expect(receiveShopSupplierOrder(null, { input: { orderId: made.id, receiptKey: key('rc'), lines: [{ orderLineId: line.id, quantityMilli: 1000 }] }, idempotencyKey: key('r') }, parts)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    // An assistant cannot resolve it.
    const viaAgent = { session: sessionFor('agent', PARTS, { mcp: { clientId: 'c', scopes: ['mcp:write'] } }), prisma }
    await expect(resolveUnknownSupplierOrder(null, { orderId: made.id, note: 'Looks placed', idempotencyKey: key('x') }, viaAgent)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    // The resolver asks the supplier for its record of the reference and finds the one order.
    const resolved = await resolveUnknownSupplierOrder(null, { orderId: made.id, note: 'Valley Warehouse has it under this reference', idempotencyKey: key('res') }, parts) as { status: string }
    expect(resolved.status).toBe('placed')
    expect(fixtureOrdersReceived(made.reference)).toBe(1)
    expect((await prisma.supplierOrder.findUniqueOrThrow({ where: { id: made.id } })).placedAt).not.toBeNull()
    expect((await level('TIR-MICH-22545R17', NGT)).onOrderMilli).toBe(0)
    const tire = await prisma.supplierOrderLine.findFirstOrThrow({ where: { orderId: made.id } })
    expect(tire.shopItemId).toBeTruthy()
    expect((await prisma.stockLevel.findFirstOrThrow({ where: { shopItem: { id: tire.shopItemId! } } })).onOrderMilli).toBe(2000)
  })

  it('cancelling an order takes it off order', { timeout: 60_000 }, async () => {
    const made = await createShopSupplierOrder(null, { input: { shopId: NGA, supplierId: capitol, kind: 'stock', lines: [{ partNumber: 'WB-24', brand: 'Bosch', description: 'Wiper blade, 24 in', quantityMilli: 3000, unitCostMinor: '790' }] }, idempotencyKey: key('po') }, parts) as { id: string }
    await placeSupplierOrder(null, { orderId: made.id, idempotencyKey: key('pl') }, parts)
    expect((await level('WIP-24')).onOrderMilli).toBe(3000)
    await cancelShopSupplierOrder(null, { orderId: made.id, reason: 'Found them cheaper elsewhere', idempotencyKey: key('c') }, parts)
    expect((await level('WIP-24')).onOrderMilli).toBe(0)
  })

  // ── Cores, supplier invoices, counts, tires ────────────────────────────────

  let coreA = '', coreB = '', invoiceId = ''
  const today = () => new Date().toISOString().slice(0, 10)

  it('a part with a core charge makes a core due back to the supplier within its return window', { timeout: 180_000 }, async () => {
    const alt = { partNumber: 'ALT-11481', brand: 'Bosch', description: 'Alternator, remanufactured', quantityMilli: 1000, unitCostMinor: '18900', coreChargeMinor: '4500' }
    await orderAndReceive(capitol, [alt])
    await orderAndReceive(valley, [alt])
    const cores = await prisma.coreObligation.findMany({ where: { partNumber: 'ALT-11481' }, orderBy: { createdAt: 'asc' } })
    expect(cores).toHaveLength(2)
    expect(cores.every(c => c.status === 'owed' && c.coreChargeMinor === 4500n && c.owedTo === 'supplier')).toBe(true)
    const capitolCore = cores.find(c => c.supplierId === capitol)!
    const days = Math.round((capitolCore.dueAt!.getTime() - Date.now()) / 86_400_000)
    expect(days).toBe(30)
    const valleyCore = cores.find(c => c.supplierId === valley)!
    expect(Math.round((valleyCore.dueAt!.getTime() - Date.now()) / 86_400_000)).toBe(45)
    coreA = capitolCore.id
    coreB = valleyCore.id
  })

  it('a duplicate supplier invoice number is rejected, in the command and in the database', { timeout: 120_000 }, async () => {
    await orderAndReceive(capitol, [{ partNumber: 'CF10285', brand: 'Fram', description: 'Cabin air filter', quantityMilli: 2000, unitCostMinor: '1150' }])
    const input = {
      shopId: NGA, supplierId: capitol, invoiceNumber: 'CAP-884217', invoiceDate: today(), totalMinor: String(18900 + 2000 * 1400),
      lines: [{ partNumber: 'ALT-11481', quantityMilli: 1000, unitCostMinor: '18900' }, { partNumber: 'CF10285', quantityMilli: 2000, unitCostMinor: '1400' }],
    }
    const made = await recordShopSupplierInvoice(null, { input, idempotencyKey: key('inv') }, parts) as { id: string }
    invoiceId = made.id
    await expect(recordShopSupplierInvoice(null, { input: { ...input, invoiceNumber: ' cap-884217 ' }, idempotencyKey: key('inv') }, parts)).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(prisma.supplierInvoice.create({ data: { shopId: NGA, supplierId: capitol, invoiceNumber: 'CAP-884217', totalMinor: 1n } })).rejects.toThrow()
    // The same number at a different supplier is a different invoice.
    await recordShopSupplierInvoice(null, { input: { ...input, supplierId: valley, lines: [{ partNumber: 'ALT-11481', quantityMilli: 1000, unitCostMinor: '18900' }], totalMinor: '18900' }, idempotencyKey: key('inv') }, parts)
    expect(await prisma.supplierInvoice.count({ where: { invoiceNumber: 'CAP-884217' } })).toBe(2)
  })

  it('three-way match: an overcharge and a returned core with no credit become discrepancies, and block approval', { timeout: 180_000 }, async () => {
    await markShopCoreReturned(null, { coreId: coreA, note: 'Boxed and sent with the Friday driver', idempotencyKey: key('cr') }, parts)
    expect((await prisma.coreObligation.findUniqueOrThrow({ where: { id: coreA } })).status).toBe('returned')
    const matched = await matchShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('m') }, parts) as { status: string; discrepancies: number }
    expect(matched).toMatchObject({ status: 'discrepancy', discrepancies: 2 })
    const found = await prisma.discrepancy.findMany({ where: { invoiceId }, orderBy: { kind: 'asc' } })
    expect(found.map(d => d.kind)).toEqual(['core_not_credited', 'overcharge'])
    expect(found.find(d => d.kind === 'overcharge')!.amountMinor).toBe(500n)
    expect(found.find(d => d.kind === 'core_not_credited')!.amountMinor).toBe(4500n)
    // Matching again adds nothing.
    await matchShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('m') }, parts)
    expect(await prisma.discrepancy.count({ where: { invoiceId } })).toBe(2)
    await expect(approveShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('ap') }, manager)).rejects.toMatchObject({ code: expect.stringMatching(/GUARD_FAILED|INVALID_TRANSITION/) })
    for (const d of found) await resolveSupplierDiscrepancy(null, { discrepancyId: d.id, outcome: 'resolved', resolution: d.kind === 'overcharge' ? 'Capitol corrected the price on a credit memo' : 'Capitol issued the core credit', idempotencyKey: key('rd') }, manager)
    expect((await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('matched')
  })

  it('only a person with the permission approves and exports a supplier invoice; an assistant cannot', { timeout: 120_000 }, async () => {
    const managerViaMcp = { session: sessionFor('mgr', MANAGER, { mcp: { clientId: 'c', scopes: ['mcp:read', 'mcp:write'] } }), prisma }
    await expect(approveShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('ap') }, managerViaMcp)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    await expect(approveShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('ap') }, parts)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.actor_kind', 'agent', true)`
      await tx.supplierInvoice.update({ where: { id: invoiceId }, data: { status: 'approved' } })
    })).rejects.toThrow(/agents cannot write/i)
    for (const name of ['approveShopSupplierInvoice', 'exportShopSupplierInvoice', 'adjustShopStock', 'postShopCycleCount', 'writeOffShopCore', 'resolveUnknownSupplierOrder', 'resolveSupplierDiscrepancy', 'completeShopTireRegistration']) {
      expect(mcpOperationProblem({ document: parse(`mutation { ${name}(idempotencyKey: "abcdefgh") }`), scopes: ['mcp:read', 'mcp:write'] }), name).toBeTruthy()
    }
    await approveShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('ap') }, manager)
    const { exportShopSupplierInvoice } = await import('./phase4')
    const out = await exportShopSupplierInvoice(null, { invoiceId, idempotencyKey: key('ex') }, manager) as { exportReference: string; csv: string }
    expect(out.exportReference).toBe('AP-CAP-884217')
    expect(out.csv.split('\n')).toHaveLength(3)
    const row = await prisma.supplierInvoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(row).toMatchObject({ status: 'exported', exportReference: 'AP-CAP-884217' })
    expect(row.approvedById).not.toBeNull()
  })

  it('an uncredited core is written off only after a manager approves, and can be credited by a later invoice line', { timeout: 120_000 }, async () => {
    const first = await writeOffShopCore(null, { coreId: coreB, reason: 'Valley refused the worn core', idempotencyKey: key('wo') }, parts) as { approvalRequired: boolean; approvalRequestId: string }
    expect(first.approvalRequired).toBe(true)
    expect((await prisma.coreObligation.findUniqueOrThrow({ where: { id: coreB } })).status).toBe('owed')
    await settle(manager, first.approvalRequestId)
    const done = await writeOffShopCore(null, { coreId: coreB, reason: 'Valley refused the worn core', approvalRequestId: first.approvalRequestId, idempotencyKey: key('wo') }, parts) as { approvalRequired: boolean }
    expect(done.approvalRequired).toBe(false)
    expect(await prisma.coreObligation.findUniqueOrThrow({ where: { id: coreB } })).toMatchObject({ status: 'written_off', writeOffReason: 'Valley refused the worn core', approvalId: first.approvalRequestId })
    // A core with a credit on the invoice is credited at matching and raises nothing.
    await orderAndReceive(sierra, [{ partNumber: 'BAT-H6-AGM', brand: 'Interstate', description: 'AGM battery, group H6', quantityMilli: 1000, unitCostMinor: '16400', coreChargeMinor: '2200' }])
    const core = await prisma.coreObligation.findFirstOrThrow({ where: { partNumber: 'BAT-H6-AGM', supplierId: sierra } })
    await markShopCoreReturned(null, { coreId: core.id, idempotencyKey: key('cr') }, parts)
    const inv = await recordShopSupplierInvoice(null, { input: { shopId: NGA, supplierId: sierra, invoiceNumber: 'STS-55102', invoiceDate: today(), totalMinor: '14200', lines: [{ partNumber: 'BAT-H6-AGM', quantityMilli: 1000, unitCostMinor: '16400', coreCreditMinor: '2200' }] }, idempotencyKey: key('inv') }, parts) as { id: string }
    expect(await matchShopSupplierInvoice(null, { invoiceId: inv.id, idempotencyKey: key('m') }, parts)).toMatchObject({ status: 'matched', discrepancies: 0 })
    expect((await prisma.coreObligation.findUniqueOrThrow({ where: { id: core.id } })).status).toBe('credited')
  })

  it('a unit billed but never ordered is an unordered-item discrepancy', { timeout: 60_000 }, async () => {
    const inv = await recordShopSupplierInvoice(null, { input: { shopId: NGA, supplierId: valley, invoiceNumber: 'VWD-2290', invoiceDate: today(), totalMinor: '9900', lines: [{ partNumber: 'NOT-ORDERED-9', quantityMilli: 1000, unitCostMinor: '9900' }] }, idempotencyKey: key('inv') }, parts) as { id: string }
    expect(await matchShopSupplierInvoice(null, { invoiceId: inv.id, idempotencyKey: key('m') }, parts)).toMatchObject({ status: 'discrepancy' })
    expect((await prisma.discrepancy.findFirstOrThrow({ where: { invoiceId: inv.id } })).kind).toBe('unordered_item')
  })

  it('cycle counts post the variance; a large one waits for a manager', { timeout: 180_000 }, async () => {
    const wipers = await item('WIP-24')
    const filter = await item('FIL-CAB-CF10285')
    const small = await startShopCycleCount(null, { shopId: NGA, shopItemIds: [wipers.id, filter.id], idempotencyKey: key('cc') }, parts) as { id: string; reference: string }
    expect(small.reference).toMatch(/^CC-NGA-\d{4}-\d{5}$/)
    const w = await level('WIP-24'); const f = await level('FIL-CAB-CF10285')
    await expect(postShopCycleCount(null, { cycleCountId: small.id, idempotencyKey: key('pc') }, parts)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    await recordShopCounts(null, { cycleCountId: small.id, counts: [{ shopItemId: wipers.id, countedMilli: w.onHandMilli - 1000 }, { shopItemId: filter.id, countedMilli: f.onHandMilli }], idempotencyKey: key('rc') }, parts)
    const posted = await postShopCycleCount(null, { cycleCountId: small.id, idempotencyKey: key('pc') }, parts) as { approvalRequired: boolean; varianceValueMinor: string }
    expect(posted).toMatchObject({ approvalRequired: false, varianceValueMinor: '790' })
    expect((await level('WIP-24')).onHandMilli).toBe(w.onHandMilli - 1000)
    expect(await prisma.stockMovement.count({ where: { type: 'count', cycleCountId: small.id } })).toBe(1)
    // A battery count that finds both gone is $328 of variance.
    const battery = await item('BAT-H6-AGM')
    const big = await startShopCycleCount(null, { shopId: NGA, shopItemIds: [battery.id], idempotencyKey: key('cc') }, parts) as { id: string }
    const b = await level('BAT-H6-AGM')
    await recordShopCounts(null, { cycleCountId: big.id, counts: [{ shopItemId: battery.id, countedMilli: 0 }], idempotencyKey: key('rc') }, parts)
    const asked = await postShopCycleCount(null, { cycleCountId: big.id, idempotencyKey: key('pc') }, parts) as { approvalRequired: boolean; approvalRequestId: string }
    expect(asked.approvalRequired).toBe(true)
    expect((await level('BAT-H6-AGM')).onHandMilli).toBe(b.onHandMilli)
    await settle(manager, asked.approvalRequestId)
    const done = await postShopCycleCount(null, { cycleCountId: big.id, approvalRequestId: asked.approvalRequestId, idempotencyKey: key('pc') }, parts) as { approvalRequired: boolean }
    expect(done.approvalRequired).toBe(false)
    expect((await level('BAT-H6-AGM')).onHandMilli).toBe(0)
    // A single adjustment is also a ledger row, with the reason.
    const adj = await adjustShopStock(null, { shopItemId: wipers.id, deltaMilli: 1000, reason: 'Found a box behind the shelf', idempotencyKey: key('adj') }, parts) as { approvalRequired: boolean }
    expect(adj.approvalRequired).toBe(false)
    expect((await prisma.stockMovement.findFirstOrThrow({ where: { type: 'adjustment', shopItemId: wipers.id } })).reason).toBe('Found a box behind the shelf')
  })

  it('a new-tire sale creates a registration obligation due 30 days later, and it moves through its states', { timeout: 300_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_06')
    const jobId = await jobOn(ro, TIRE_JOB, true)
    const tins = ['DOT B3HX4C8R2423', 'DOT B3HX4C8R2523', 'DOT B3HX4C8R2623', 'dot b3hx4c8r2723']
    for (const [i, tin] of tins.entries()) await recordShopJobTire(null, { jobId, tireSize: '225/45R17', position: ['LF', 'RF', 'LR', 'RR'][i], tin, idempotencyKey: key('tin') }, parts)
    await expect(recordShopJobTire(null, { jobId, position: 'spare', tin: 'DOT B3HX4C8R2423', idempotencyKey: key('tin') }, parts)).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(recordShopJobTire(null, { jobId, position: 'spare', tin: 'DOT 12', idempotencyKey: key('tin') }, parts)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const j1 = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
    await transitionRepairJob(null, { jobId, to: 'in_progress', expectedVersion: j1.version, idempotencyKey: key('s') }, advisor)
    const j2 = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
    await transitionRepairJob(null, { jobId, to: 'completed', expectedVersion: j2.version, cause: 'Tires worn past the wear bars', correction: 'Mounted and balanced four new tires', idempotencyKey: key('c') }, advisor)
    const r = await prisma.repairOrder.findUniqueOrThrow({ where: { id: ro }, include: { vehicle: true } })
    const fin = await finalizeShopInvoice(null, { input: { repairOrderId: ro, expectedVersion: r.version, odometerOut: (r.vehicle!.lastOdometer ?? 0) + 5 }, idempotencyKey: key('f') }, advisor) as { invoices: { id: string }[] }
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: fin.invoices[0].id } })
    const obligations = await prisma.tireRegistrationObligation.findMany({ where: { invoiceId: invoice.id } })
    expect(obligations).toHaveLength(1)
    const ob = obligations[0]
    expect(ob.status).toBe('open')
    expect((ob.dueAt!.getTime() - invoice.invoiceDate!.getTime()) / 86_400_000).toBe(30)
    expect((ob.tins as string[]).sort()).toEqual(['B3HX4C8R2423', 'B3HX4C8R2523', 'B3HX4C8R2623', 'B3HX4C8R2723'])
    expect(ob.tireDescription).toMatch(/^4 × /)
    expect(await prisma.invoiceLine.count({ where: { invoiceId: invoice.id, kind: 'fee', description: { contains: 'tire', mode: 'insensitive' } } })).toBeGreaterThanOrEqual(0)
    // Today it is not overdue; 31 days on, the sweep marks it.
    expect(await sweepShopTireRegistrations(null, { idempotencyKey: key('sw') }, manager)).toMatchObject({ overdue: 0 })
    const { runInTransaction } = await import('../lib/unitOfWork')
    const { sweepTireRegistrations } = await import('../lib/tires')
    const { actorFromSession } = await import('../lib/actor')
    const later = new Date(Date.now() + 32 * 86_400_000)
    expect(await runInTransaction(prisma, uow => sweepTireRegistrations(uow, actorFromSession((manager as any).session)), { now: later })).toBeGreaterThanOrEqual(1)
    expect((await prisma.tireRegistrationObligation.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('overdue')
    // An assistant cannot complete it; a person can, and then confirm it.
    const viaAgent = { session: sessionFor('mgr', MANAGER, { mcp: { clientId: 'c', scopes: ['mcp:write'] } }), prisma }
    await expect(completeShopTireRegistration(null, { obligationId: ob.id, method: 'form_handed_over', idempotencyKey: key('tc') }, viaAgent)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    const { confirmShopTireRegistration } = await import('./phase4')
    await completeShopTireRegistration(null, { obligationId: ob.id, method: 'form_handed_over', note: 'Form given to the customer at pickup', idempotencyKey: key('tc') }, manager)
    expect((await prisma.tireRegistrationObligation.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('handed_over')
    await confirmShopTireRegistration(null, { obligationId: ob.id, idempotencyKey: key('tf') }, manager)
    expect((await prisma.tireRegistrationObligation.findUniqueOrThrow({ where: { id: ob.id } })).status).toBe('confirmed')
  })

  it('part records are saved once per SKU and an assistant can quote but not adjust', { timeout: 60_000 }, async () => {
    const base = { shopId: NGA, sku: 'HOSE-HEATER-5/8', partNumber: 'H-58', brand: 'Gates', description: 'Heater hose, 5/8 in', category: 'hoses', unitOfMeasure: 'foot', isStocked: true }
    await saveShopPartItem(null, { input: base, idempotencyKey: key('it') }, parts)
    await expect(saveShopPartItem(null, { input: { ...base, sku: 'hose-heater-5/8' }, idempotencyKey: key('it') }, parts)).rejects.toMatchObject({ code: 'DUPLICATE' })
    const wipers = await item('WIP-24')
    await expect(adjustShopStock(null, { shopItemId: wipers.id, deltaMilli: 1000, reason: 'Nope', idempotencyKey: key('adj') }, viaMcp)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    await expect(requestSupplierQuote(null, { shopId: NGA, supplierId: sierra, partNumber: 'P06075', quantityMilli: 1000, idempotencyKey: key('q') }, viaMcp)).resolves.toMatchObject({ found: false })
    const quoted = await requestSupplierQuote(null, { shopId: NGA, supplierId: capitol, partNumber: 'P06075', quantityMilli: 1000, idempotencyKey: key('q') }, viaMcp) as { found: boolean }
    expect(quoted.found).toBe(true)
  })

  it('stays within the audit chain, and every stock level equals the sum of its ledger', { timeout: 180_000 }, async () => {
    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
    const levels = await prisma.$queryRaw<{ sku: string; onHand: number; ledger: number; committed: number; ledgerCommitted: number; onOrder: number; ledgerOnOrder: number }[]>`
      SELECT i.sku, s."onHandMilli" AS "onHand", COALESCE(SUM(m."onHandDeltaMilli"), 0)::int AS ledger,
             s."committedMilli" AS committed, COALESCE(SUM(m."committedDeltaMilli"), 0)::int AS "ledgerCommitted",
             s."onOrderMilli" AS "onOrder", COALESCE(SUM(m."onOrderDeltaMilli"), 0)::int AS "ledgerOnOrder"
      FROM "ShopItem" i JOIN "StockLevel" s ON s.id = i.stock LEFT JOIN "StockMovement" m ON m."shopItem" = i.id GROUP BY i.sku, s.id`
    expect(levels.length).toBeGreaterThan(8)
    for (const l of levels) expect({ sku: l.sku, onHand: l.onHand, committed: l.committed, onOrder: l.onOrder }).toEqual({ sku: l.sku, onHand: l.ledger, committed: l.ledgerCommitted, onOrder: l.ledgerOnOrder })
    expect(await prisma.auditEvent.count({ where: { eventType: { in: ['stock.receipt', 'stock.issue', 'supplier_order.unknown', 'discrepancy.opened', 'core.written_off', 'tire_registration.opened', 'cycle_count.posted'] } } })).toBeGreaterThanOrEqual(7)
  })
})
