import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'graphql'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { mcpOperationProblem } from '../mcp-oauth/guard'
import { DOMAIN_TOOLS } from '../mcp/registry'
import { getAuthorization, postAuthorization } from '../public/handlers'
import { checkInShopVehicle } from './phase1'
import {
  addRepairJob, createCallbackTask, editRepairJobLines, publishCannedJobVersion, saveCannedJob, openShopRepairOrder, recordCustomerAuthorization, repriceRepairJob, requestCustomerAuthorization,
  saveJobLines, sendRepairEstimate, startShopInspection, transitionRepairJob,
} from './phase2'
import { loadNorthgateSetup } from './setup'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))
const sessionFor = (id: string, granted: string[], extra: Record<string, unknown> = {}) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: ALL_SHOPS, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
  ...extra,
})
const NGA = 'seed_shop_nga'
const SIGNATURE = { method: 'in_person' as const, signerName: 'Robert Okafor', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] }
const COUNTER = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canMessageCustomers', 'canReadCustomerPII', 'canManageCustomers', 'canManageSchedule', 'canClockSelf', 'canPerformInspections']

// The CA golden brake job (pricing.test.ts): 1.6 h general at 165.00, pads 48.00 cost, two rotors 65.00 cost.
const BRAKES = [
  { kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 160 },
  { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' },
  { kind: 'part', description: 'Front brake rotor', partNumber: '09.C394.13', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 2000, unitCostMinor: '6500' },
]

describe.skipIf(!hasTestDatabase)('Phase 2 core loop (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx
  let advisor: Ctx
  let viaMcp: Ctx
  let roId = ''
  let brakesId = ''

  const ro = () => prisma.repairOrder.findUniqueOrThrow({ where: { id: roId } })
  const job = (id = brakesId) => prisma.job.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } })

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a] = await Promise.all([make('owner'), make('advisor')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => p !== 'canBreakGlass')), prisma }
    advisor = { session: sessionFor(a.id, COUNTER), prisma }
    // The same advisor, but through an MCP token: a machine at the keyboard.
    viaMcp = { session: sessionFor(a.id, COUNTER, { mcp: { clientId: 'test-client', scopes: ['mcp:read', 'mcp:write'] } }), prisma }
    await loadNorthgateSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)

    // Robert Okafor's Camry: checked in and opened for this suite (Patricia's RO is the seeded golden one).
    const owned = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId: 'seed_cust_04', endedAt: null, vehicle: { make: 'Toyota' } }, include: { vehicle: true } })
    const checkIn = await checkInShopVehicle(null, {
      input: { shopId: NGA, customerId: 'seed_cust_04', vehicleId: owned.vehicleId!, concerns: ['Grinding from the front brakes'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: (owned.vehicle!.lastOdometer ?? 0) + 200 }, signature: SIGNATURE },
      idempotencyKey: uniqueKey('ci'),
    }, advisor) as { id: string }
    const opened = await openShopRepairOrder(null, { input: { checkInId: checkIn.id }, idempotencyKey: uniqueKey('ro') }, advisor) as { id: string }
    roId = opened.id
  }, 900_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('the seeded golden RO: brake job from the inspection, CA tax on parts only, no tire fee, authorized by phone', { timeout: 60_000 }, async () => {
    const golden = await prisma.repairOrder.findFirstOrThrow({ where: { customerId: 'seed_cust_05' }, include: { jobs: { include: { lines: true, authorizations: true } }, estimateVersions: true, inspections: true } })
    expect(golden.inspections[0].status).toBe('completed')
    const brakes = golden.jobs.find(j => j.title === 'Front brake pads and rotors')!
    expect(brakes.source).toBe('inspection_finding')
    expect(brakes.status).toBe('authorized')
    // The BMW variant was chosen (RWD, 1.3 h) and the rotor overlap deducted 0.3 h from the rotor line.
    const labor = brakes.lines.filter(l => l.kind === 'labor')
    expect(labor.map(l => l.soldCentiHours).sort()).toEqual([130, 50].sort())
    expect(labor.every(l => l.taxMinor === 0n)).toBe(true)
    expect(brakes.lines.filter(l => l.kind === 'part').every(l => l.taxMinor > 0n && l.condition === 'new')).toBe(true)
    expect(brakes.lines.some(l => l.feeCode === 'ca_tire_fee')).toBe(false)
    expect(brakes.authorizations[0].method).toBe('oral_phone')
    expect(golden.estimateVersions.map(e => e.status)).toEqual(['sent'])
    // The cabin-filter finding is offered, not authorized.
    expect(golden.jobs.find(j => j.title === 'Cabin air filter')?.status).toBe('offered')
  })

  it('GUIDE_AMBIGUOUS when two labor-time variants fit; the choice is kept on reprice', { timeout: 60_000 }, async () => {
    const golden = await prisma.repairOrder.findFirstOrThrow({ where: { customerId: 'seed_cust_05' } })
    await expect(addRepairJob(null, { input: { repairOrderId: golden.id, title: 'Pads again', lines: [{ kind: 'labor', operationCode: 'BRK-PAD-F' }] }, idempotencyKey: uniqueKey('j') }, advisor))
      .rejects.toMatchObject({ code: 'GUIDE_AMBIGUOUS', details: { candidates: expect.arrayContaining([expect.objectContaining({ variant: 'With wear sensor (xDrive)' })]) } })
  })

  it('CA golden loop: v1 → authorized → added line over the ceiling → needs_reauthorization → v2 → authorized', { timeout: 180_000 }, async () => {
    const added = await addRepairJob(null, { input: { repairOrderId: roId, title: 'Front brake pads and rotors', lines: BRAKES }, idempotencyKey: uniqueKey('j') }, advisor) as { id: string; status: string; totalMinor: string }
    brakesId = added.id
    expect(added.status).toBe('priced')
    // Golden numbers: labor 264.00 untaxed; pads 96.00 + rotors 227.50 taxed at 8.75%; no CA tire fee on a brake job.
    const priced = await job()
    expect(priced.laborMinor).toBe(26400n)
    expect(priced.partsMinor).toBe(32350n)
    expect(priced.feesMinor).toBe(0n)
    expect(priced.taxMinor).toBe(2831n)
    expect(priced.totalMinor).toBe(61581n)

    const v1 = await sendRepairEstimate(null, { repairOrderId: roId, expectedVersion: (await ro()).version, idempotencyKey: uniqueKey('e') }, advisor) as { id: string; reference: string }
    expect((await job()).status).toBe('offered')
    const rec = await recordCustomerAuthorization(null, { input: { estimateVersionId: v1.id, method: 'oral_phone', actorName: 'Robert Okafor', phoneNumber: '(916) 555-0104', answers: [{ jobId: brakesId, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: uniqueKey('a') }, advisor) as { approved: { amountMinor: string }[] }
    expect(rec.approved[0].amountMinor).toBe('61581')
    const authorized = await job()
    expect(authorized.status).toBe('authorized')
    expect(authorized.chargeCeilingMinor).toBe(61581n) // CA: zero tolerance, tax included

    // Work starts; then the tech finds the caliper slide pins seized: one more part pushes it over.
    await transitionRepairJob(null, { jobId: brakesId, to: 'in_progress', expectedVersion: authorized.version, idempotencyKey: uniqueKey('s') }, advisor)
    const started = await job()
    const more = [...BRAKES, { kind: 'part', description: 'Caliper guide pin kit', partNumber: 'H5130', brand: 'Carlson', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '900' }]
    await saveJobLines(null, { jobId: brakesId, expectedVersion: started.version, lines: more, idempotencyKey: uniqueKey('l') }, advisor)
    const over = await job()
    expect(over.status).toBe('needs_reauthorization')
    expect(over.totalMinor > over.chargeCeilingMinor!).toBe(true)
    expect(over.reauthorizationReason).toMatch(/ceiling|authorized/i)
    // Work cannot be completed or restarted while over the ceiling.
    await expect(transitionRepairJob(null, { jobId: brakesId, to: 'completed', expectedVersion: over.version, cause: 'x', correction: 'y', idempotencyKey: uniqueKey('c') }, advisor)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' })
    // The v1 answer can't be reused for the new content.
    await expect(recordCustomerAuthorization(null, { input: { estimateVersionId: v1.id, method: 'oral_phone', actorName: 'Robert Okafor', phoneNumber: '9165550104', answers: [{ jobId: brakesId, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: uniqueKey('a') }, advisor))
      .rejects.toMatchObject({ code: 'CONTENT_CHANGED' })

    const v2 = await sendRepairEstimate(null, { repairOrderId: roId, expectedVersion: (await ro()).version, idempotencyKey: uniqueKey('e') }, advisor) as { id: string; versionNumber: number }
    expect(v2.versionNumber).toBe(2)
    expect((await prisma.estimateVersion.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe('superseded')
    await expect(recordCustomerAuthorization(null, { input: { estimateVersionId: v1.id, method: 'oral_phone', actorName: 'Robert Okafor', phoneNumber: '9165550104', answers: [{ jobId: brakesId, decision: 'approve' }] }, idempotencyKey: uniqueKey('a') }, advisor))
      .rejects.toMatchObject({ code: 'ESTIMATE_SUPERSEDED' })
    await recordCustomerAuthorization(null, { input: { estimateVersionId: v2.id, method: 'oral_phone', actorName: 'Robert Okafor', phoneNumber: '9165550104', answers: [{ jobId: brakesId, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: uniqueKey('a') }, advisor)
    const again = await job()
    expect(again.status).toBe('in_progress') // work had started, so it resumes
    expect(again.chargeCeilingMinor).toBe(again.totalMinor)
    const auths = await prisma.authorization.findMany({ where: { jobId: brakesId }, orderBy: { createdAt: 'asc' } })
    expect(auths.map(a => a.status)).toEqual(['superseded', 'recorded'])

    // A reprice with no change keeps it authorized (same content hash).
    await repriceRepairJob(null, { jobId: brakesId, idempotencyKey: uniqueKey('r') }, advisor)
    expect((await job()).status).toBe('in_progress')
  })

  it('an assistant cannot record an authorization: GraphQL, MCP guard and registry, and raw SQL', { timeout: 60_000 }, async () => {
    const v = await prisma.estimateVersion.findFirstOrThrow({ where: { repairOrderId: roId, status: 'sent' } })
    const input = { estimateVersionId: v.id, method: 'oral_phone', actorName: 'Robert Okafor', phoneNumber: '9165550104', answers: [{ jobId: brakesId, decision: 'approve' }] }
    // GraphQL resolver, MCP-token session.
    await expect(recordCustomerAuthorization(null, { input: input as never, idempotencyKey: uniqueKey('a') }, viaMcp)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    // The MCP scope guard refuses the mutation even with write scope, and no MCP tool exists for it.
    const problem = mcpOperationProblem({ document: parse('mutation { recordCustomerAuthorization(input: {}, idempotencyKey: "abcdefgh") }'), scopes: ['mcp:read', 'mcp:write'] })
    expect(problem).toMatch(/cannot record customer authorizations/)
    expect(DOMAIN_TOOLS.some(t => /recordCustomerAuthorization|recordAuthorization/.test(t.document))).toBe(false)
    // Raw SQL with the agent actor kind: the trigger refuses the row.
    const before = await prisma.authorization.count()
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.actor_kind', 'agent', true)`
      await tx.authorization.create({ data: { jobId: brakesId, estimateVersionId: v.id, jobContentHash: 'a'.repeat(64), amountMinor: 1n, subtotalMinor: 1n, method: 'oral_phone', actorKind: 'customer', actorName: 'x', authorizedAt: new Date(), status: 'revoked' } })
    })).rejects.toThrow(/agents cannot write/)
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.actor_kind', 'agent', true)`
      await tx.jobDecision.create({ data: { jobId: brakesId, estimateVersionId: v.id, decision: 'declined', actorName: 'x', method: 'oral_phone', at: new Date() } })
    })).rejects.toThrow(/agents cannot write/)
    expect(await prisma.authorization.count()).toBe(before)

    // What an assistant can do: a callback task for a person.
    const task = await createCallbackTask(null, { repairOrderId: roId, kind: 'authorization_callback', title: 'Customer said yes on the phone line; call to confirm', idempotencyKey: uniqueKey('t') }, viaMcp) as { id: string }
    const row = await prisma.staffTask.findUniqueOrThrow({ where: { id: task.id } })
    expect(row.source).toBe('agent')
    expect(row.status).toBe('open')
    // The recorded authorization itself is immutable evidence.
    const recorded = await prisma.authorization.findFirstOrThrow({ where: { jobId: brakesId, status: 'recorded' } })
    await expect(prisma.authorization.update({ where: { id: recorded.id }, data: { amountMinor: 1n } })).rejects.toThrow(/cannot change/)
  })

  it('a missing part condition blocks the estimate (16 CCR §3356)', { timeout: 60_000 }, async () => {
    const added = await addRepairJob(null, { input: { repairOrderId: roId, title: 'Wiper blades', lines: [{ kind: 'labor', description: 'Wipers, replace', rateClassCode: 'general', soldCentiHours: 20 }, { kind: 'part', description: 'Wiper blade set', partNumber: 'W-1', partCategory: 'wipers', quantityMilli: 1000, unitCostMinor: '2400' }] }, idempotencyKey: uniqueKey('j') }, advisor) as { id: string; status: string; problems: string[] }
    expect(added.status).toBe('draft')
    expect(added.problems.join(' ')).toMatch(/part condition/)
    await expect(sendRepairEstimate(null, { repairOrderId: roId, expectedVersion: (await ro()).version, idempotencyKey: uniqueKey('e') }, advisor)).rejects.toMatchObject({ code: 'DISCLOSURE_MISSING' })
    await transitionRepairJob(null, { jobId: added.id, to: 'voided', expectedVersion: (await job(added.id)).version, reason: 'Customer will buy their own', idempotencyKey: uniqueKey('v') }, advisor)
  })

  it('the public answer endpoint is idempotent: a repeated POST replays the stored answer', { timeout: 120_000 }, async () => {
    const added = await addRepairJob(null, { input: { repairOrderId: roId, title: 'Wiper blades', lines: [{ kind: 'labor', description: 'Wipers, replace', rateClassCode: 'general', soldCentiHours: 20 }, { kind: 'part', description: 'Wiper blade set', partNumber: 'W-1', partCategory: 'wipers', condition: 'new', quantityMilli: 1000, unitCostMinor: '2400' }] }, idempotencyKey: uniqueKey('j') }, advisor) as { id: string }
    const v3 = await sendRepairEstimate(null, { repairOrderId: roId, expectedVersion: (await ro()).version, idempotencyKey: uniqueKey('e') }, advisor) as { id: string }
    // Robert has transactional SMS consent.
    const key = uniqueKey('req')
    const link = await requestCustomerAuthorization(null, { estimateVersionId: v3.id, channel: 'sms', idempotencyKey: key }, advisor) as { id: string; token: string; path: string }
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // A replayed request returns the same link; the database holds only the hash.
    const replayed = await requestCustomerAuthorization(null, { estimateVersionId: v3.id, channel: 'sms', idempotencyKey: key }, advisor) as { token: string; replay: boolean }
    expect(replayed.replay).toBe(true)
    expect(replayed.token).toBe(link.token)
    const stored = await prisma.authorizationRequest.findUniqueOrThrow({ where: { id: link.id } })
    expect(stored.tokenHash).not.toContain(link.token)
    expect(JSON.stringify(await prisma.commandReceipt.findMany({ where: { command: 'authorization.request' } }))).not.toContain(link.token)

    const request = (method: string, body?: unknown) => new Request(`https://shop.test${link.path}`, { method, headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', 'user-agent': 'vitest' }, body: body ? JSON.stringify(body) : undefined })
    const view = await getAuthorization(prisma, request('GET'), link.token)
    expect(view.status).toBe(200)
    const shown = await view.json()
    expect(shown.jobs.map((j: { id: string }) => j.id)).toContain(added.id)
    expect((await getAuthorization(prisma, request('GET'), 'x'.repeat(43))).status).toBe(404)

    const answer = { answers: [{ jobId: added.id, decision: 'approve' }], signerName: 'Robert Okafor', consent: true, replacedPartsElection: 'do_not_return' }
    const first = await postAuthorization(prisma, request('POST', answer), link.token)
    expect(first.status).toBe(201)
    const firstBody = await first.json()
    const second = await postAuthorization(prisma, request('POST', { ...answer, answers: [{ jobId: added.id, decision: 'decline' }] }), link.token)
    expect(second.status).toBe(200)
    const secondBody = await second.json()
    expect(secondBody.replay).toBe(true)
    expect(secondBody.approved).toEqual(firstBody.approved)
    expect(await prisma.authorization.count({ where: { jobId: added.id } })).toBe(1)
    expect((await job(added.id)).status).toBe('authorized')
    const auth = await prisma.authorization.findFirstOrThrow({ where: { jobId: added.id } })
    expect(auth.method).toBe('electronic_link')
    expect((auth.evidence as Record<string, unknown>).ip).toBe('203.0.113.9')
  })

  it('DVI: required items and red photos gate completion; findings become draft jobs', { timeout: 120_000 }, async () => {
    const started = await startShopInspection(null, { repairOrderId: roId, templateId: 'seed_tpl_mpi', idempotencyKey: uniqueKey('i') }, advisor) as { id: string; status: string }
    expect(started.status).toBe('in_progress')
    const inspection = await prisma.inspection.findUniqueOrThrow({ where: { id: started.id }, include: { results: true } })
    expect(inspection.results.length).toBeGreaterThan(10)
  })

  it('canned jobs: draft → publish → new draft → publish retires v1; published rows never change; a job copies the lines', { timeout: 120_000 }, async () => {
    const lines = [{ kind: 'labor', description: 'Rear pads, replace', rateClassCode: 'general', soldCentiHours: 120 }, { kind: 'part', description: 'Rear pad set', partNumber: 'P-R1', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4200' }]
    // Advisors don't manage the catalog.
    await expect(saveCannedJob(null, { input: { code: 'brakes-rear', name: 'Rear brake pads', lines }, idempotencyKey: uniqueKey('cj') }, advisor)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const made = await saveCannedJob(null, { input: { code: 'brakes-rear', name: 'Rear brake pads', category: 'brakes', lines }, idempotencyKey: uniqueKey('cj') }, owner) as { cannedJobId: string; versionId: string; versionNumber: number }
    expect(made.versionNumber).toBe(1)
    expect((await prisma.cannedJob.findUniqueOrThrow({ where: { id: made.cannedJobId } })).code).toBe('BRAKES-REAR')
    await expect(saveCannedJob(null, { input: { code: 'BRAKES-REAR', name: 'Again', lines }, idempotencyKey: uniqueKey('cj') }, owner)).rejects.toMatchObject({ code: 'DUPLICATE' })
    // Publishing is a person's call.
    const v1 = await prisma.cannedJobVersion.findUniqueOrThrow({ where: { id: made.versionId } })
    await expect(publishCannedJobVersion(null, { versionId: v1.id, expectedVersion: v1.version, idempotencyKey: uniqueKey('p') }, { ...owner, session: { ...(owner.session as object), mcp: { clientId: 'c', scopes: ['mcp:write'] } } })).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    await publishCannedJobVersion(null, { versionId: v1.id, expectedVersion: v1.version, idempotencyKey: uniqueKey('p') }, owner)
    await expect(prisma.cannedJobVersion.update({ where: { id: v1.id }, data: { lines: [] } })).rejects.toThrow(/published|cannot change/)
    // A job copies the published lines.
    const fromCanned = await addRepairJob(null, { input: { repairOrderId: roId, title: 'Rear brake pads', cannedJobId: made.cannedJobId }, idempotencyKey: uniqueKey('j') }, advisor) as { id: string; status: string }
    expect(fromCanned.status).toBe('priced')
    expect((await job(fromCanned.id)).lines.map(l => l.description)).toEqual(['Rear pads, replace', 'Rear pad set'])
    // v2: one more line; publishing retires v1. The job already on the RO keeps v1's lines.
    const v2 = await saveCannedJob(null, { input: { cannedJobId: made.cannedJobId, lines: [...lines, { kind: 'part', description: 'Brake hardware kit', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '800' }] }, idempotencyKey: uniqueKey('cj') }, owner) as { versionId: string; versionNumber: number }
    expect(v2.versionNumber).toBe(2)
    const draft = await prisma.cannedJobVersion.findUniqueOrThrow({ where: { id: v2.versionId } })
    await expect(publishCannedJobVersion(null, { versionId: draft.id, expectedVersion: draft.version + 7, idempotencyKey: uniqueKey('p') }, owner)).rejects.toMatchObject({ code: 'STALE_STATE' })
    await publishCannedJobVersion(null, { versionId: draft.id, expectedVersion: draft.version, idempotencyKey: uniqueKey('p') }, owner)
    expect((await prisma.cannedJobVersion.findUniqueOrThrow({ where: { id: v1.id } })).status).toBe('retired')
    expect((await prisma.cannedJob.findUniqueOrThrow({ where: { id: made.cannedJobId } })).currentVersionId).toBe(draft.id)
    expect((await job(fromCanned.id)).lines).toHaveLength(2)
    // Server-side line edit from the screen: append one, the job reprices; then remove it.
    const before = await job(fromCanned.id)
    await editRepairJobLines(null, { jobId: fromCanned.id, expectedVersion: before.version, add: { kind: 'part', description: 'Brake cleaner', partCategory: 'shop_supplies', condition: 'new', quantityMilli: 1000, unitCostMinor: '500' }, idempotencyKey: uniqueKey('l') }, advisor)
    const after = await job(fromCanned.id)
    expect(after.lines).toHaveLength(3)
    expect(after.totalMinor > before.totalMinor).toBe(true)
    await editRepairJobLines(null, { jobId: fromCanned.id, expectedVersion: after.version, removeLineId: after.lines.find(l => l.description === 'Brake cleaner')!.id, idempotencyKey: uniqueKey('l') }, advisor)
    expect((await job(fromCanned.id)).totalMinor).toBe(before.totalMinor)
    await transitionRepairJob(null, { jobId: fromCanned.id, to: 'voided', expectedVersion: (await job(fromCanned.id)).version, reason: 'test', idempotencyKey: uniqueKey('v') }, advisor)
  })

  it('the audit chain is intact after the loop', { timeout: 120_000 }, async () => {
    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
  })
})
