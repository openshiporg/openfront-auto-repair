import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { actorFromSession } from '../lib/actor'
import { command } from '../lib/command'
import { closePayPeriod } from '../lib/labor'
import { decideApprovalRequest } from './approvals'
import { checkInShopVehicle } from './phase1'
import { addRepairJob, openShopRepairOrder, recordCustomerAuthorization, sendRepairEstimate, transitionRepairJob } from './phase2'
import { finalizeShopInvoice } from './phase3'
import {
  adjustTechFlaggedHours, assignShopJobTechnicians, clockInShift, clockOutShift, closeShopPayPeriod, createShopPartWarrantyClaim, diagnoseShopComeback, endShiftBreak, exportShopPayPeriod, logJobWaiting,
  openShopComeback, requestComebackGoodwill, requestTimeCorrection, resolveShopComeback, saveTechCredential, startShiftBreak, startTechJobClock, stopTechJobClock,
} from './phase5'
import { loadNorthgateSetup } from './setup'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))
const sessionFor = (id: string, granted: string[]) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: ALL_SHOPS, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})
const NGA = 'seed_shop_nga'
const SIGNATURE = { method: 'in_person' as const, signerName: 'Marcus Delgado', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] }
const COUNTER = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canMessageCustomers', 'canReadCustomerPII', 'canManageCustomers', 'canFinalizeInvoices', 'canTakePayments', 'canReadFinancials']
const TECH = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canClockSelf']
const MANAGER = [...COUNTER, 'canManageTime', 'canApproveTime', 'canClosePayPeriod', 'canReadTechPay', 'canManageComebacks']
const OWNER_EXTRA = [...MANAGER, 'canApproveGoodwill']
const BRAKES = [{ kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 125 }]
const AC_JOB = [{ kind: 'labor', description: 'A/C system, evacuate and recharge', rateClassCode: 'general', soldCentiHours: 100 }]

