import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { setStripeGateway } from '../lib/stripeGateway'
import { deliverDue, transport } from '../lib/webhooks'
import { checkInShopVehicle } from './phase1'
import { addRepairJob, openShopRepairOrder, recordCustomerAuthorization, sendRepairEstimate, transitionRepairJob } from './phase2'
import { closeShopDay, finalizeShopInvoice, takeShopPayment } from './phase3'
import * as p9 from './phase9'
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
const COUNTER = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canMessageCustomers', 'canReadCustomerPII', 'canManageCustomers', 'canFinalizeInvoices', 'canTakePayments', 'canCloseDay', 'canReadFinancials', 'canReadReports']
const BRAKES = [
  { kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 160 },
  { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' },
  { kind: 'part', description: 'Front brake rotor', partNumber: '09.C394.13', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 2000, unitCostMinor: '6500' },
]
const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, '../fixtures/imports', name), 'utf8')
const day = (d: Date) => d.toISOString().slice(0, 10)

describe.skipIf(!hasTestDatabase)('Phase 9 reporting, accounting, imports, webhooks (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx, books: Ctx, noPerms: Ctx, viaMcp: Ctx
  let today = ''
  const key = (p: string) => uniqueKey(p)

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    setStripeGateway(null)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, b, n] = await Promise.all([make('owner'), make('books'), make('plain')])
    const all = permissionNames.filter(p => p !== 'canBreakGlass')
    owner = { session: sessionFor(o.id, all), prisma }
    books = { session: sessionFor(b.id, [...COUNTER, 'canManageIntegrations']), prisma }
    noPerms = { session: sessionFor(n.id, ['canAccessDashboard']), prisma }
    viaMcp = { session: sessionFor(b.id, [...COUNTER, 'canManageIntegrations'], { mcp: { clientId: 'c', scopes: ['mcp:read', 'mcp:write'] } }), prisma }
    await loadNorthgateSetup(null, { idempotencyKey: key('setup') }, owner)

    // Subscribe before the work so the outbox sees it.
    transport.fetch = async () => ({ status: 200, text: async () => 'ok' })
    await p9.addWebhookEndpoint(null, { input: { shopId: NGA, url: 'https://shop.example/hook', events: ['invoice.finalized', 'payment.succeeded', 'job.authorized', 'estimate.sent'] }, idempotencyKey: key('wh') }, books)

    const owned = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId: 'seed_cust_04', endedAt: null, vehicle: { make: 'Toyota' } }, include: { vehicle: true } })
    const ci = await checkInShopVehicle(null, { input: { shopId: NGA, customerId: 'seed_cust_04', vehicleId: owned.vehicleId!, concerns: ['Grinding from the front brakes'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: (owned.vehicle!.lastOdometer ?? 0) + 200 }, signature: SIGNATURE }, idempotencyKey: key('ci') }, books) as { id: string }
    const ro = await openShopRepairOrder(null, { input: { checkInId: ci.id }, idempotencyKey: key('ro') }, books) as { id: string }
    const job = await addRepairJob(null, { input: { repairOrderId: ro.id, title: 'Front brakes', lines: BRAKES }, idempotencyKey: key('j') }, books) as { id: string }
    const row = await prisma.repairOrder.findUniqueOrThrow({ where: { id: ro.id } })
    const ev = await sendRepairEstimate(null, { repairOrderId: ro.id, expectedVersion: row.version, idempotencyKey: key('e') }, books) as { id: string }
    await recordCustomerAuthorization(null, { input: { estimateVersionId: ev.id, method: 'oral_phone', actorName: 'Marcus Delgado', phoneNumber: '(916) 555-0104', answers: [{ jobId: job.id, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: key('a') }, books)
    const j1 = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    await transitionRepairJob(null, { jobId: job.id, to: 'in_progress', expectedVersion: j1.version, idempotencyKey: key('s') }, books)
    const j2 = await prisma.job.findUniqueOrThrow({ where: { id: job.id } })
    await transitionRepairJob(null, { jobId: job.id, to: 'completed', expectedVersion: j2.version, cause: 'Worn pads', correction: 'Replaced pads and rotors', idempotencyKey: key('c') }, books)
    const odo = ((await prisma.vehicle.findUniqueOrThrow({ where: { id: owned.vehicleId! } })).lastOdometer ?? 0) + 5
    const fin = await finalizeShopInvoice(null, { input: { repairOrderId: ro.id, expectedVersion: (await prisma.repairOrder.findUniqueOrThrow({ where: { id: ro.id } })).version, odometerOut: odo }, idempotencyKey: key('f') }, books) as { invoices: { id: string }[] }
    await takeShopPayment(null, { input: { purpose: 'invoice', invoiceIds: [fin.invoices[0].id], tender: 'cash', amountMinor: '20000', payerName: 'Marcus Delgado' }, idempotencyKey: key('p') }, books)
    today = day(new Date())
  }, 900_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('prints every report with its definition and the right numbers for the day', async () => {
    const r = await p9.shopReports(null, { shopId: NGA, from: today, to: today }, books) as any
    const invs = await prisma.invoice.findMany({ where: { shopId: NGA, status: { not: 'void' } } })
    expect(r.values.car_count.carCount).toBe(new Set(invs.map(i => i.repairOrderId)).size)
    expect(r.values.car_count.carCount).toBeGreaterThanOrEqual(1)
    const sum = (f: (i: (typeof invs)[number]) => bigint) => invs.reduce((n, i) => n + f(i), 0n)
    expect(r.values.aro.aroMinor).toBe(((sum(i => i.totalMinor) - sum(i => i.taxMinor)) / BigInt(r.values.car_count.carCount)).toString())
    expect(r.values.elr.laborSalesMinor).toBe(sum(i => i.laborSubtotalMinor).toString())
    expect(Object.keys(r.definitions)).toEqual(expect.arrayContaining(['car_count', 'aro', 'elr', 'gp_labor', 'gp_parts', 'tech_productivity', 'approval_rate', 'dvi_rate', 'comeback_rate', 'cycle_time']))
    expect(r.values.approval_rate.approvedJobs).toBeGreaterThanOrEqual(1)
    expect(r.values.gp_parts.hidden).toBe(true) // a bookkeeper-style role without cost permission never sees cost
    const full = await p9.shopReports(null, { shopId: NGA, from: today, to: today }, owner) as any
    expect(full.values.gp_parts.partsCostMinor).toBe('17800')
    await expect(p9.shopReports(null, { shopId: NGA, from: today, to: today }, noPerms)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await expect(p9.shopReports(null, { shopId: NGA, from: today, to: '2020-01-01' }, owner)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('a saved snapshot keeps its definitions and is the same row on a second save', async () => {
    const a = await p9.saveReportSnapshot(null, { shopId: NGA, from: today, to: today, idempotencyKey: key('k1') }, owner) as any
    const b = await p9.saveReportSnapshot(null, { shopId: NGA, from: today, to: today, idempotencyKey: key('k2') }, owner) as any
    expect(b.id).toBe(a.id)
    expect(b.existing).toBe(true)
    const snap = await prisma.kpiSnapshot.findUniqueOrThrow({ where: { id: a.id } })
    expect(Object.keys(snap.definitions as object)).toContain('aro')
  })

  it('SCHEMA §21 tie-outs pass on the seed data and the day just worked', async () => {
    for (const shop of SHOPS.map(s => s.id)) {
      const t = await p9.shopTieOuts(null, { shopId: shop }, owner) as any
      expect(t.checks.map((c: any) => c.key)).toEqual(['ar', 'deposits', 'stock', 'cores', 'flagged_hours', 'day_close', 'fees_payable', 'sales_tax'])
      for (const c of t.checks) expect(c.ok, `${shop} ${c.key}: ${c.differences.join('; ')}`).toBe(true)
    }
  })

  it('a tie-out names the record that differs when something is off', async () => {
    const inv = await prisma.invoice.findFirstOrThrow({ where: { shopId: NGA } })
    await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" DISABLE TRIGGER USER`)
    try {
      await prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "paidMinor" = "paidMinor" + 1, "balanceMinor" = "balanceMinor" - 1 WHERE id = '${inv.id}'`)
      const t = await p9.shopTieOuts(null, { shopId: NGA }, owner) as any
      const ar = t.checks.find((c: any) => c.key === 'ar')
      expect(ar.ok).toBe(false)
      expect(ar.differences[0]).toContain(inv.invoiceNumber)
    } finally {
      await prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "paidMinor" = "paidMinor" - 1, "balanceMinor" = "balanceMinor" + 1 WHERE id = '${inv.id}'`)
      await prisma.$executeRawUnsafe(`ALTER TABLE "Invoice" ENABLE TRIGGER USER`)
    }
  })

  let batchId = ''
  it('stages a balanced daily journal as NOT_POSTED, only after every line is mapped', async () => {
    const preview = await p9.accountingJournalPreview(null, { shopId: NGA, businessDate: today }, books) as any
    expect(preview.balanced).toBe(true)
    expect(preview.postingStatus).toBe('NOT_POSTED')
    expect(preview.unmapped.length).toBeGreaterThan(0)
    await expect(p9.stageAccountingBatch(null, { shopId: NGA, businessDate: today, idempotencyKey: key('st') }, books)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const keys: string[] = [...new Set<string>(preview.lines.map((l: any) => l.sourceKey))]
    await p9.saveAccountingMappings(null, { shopId: NGA, mappings: keys.map((k, i) => ({ sourceKey: k, accountCode: String(1000 + i * 10), accountName: k })), idempotencyKey: key('map') }, books)
    const staged = await p9.stageAccountingBatch(null, { shopId: NGA, businessDate: today, idempotencyKey: key('st') }, books) as any
    batchId = staged.id
    expect(staged.postingStatus).toBe('NOT_POSTED')
    const batch = await prisma.accountingBatch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.debitTotalMinor).toBe(batch.creditTotalMinor)
    expect(batch.debitTotalMinor > 0n).toBe(true)
    // Same content restages to the same batch.
    const again = await p9.stageAccountingBatch(null, { shopId: NGA, businessDate: today, idempotencyKey: key('st2') }, books) as any
    expect(again.id).toBe(batchId)
    expect(again.existing).toBe(true)
  })

  it('exports a file, stays NOT_POSTED, and becomes POSTED only when a person records the books accepting it', async () => {
    const exp = await p9.exportAccountingBatch(null, { batchId, idempotencyKey: key('ex') }, books) as any
    expect(exp.postingStatus).toBe('NOT_POSTED')
    const file = await p9.exportFile(null, { exportJobId: exp.exportJobId }, books) as any
    expect(file.content.split('\r\n')[0]).toBe('Date,Journal,Account,Account name,Description,Debit,Credit')
    await expect(p9.recordAccountingResponse(null, { input: { batchId, outcome: 'accepted' }, idempotencyKey: key('rp') }, books)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const done = await p9.recordAccountingResponse(null, { input: { batchId, outcome: 'accepted', providerRef: 'JE-1001' }, idempotencyKey: key('rp') }, books) as any
    expect(done.postingStatus).toBe('POSTED')
    // Posted days are never restaged with different figures, and responses are append-only.
    const response = await prisma.accountingProviderResponse.findFirstOrThrow({ where: { batchId } })
    await expect(prisma.$executeRawUnsafe(`UPDATE "AccountingProviderResponse" SET "message" = 'x' WHERE id = '${response.id}'`)).rejects.toThrow(/append-only/i)
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "AccountingProviderResponse" WHERE id = '${response.id}'`)).rejects.toThrow(/append-only/i)
    await expect(prisma.$executeRawUnsafe(`UPDATE "AccountingBatch" SET "debitTotalMinor" = 1 WHERE id = '${batchId}'`)).rejects.toThrow(/check|balanced/i)
  })

  it('an assistant connection cannot stage, export, import or add a webhook', async () => {
    await expect(p9.stageAccountingBatch(null, { shopId: NGA, businessDate: today, idempotencyKey: key('m') }, viaMcp)).rejects.toMatchObject({ code: expect.stringMatching(/AGENT_FORBIDDEN_ACTION|NOT_AUTHORIZED/) })
    await expect(p9.addWebhookEndpoint(null, { input: { url: 'https://x.example/h', events: ['*'] }, idempotencyKey: key('m') }, viaMcp)).rejects.toMatchObject({ code: expect.stringMatching(/AGENT_FORBIDDEN_ACTION|NOT_AUTHORIZED/) })
  })

  it('importing the Tekmetric fixture creates customers and vehicles once, and a second run changes nothing', async () => {
    const run = async (format: string, entity: string, file: string) => {
      const prev = await p9.previewDataImport(null, { input: { shopId: NGA, format, entity, fileName: file, text: fixture(file) }, idempotencyKey: key('pv') }, books) as any
      return prev
    }
    const prev = await run('tekmetric_csv', 'customers', 'tekmetric-customers.csv')
    expect(prev.preview.map((p: any) => [p.externalId, p.action])).toEqual([['TM-1001', 'create'], ['TM-1002', 'create'], ['TM-1003', 'create'], ['TM-1004', 'create'], ['TM-1005', 'error']])
    const before = await prisma.customer.count()
    const applied = await p9.applyDataImport(null, { jobId: prev.id, idempotencyKey: key('ap') }, books) as any
    expect(applied.result).toMatchObject({ created: 4, errors: 1 })
    expect(await prisma.customer.count()).toBe(before + 4)
    expect(await prisma.externalReference.count({ where: { system: 'tekmetric_import', entityType: 'Customer' } })).toBe(4)
    // No marketing consent is created by an import.
    const imported = (await prisma.externalReference.findMany({ where: { system: 'tekmetric_import', entityType: 'Customer' } })).map(r => r.entityId)
    expect(imported.length).toBe(4)
    expect(await prisma.contactConsent.count({ where: { contact: { customerId: { in: imported } }, purpose: 'marketing', action: 'granted' } })).toBe(0)

    const again = await run('tekmetric_csv', 'customers', 'tekmetric-customers.csv')
    expect(again.id).toBe(prev.id)
    const reapplied = await p9.applyDataImport(null, { jobId: prev.id, idempotencyKey: key('ap2') }, books) as any
    expect(reapplied.existing).toBe(true)
    expect(await prisma.customer.count()).toBe(before + 4)

    // A fresh job over an edited copy of the same file skips what is already in.
    const edited = fixture('tekmetric-customers.csv') + 'TM-1006,Sam,Okafor,,sam.okafor@example.com,(916) 555-0179,,\n'
    const job2 = await p9.previewDataImport(null, { input: { shopId: NGA, format: 'tekmetric_csv', entity: 'customers', fileName: 'v2.csv', text: edited }, idempotencyKey: key('pv') }, books) as any
    expect(job2.preview.filter((p: any) => p.action === 'skip').length).toBe(4)
    await p9.applyDataImport(null, { jobId: job2.id, idempotencyKey: key('ap3') }, books)
    expect(await prisma.customer.count()).toBe(before + 5)

    const cars = await run('tekmetric_csv', 'vehicles', 'tekmetric-vehicles.csv')
    const carsApplied = await p9.applyDataImport(null, { jobId: cars.id, idempotencyKey: key('ap4') }, books) as any
    expect(carsApplied.result.errors).toBe(0)
    const vehicleCount = await prisma.vehicle.count()
    const carsAgain = await run('tekmetric_csv', 'vehicles', 'tekmetric-vehicles.csv')
    await p9.applyDataImport(null, { jobId: carsAgain.id, idempotencyKey: key('ap5') }, books)
    expect(await prisma.vehicle.count()).toBe(vehicleCount)
    const owner1 = await prisma.externalReference.findFirstOrThrow({ where: { system: 'tekmetric_import', entityType: 'Customer', externalId: 'TM-1001' } })
    const civic = await prisma.vehicleOwnership.findFirst({ where: { customerId: owner1.entityId, endedAt: null, vehicle: { make: 'Honda' } } })
    expect(civic).not.toBeNull()
  })

  it('the webhook outbox holds what the day raised, signed and delivered once, and a failing receiver dead-letters after the budget', async () => {
    const queued = await prisma.webhookEvent.findMany({ orderBy: { createdAt: 'asc' } })
    expect(new Set(queued.map(e => e.eventType))).toEqual(new Set(['estimate.sent', 'job.authorized', 'invoice.finalized', 'payment.succeeded']))
    for (const e of queued) expect(JSON.stringify(e.payload)).not.toMatch(/Delgado|555|@/)
    const seen: { sig: string; body: string; topic: string }[] = []
    transport.fetch = async (_u, init) => { seen.push({ sig: init.headers['x-openfront-signature'], body: init.body, topic: init.headers['x-openfront-topic'] }); return { status: 200, text: async () => 'ok' } }
    const first = await deliverDue(prisma)
    expect(first.delivered).toBe(queued.length)
    expect(seen.every(s => /^sha256=[0-9a-f]{64}$/.test(s.sig))).toBe(true)
    expect((await deliverDue(prisma)).due).toBe(0)

    const endpoint = await prisma.webhookEndpoint.findFirstOrThrow()
    const ev = await prisma.webhookEvent.create({ data: { eventType: 'job.declined', resourceType: 'Job', resourceId: 'x', payload: { event: 'job.declined' }, endpointId: endpoint.id, nextAttempt: new Date(0) } })
    transport.fetch = async () => ({ status: 500, text: async () => 'boom' })
    let at = Date.now()
    for (let i = 0; i < 12; i += 1) { await deliverDue(prisma, { now: new Date(at) }); at += 30 * 3_600_000 }
    const dead = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })
    expect(dead.deadLetteredAt).not.toBeNull()
    expect(dead.deliveryAttempts).toBe(12)
    const replay = await p9.replayWebhookEvent(null, { eventId: ev.id, idempotencyKey: key('rpl') }, books) as any
    expect(replay.id).toBe(ev.id)
    transport.fetch = async () => ({ status: 204, text: async () => '' })
    await deliverDue(prisma, { now: new Date(at) })
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: ev.id } })).delivered).toBe(true)
  })

  it('refuses a plain http address and an event this system does not send', async () => {
    await expect(p9.addWebhookEndpoint(null, { input: { shopId: NGA, url: 'http://shop.example/h', events: ['job.declined'] }, idempotencyKey: key('b1') }, books)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(p9.addWebhookEndpoint(null, { input: { shopId: NGA, url: 'https://shop.example/h', events: ['customer.exported'] }, idempotencyKey: key('b2') }, books)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  it('integration connections: live needs a capability profile, observations are kept once and never changed', async () => {
    await expect(p9.saveIntegrationConnection(null, { input: { shopId: NGA, kind: 'accounting', providerKey: 'quickbooks', mode: 'live' }, idempotencyKey: key('i1') }, books)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await expect(p9.saveIntegrationConnection(null, { input: { shopId: NGA, kind: 'accounting', providerKey: 'twilio', mode: 'manual' }, idempotencyKey: key('i2') }, books)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const c = await p9.saveIntegrationConnection(null, { input: { shopId: NGA, kind: 'accounting', providerKey: 'manual', mode: 'manual' }, idempotencyKey: key('i3') }, books) as any
    expect(c.status).toBe('active')
    const o1 = await p9.recordProviderObservation(null, { input: { connectionId: c.id, kind: 'manual_entry', externalId: 'E-1', payload: { note: 'hello' } }, idempotencyKey: key('o1') }, books) as any
    const o2 = await p9.recordProviderObservation(null, { input: { connectionId: c.id, kind: 'manual_entry', externalId: 'E-2', payload: { note: 'hello' } }, idempotencyKey: key('o2') }, books) as any
    expect(o2.id).toBe(o1.id)
    await expect(prisma.$executeRawUnsafe(`UPDATE "ProviderObservation" SET "applyResult" = 'x' WHERE id = '${o1.id}'`)).rejects.toThrow(/append-only/i)
    const rev = await p9.revokeIntegrationConnection(null, { connectionId: c.id, reason: 'Switched books', idempotencyKey: key('i4') }, books) as any
    expect(rev.status).toBe('revoked')
    await expect(p9.recordIntegrationHealth(null, { connectionId: c.id, ok: true, idempotencyKey: key('i5') }, books)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
  })

  it('no secrets are readable from a connection or a webhook endpoint', async () => {
    const e = await prisma.webhookEndpoint.findFirstOrThrow()
    expect(e.secretRef).toMatch(/^webhook\./)
    const box = await prisma.secretBox.findUniqueOrThrow({ where: { key: e.secretRef } })
    expect(box.ciphertext).not.toMatch(/^[0-9a-f]{64}$/)
  })
})