describe.skipIf(!hasTestDatabase)('Phase 5 labor, flagged hours, pay periods and comebacks (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx, advisor: Ctx, manager: Ctx, goodwillOwner: Ctx, ramirez: Ctx, tran: Ctx, holloway: Ctx
  const key = (p: string) => uniqueKey(p)
  const profile = (userId: string) => prisma.technicianProfile.findFirstOrThrow({ where: { userId, shopId: NGA } })
  const sumFor = async (jobId: string) => (await prisma.flaggedHoursEntry.aggregate({ where: { jobId }, _sum: { centiHours: true } }))._sum.centiHours ?? 0

  async function newRepairOrder(customerId: string) {
    const owned = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId, endedAt: null }, include: { vehicle: true } })
    const checkIn = await checkInShopVehicle(null, { input: { shopId: NGA, customerId, vehicleId: owned.vehicleId!, concerns: ['Grinding from the front brakes'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: (owned.vehicle!.lastOdometer ?? 0) + 200 }, signature: SIGNATURE }, idempotencyKey: key('ci') }, advisor) as { id: string }
    return (await openShopRepairOrder(null, { input: { checkInId: checkIn.id }, idempotencyKey: key('ro') }, advisor) as { id: string }).id
  }
  async function authorizedJob(repairOrderId: string, lines: unknown[]) {
    const added = await addRepairJob(null, { input: { repairOrderId, title: 'Brake service', lines }, idempotencyKey: key('j') }, advisor) as { id: string }
    const row = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId } })
    const v = await sendRepairEstimate(null, { repairOrderId, expectedVersion: row.version, idempotencyKey: key('e') }, advisor) as { id: string }
    await recordCustomerAuthorization(null, { input: { estimateVersionId: v.id, method: 'oral_phone', actorName: 'Marcus Delgado', phoneNumber: '(916) 555-0104', answers: [{ jobId: added.id, decision: 'approve' }], replacedPartsElection: 'do_not_return' }, idempotencyKey: key('a') }, advisor)
    return added.id
  }
  const start = async (jobId: string, ctx: Ctx = advisor) => {
    const j = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
    return transitionRepairJob(null, { jobId, to: 'in_progress', expectedVersion: j.version, idempotencyKey: key('s') }, ctx)
  }
  const complete = async (jobId: string, ctx: Ctx = advisor) => {
    const j = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
    return transitionRepairJob(null, { jobId, to: 'completed', expectedVersion: j.version, cause: 'Pads worn to the backing plate', correction: 'Replaced pads and rotors, bled the brakes', idempotencyKey: key('c') }, ctx)
  }
  async function invoice(repairOrderId: string) {
    const r = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId }, include: { vehicle: true } })
    return finalizeShopInvoice(null, { input: { repairOrderId, expectedVersion: r.version, odometerOut: (r.vehicle!.lastOdometer ?? 0) + 5 }, idempotencyKey: key('f') }, advisor) as Promise<{ invoices: { id: string }[] }>
  }
  const decide = async (ctx: Ctx, approvalId: string) => {
    const req = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: approvalId } })
    return decideApprovalRequest(null, { requestId: approvalId, decision: 'approve', reason: 'Checked it', expectedVersion: req.version, idempotencyKey: key('d') }, ctx)
  }

  beforeAll(async () => {
    prisma = testPrisma(10)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a, m, g] = await Promise.all([make('owner'), make('advisor'), make('manager'), make('goodwill')])
    owner = { session: sessionFor(o.id, permissionNames.filter(x => x !== 'canBreakGlass')), prisma }
    advisor = { session: sessionFor(a.id, COUNTER), prisma }
    manager = { session: sessionFor(m.id, MANAGER), prisma }
    goodwillOwner = { session: sessionFor(g.id, OWNER_EXTRA), prisma }
    await loadNorthgateSetup(null, { idempotencyKey: key('setup') }, owner)
    ramirez = { session: sessionFor('seed_user_ramirez', TECH), prisma }
    tran = { session: sessionFor('seed_user_tran', TECH), prisma }
    holloway = { session: sessionFor('seed_user_holloway', TECH), prisma }
  }, 900_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('loads technicians with their pay plans and certificates, one expired', { timeout: 60_000 }, async () => {
    expect(await prisma.technicianProfile.count()).toBe(4)
    const jake = await profile('seed_user_holloway')
    expect(jake.payPlan).toBe('hourly')
    const cert = await prisma.technicianCredential.findFirstOrThrow({ where: { technicianId: jake.id, kind: 'epa_609' } })
    expect(cert.status).toBe('expired')
  })

  it('flagged hours add up to the hours sold, split by largest remainder, and a repeat adds nothing', { timeout: 300_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_07')
    const jobId = await authorizedJob(ro, BRAKES)
    await assignShopJobTechnicians(null, { jobId, shares: [{ userId: 'seed_user_ramirez' }, { userId: 'seed_user_tran' }, { userId: 'seed_user_holloway' }], idempotencyKey: key('as') }, manager)
    await start(jobId)
    await complete(jobId)
    const rows = await prisma.flaggedHoursEntry.findMany({ where: { jobId, kind: 'flag' }, orderBy: { centiHours: 'desc' } })
    expect(rows.map(r => r.centiHours)).toEqual([42, 42, 41])
    expect(await sumFor(jobId)).toBe(125)
    // Calling the flagger again (the same event) changes nothing.
    const { flagJob } = await import('../lib/flagging')
    await command(prisma, { name: 'test.reflag', actor: actorFromSession(manager.session as never), idempotencyKey: key('rf'), params: {} }, uow => flagJob(uow, actorFromSession(manager.session as never), jobId, 'job.completed'))
    expect(await sumFor(jobId)).toBe(125)
    // A flagged job's crew cannot be changed in place.
    await expect(assignShopJobTechnicians(null, { jobId, shares: [{ userId: 'seed_user_ramirez' }], idempotencyKey: key('as') }, manager)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
  })

  it('the database refuses an edit to the ledger and an entry in a closed period', { timeout: 120_000 }, async () => {
    const row = await prisma.flaggedHoursEntry.findFirstOrThrow()
    await expect(prisma.flaggedHoursEntry.update({ where: { id: row.id }, data: { centiHours: 999 } })).rejects.toThrow()
    await expect(prisma.flaggedHoursEntry.delete({ where: { id: row.id } })).rejects.toThrow()
    const past = await prisma.payPeriod.create({ data: { shopId: NGA, startsOn: new Date('2026-02-02T00:00:00Z'), endsOn: new Date('2026-02-15T00:00:00Z'), status: 'open' } })
    const job = await prisma.job.findFirstOrThrow({ where: { from_FlaggedHoursEntry_job: { some: { kind: 'flag' } } } })
    const tech = await profile('seed_user_tran')
    const entry = { shopId: NGA, technicianId: tech.id, jobId: job.id, centiHours: 10, kind: 'adjustment', sourceEvent: 'test:a', payPeriodId: past.id, flaggedAt: new Date() }
    await prisma.flaggedHoursEntry.create({ data: entry })
    await prisma.payPeriod.update({ where: { id: past.id }, data: { status: 'closed' } })
    await expect(prisma.flaggedHoursEntry.create({ data: { ...entry, sourceEvent: 'test:b' } })).rejects.toThrow(/closed/i)
    await expect(prisma.payPeriod.update({ where: { id: past.id }, data: { status: 'open' } })).rejects.toThrow(/reopened/i)
    await expect(prisma.flaggedHoursEntry.create({ data: { ...entry, sourceEvent: 'test:c', centiHours: -5, kind: 'flag' } })).rejects.toThrow()
  })

  it('an expired EPA 609 certificate blocks refrigerant work, and a renewed one allows it', { timeout: 300_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_08')
    const jobId = await authorizedJob(ro, AC_JOB)
    await expect(start(jobId, holloway)).rejects.toMatchObject({ code: 'CREDENTIAL_REQUIRED' })
    await expect(assignShopJobTechnicians(null, { jobId, shares: [{ userId: 'seed_user_holloway' }], idempotencyKey: key('as') }, manager)).rejects.toMatchObject({ code: 'CREDENTIAL_REQUIRED' })
    expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('authorized')
    await start(jobId, ramirez)
    // The clock refuses him too, even though the job is running.
    await clockInShift(null, { shopId: NGA, idempotencyKey: key('in') }, holloway)
    await expect(startTechJobClock(null, { jobId, idempotencyKey: key('jc') }, holloway)).rejects.toMatchObject({ code: 'CREDENTIAL_REQUIRED' })
    await clockOutShift(null, { shopId: NGA, idempotencyKey: key('out') }, holloway)
    // Renewed certificate: the same technician may work on it.
    const jake = await profile('seed_user_holloway')
    await saveTechCredential(null, { input: { technicianId: jake.id, kind: 'epa_609', identifier: 'ESCO 609-731560-R', issuedAt: '2026-11-02', expiresAt: '2031-11-02' }, idempotencyKey: key('cr') }, manager)
    await clockInShift(null, { shopId: NGA, idempotencyKey: key('in') }, holloway)
    const clock = await startTechJobClock(null, { jobId, idempotencyKey: key('jc') }, holloway) as { id: string }
    expect(clock.id).toBeTruthy()
    await stopTechJobClock(null, { jobClockId: clock.id, idempotencyKey: key('jx') }, holloway)
    await clockOutShift(null, { shopId: NGA, idempotencyKey: key('out') }, holloway)
  })

  it('a shift is one at a time, a break stops the job clock, and waiting time is not worked time', { timeout: 120_000 }, async () => {
    const tries = await Promise.allSettled(Array.from({ length: 4 }, () => clockInShift(null, { shopId: NGA, idempotencyKey: key('in') }, tran)))
    expect(tries.filter(t => t.status === 'fulfilled')).toHaveLength(1)
    const tech = await profile('seed_user_tran')
    expect(await prisma.shiftClock.count({ where: { technicianId: tech.id, status: { not: 'clocked_out' } } })).toBe(1)
    await expect(prisma.shiftClock.create({ data: { shopId: NGA, technicianId: tech.id, clockInAt: new Date(), status: 'clocked_in' } })).rejects.toThrow()
    const ro = await newRepairOrder('seed_cust_09')
    const jobId = await authorizedJob(ro, BRAKES)
    await start(jobId)
    const clock = await startTechJobClock(null, { jobId, idempotencyKey: key('jc') }, tran) as { id: string }
    await logJobWaiting(null, { jobClockId: clock.id, reason: 'parts', idempotencyKey: key('w') }, tran)
    await expect(logJobWaiting(null, { jobClockId: clock.id, reason: 'bay', idempotencyKey: key('w') }, tran)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await logJobWaiting(null, { jobClockId: clock.id, resume: true, idempotencyKey: key('w') }, tran)
    await startShiftBreak(null, { shopId: NGA, idempotencyKey: key('b') }, tran)
    expect((await prisma.jobClock.findUniqueOrThrow({ where: { id: clock.id } })).status).toBe('stopped')
    await expect(startTechJobClock(null, { jobId, idempotencyKey: key('jc') }, tran)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await endShiftBreak(null, { shopId: NGA, idempotencyKey: key('be') }, tran)
    // Only one clock may run unless the shop allows more.
    const second = await startTechJobClock(null, { jobId, idempotencyKey: key('jc') }, tran) as { id: string }
    await expect(startTechJobClock(null, { jobId, idempotencyKey: key('jc') }, tran)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const out = await clockOutShift(null, { shopId: NGA, idempotencyKey: key('out') }, tran) as { jobClocksStopped: number }
    expect(out.jobClocksStopped).toBe(1)
    expect((await prisma.jobClock.findUniqueOrThrow({ where: { id: second.id } })).status).toBe('stopped')
  })

  it('a time correction needs approval by another person and changes nothing until then', { timeout: 120_000 }, async () => {
    const tech = await profile('seed_user_tran')
    const shift = await prisma.shiftClock.findFirstOrThrow({ where: { technicianId: tech.id, status: 'clocked_out' } })
    const asked = await requestTimeCorrection(null, { input: { targetKind: 'shift', targetId: shift.id, after: { start: new Date(shift.clockInAt!.getTime() - 3_600_000).toISOString() }, reason: 'Forgot to clock in at the bench; started an hour earlier' }, idempotencyKey: key('cc') }, tran) as { approvalRequestId: string }
    const unchanged = await prisma.shiftClock.findUniqueOrThrow({ where: { id: shift.id } })
    expect(unchanged.clockInAt!.getTime()).toBe(shift.clockInAt!.getTime())
    await expect(requestTimeCorrection(null, { input: { targetKind: 'shift', targetId: shift.id, after: { start: new Date(shift.clockInAt!.getTime() - 7_200_000).toISOString() }, reason: 'A second request while one is waiting' }, idempotencyKey: key('cc') }, tran)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    // He cannot approve his own correction (and a technician does not hold the permission anyway).
    await expect(decideApprovalRequest(null, { requestId: asked.approvalRequestId, decision: 'approve', reason: 'Mine', expectedVersion: 0, idempotencyKey: key('d') }, tran)).rejects.toThrow()
    // A manager who asked for it cannot approve it either; a different manager can.
    const second = await prisma.user.create({ data: { name: 'second manager', email: `${uniqueKey('m2')}@test.local`, password: 'x'.repeat(60) } })
    await decide({ session: sessionFor(second.id, MANAGER), prisma }, asked.approvalRequestId)
    const fixed = await prisma.shiftClock.findUniqueOrThrow({ where: { id: shift.id } })
    expect(fixed.clockInAt!.getTime()).toBe(shift.clockInAt!.getTime() - 3_600_000)
    expect((await prisma.clockCorrection.findFirstOrThrow({ where: { targetId: shift.id } })).status).toBe('applied')
    // A manager asking for a correction cannot approve their own request.
    const mine = await requestTimeCorrection(null, { input: { targetKind: 'shift', targetId: shift.id, after: { end: new Date(shift.clockOutAt!.getTime() + 1_800_000).toISOString() }, reason: 'Stayed to finish the road test' }, idempotencyKey: key('cc') }, manager) as { approvalRequestId: string }
    await expect(decide(manager, mine.approvalRequestId)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
  })

  it('a comeback inside the warranty is free and takes back the hours; a late one needs the owner', { timeout: 600_000 }, async () => {
    const ro = await newRepairOrder('seed_cust_10')
    const jobId = await authorizedJob(ro, BRAKES)
    await assignShopJobTechnicians(null, { jobId, shares: [{ userId: 'seed_user_ramirez', sharePct: '0.6' }, { userId: 'seed_user_tran', sharePct: '0.4' }], idempotencyKey: key('as') }, manager)
    await start(jobId)
    // Not billed yet: it is not a comeback.
    await expect(openShopComeback(null, { originalJobId: jobId, concern: 'Grinding again', idempotencyKey: key('cb') }, manager)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    await complete(jobId)
    expect(await sumFor(jobId)).toBe(125)
    await invoice(ro)
    const opened = await openShopComeback(null, { originalJobId: jobId, concern: 'Grinding noise is back at the left front', idempotencyKey: key('cb') }, manager) as { id: string; coverageValid: boolean; noCharge: boolean; reference: string }
    expect(opened).toMatchObject({ coverageValid: true, noCharge: true })
    expect(opened.reference).toMatch(/^CB-NGA-/)
    await expect(openShopComeback(null, { originalJobId: jobId, concern: 'Again', idempotencyKey: key('cb') }, manager)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const d = await diagnoseShopComeback(null, { comebackId: opened.id, cause: 'workmanship', diagnosis: 'Caliper slide pins were not lubricated; the pad dragged', idempotencyKey: key('dg') }, manager) as { hoursReversed: number }
    expect(d.hoursReversed).toBe(125)
    expect(await sumFor(jobId)).toBe(0)
    const reversals = await prisma.flaggedHoursEntry.findMany({ where: { jobId, kind: 'reversal' } })
    expect(reversals.map(r => r.centiHours).sort((a, b) => a - b)).toEqual([-75, -50])
    await resolveShopComeback(null, { comebackId: opened.id, resolution: 'Cleaned and lubricated the slide pins, road-tested', idempotencyKey: key('rs') }, manager)
    expect((await prisma.comebackCase.findUniqueOrThrow({ where: { id: opened.id } })).status).toBe('resolved')

    // Past the warranty: charged unless the owner approves goodwill.
    const ro2 = await newRepairOrder('seed_cust_11')
    const job2 = await authorizedJob(ro2, BRAKES)
    await assignShopJobTechnicians(null, { jobId: job2, shares: [{ userId: 'seed_user_ramirez' }], idempotencyKey: key('as') }, manager)
    await start(job2)
    await complete(job2)
    await invoice(ro2)
    await prisma.warrantyCoverage.updateMany({ where: { jobId: job2 }, data: { endsOn: new Date('2026-01-01T00:00:00Z') } })
    const late = await openShopComeback(null, { originalJobId: job2, concern: 'Pedal feels soft again', idempotencyKey: key('cb') }, manager) as { id: string; noCharge: boolean; coverageValid: boolean }
    expect(late).toMatchObject({ coverageValid: false, noCharge: false })
    const asked = await requestComebackGoodwill(null, { comebackId: late.id, reason: 'Loyal customer, second visit for the same noise', idempotencyKey: key('gw') }, manager) as { approvalRequired: boolean; approvalRequestId: string }
    expect(asked.approvalRequired).toBe(true)
    await expect(requestComebackGoodwill(null, { comebackId: late.id, reason: 'Loyal customer, second visit for the same noise', approvalRequestId: asked.approvalRequestId, idempotencyKey: key('gw') }, manager)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' })
    await expect(decide(manager, asked.approvalRequestId)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await decide(goodwillOwner, asked.approvalRequestId)
    const applied = await requestComebackGoodwill(null, { comebackId: late.id, reason: 'Loyal customer, second visit for the same noise', approvalRequestId: asked.approvalRequestId, idempotencyKey: key('gw') }, manager) as { noCharge: boolean }
    expect(applied.noCharge).toBe(true)
    // A part that failed leads to a supplier claim.
    await diagnoseShopComeback(null, { comebackId: late.id, cause: 'part_failure', diagnosis: 'Brake hose swelled internally', idempotencyKey: key('dg') }, manager)
    const supplier = await prisma.supplier.findFirstOrThrow()
    const claim = await createShopPartWarrantyClaim(null, { comebackId: late.id, supplierId: supplier.id, laborReimbursementMinor: '9500', idempotencyKey: key('wc') }, manager) as { claimNumber: string }
    expect(claim.claimNumber).toMatch(/^WC-NGA-/)
  })

  it('a closed pay period is final: later hours land in the next open period, and it exports once', { timeout: 300_000 }, async () => {
    const ledger = await prisma.flaggedHoursEntry.findFirstOrThrow({ where: { shopId: NGA, kind: 'flag' }, include: { payPeriod: true } })
    const current = ledger.payPeriod!
    expect(current.status).toBe('open')
    // Not over yet (the period that holds today's work runs until its last day).
    await expect(closeShopPayPeriod(null, { payPeriodId: current.id, idempotencyKey: key('cp') }, manager)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const after = new Date(current.endsOn!.getTime() + 2 * 86_400_000)
    const actor = actorFromSession(manager.session as never)
    const asked = await command(prisma, { name: 'test.close', actor, idempotencyKey: key('cl'), params: {}, now: after }, uow => closePayPeriod(uow, actor, { payPeriodId: current.id })) as any
    expect(asked.value.approvalRequired).toBe(true)
    // Closing needs a second person.
    const reqRow = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.value.approvalRequestId } })
    await expect(decide(manager, reqRow.id)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    await decide(goodwillOwner, reqRow.id)
    const closed = await command(prisma, { name: 'test.close', actor, idempotencyKey: key('cl'), params: {}, now: after }, uow => closePayPeriod(uow, actor, { payPeriodId: current.id, approvalRequestId: reqRow.id })) as any
    expect(closed.value.status).toBe('closed')
    const frozen = await prisma.payPeriod.findUniqueOrThrow({ where: { id: current.id } })
    expect(frozen.status).toBe('closed')
    const totalBefore = (await prisma.flaggedHoursEntry.aggregate({ where: { payPeriodId: current.id }, _sum: { centiHours: true } }))._sum.centiHours
    // A late adjustment goes to the next open period, with the reference to the closed one.
    const job = await prisma.job.findFirstOrThrow({ where: { from_FlaggedHoursEntry_job: { some: { kind: 'flag' } } } })
    const tech = await profile('seed_user_ramirez')
    const adj = await adjustTechFlaggedHours(null, { technicianId: tech.id, jobId: job.id, centiHours: 25, reason: 'Added the rotor machining the bench missed', idempotencyKey: key('adj') }, manager) as { payPeriodId: string }
    const landed = await prisma.payPeriod.findUniqueOrThrow({ where: { id: adj.payPeriodId } })
    // The test clock is "now" for the adjustment, so it lands in whichever period is open then; never in the closed one.
    expect(landed.status).toBe('open')
    expect(landed.id).not.toBe(current.id)
    expect((await prisma.flaggedHoursEntry.aggregate({ where: { payPeriodId: current.id }, _sum: { centiHours: true } }))._sum.centiHours).toBe(totalBefore)
    // Export: once, with the technicians' hours and pay.
    const exp1 = await exportShopPayPeriod(null, { payPeriodId: current.id, idempotencyKey: key('ex') }, manager) as { csv: string }
    expect(exp1.csv.split('\n')[0]).toBe('Technician,Pay plan,Period start,Period end,Flagged hours,Hours on the clock,Rate,Gross pay')
    expect(exp1.csv).toMatch(/Luis Ramirez,flat rate/)
    const exp2 = await exportShopPayPeriod(null, { payPeriodId: current.id, idempotencyKey: key('ex') }, manager) as { csv: string; already?: boolean }
    expect(exp2.csv).toBe(exp1.csv)
    expect((await prisma.payPeriod.findUniqueOrThrow({ where: { id: current.id } })).status).toBe('exported')
  })

  it('flagged hours tie to completed jobs: sold hours plus reversals plus adjustments, and the audit chain holds', { timeout: 120_000 }, async () => {
    const jobs = await prisma.job.findMany({ where: { from_FlaggedHoursEntry_job: { some: { kind: 'flag' } } }, select: { id: true } })
    expect(jobs.length).toBeGreaterThanOrEqual(2)
    for (const j of jobs) {
      const lines = await prisma.jobLine.findMany({ where: { jobId: j.id, kind: 'labor' } })
      const sold = lines.reduce((n, l) => n + l.soldCentiHours, 0)
      const entries = await prisma.flaggedHoursEntry.findMany({ where: { jobId: j.id } })
      const flags = entries.filter(e => e.kind === 'flag').reduce((n, e) => n + e.centiHours, 0)
      const rest = entries.filter(e => e.kind !== 'flag').reduce((n, e) => n + e.centiHours, 0)
      expect(flags).toBe(sold)
      expect(await sumFor(j.id)).toBe(sold + rest)
    }
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })
})
