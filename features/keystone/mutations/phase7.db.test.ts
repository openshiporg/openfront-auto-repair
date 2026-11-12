import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, TEST_DATABASE_URL, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { systemActor } from '../lib/actor'
import { contactHash } from '../lib/customers'
import { recordInbound, stopKeyword } from '../lib/communications'
import { computeReminder, nextFollowUp } from '../lib/followUps'
import { runInTransaction } from '../lib/unitOfWork'
import { portalCustomer, portalOverview, portalRepairOrder, portalVehicle } from '../lib/portal'
import { checkInShopVehicle, linkVehicleOwner, recordContactConsent } from './phase1'
import { addRepairJob, openShopRepairOrder, recordCustomerAuthorization, sendRepairEstimate, transitionRepairJob } from './phase2'
import {
  readMessageThread, recordReviewRequest,
  closeRecommendation, copyMarketingMessage, exportMarketingCampaign, logCustomerCall, logCustomerMessage, markFollowUpContacted, markServiceReminderContacted, saveMarketingCampaign,
  campaignPreview, createCustomerPortalLink, followUpBoard,
} from './phase7'
import { loadNorthgateSetup } from './setup'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))
const sessionFor = (id: string, granted: string[]) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: ALL_SHOPS, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})
const NGA = 'seed_shop_nga'
const MARKETING = ['canAccessDashboard', 'canManageCampaigns', 'canMessageCustomers', 'canManageCustomers', 'canReadCustomerPII', 'canReadRepairOrders']

describe.skipIf(!hasTestDatabase)('Phase 7 recommendations, reminders, consent and portal (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx, staff: Ctx
  const key = (p: string) => uniqueKey(p)
  const sys = systemActor('test')
  const tx = <T>(work: Parameters<typeof runInTransaction<T>>[1]) => runInTransaction<T>(prisma as never, work, { actorKind: 'system' })

  async function newCustomer(first: string, last: string, phone: string, email: string) {
    const c = await prisma.customer.create({ data: { firstName: first, lastName: last, displayName: `${first} ${last}`, homeShopId: NGA } as never })
    const sms = await prisma.customerContact.create({ data: { customerId: c.id, kind: 'mobile', value: phone, valueHash: contactHash('mobile', phone), isPrimary: true, status: 'active' } as never })
    const mail = await prisma.customerContact.create({ data: { customerId: c.id, kind: 'email', value: email, valueHash: contactHash('email', email), isPrimary: true, status: 'active' } as never })
    return { id: c.id, sms: sms.id, mail: mail.id, phone }
  }
  const consent = (contactId: string, channel: string, purpose: string, action: string, writtenConsent = false) =>
    recordContactConsent(null, { input: { contactId, channel, purpose, action, method: action === 'revoked' ? 'staff_recorded' : 'in_person_form', writtenConsent }, idempotencyKey: key('c') } as never, staff)
  const campaign = async (kind = 'promo') => (await saveMarketingCampaign(null, { input: { shopId: NGA, name: 'Spring brake check', kind, messageText: 'Hi {name}, spring brake checks are half price this month at Northgate Auto.' }, idempotencyKey: key('camp') } as never, staff) as { id: string }).id


  const BRAKES = [
    { kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 125 },
    { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' },
  ]
  const OIL = [{ kind: 'labor', description: 'Oil and filter change', rateClassCode: 'general', soldCentiHours: 50 }]
  /** A real visit: check in, open the order, quote an oil change and a brake job, the customer approves the oil and declines the brakes, the oil is done. */
  async function visitWithDeclinedBrakes() {
    const vehicle = await prisma.vehicle.findFirstOrThrow({ where: { id: 'seed_veh_01_1' } })
    const ci = await checkInShopVehicle(null, { input: { shopId: NGA, customerId: 'seed_cust_01', vehicleId: vehicle.id, concerns: ['Oil change and a squeal when braking'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: (vehicle.lastOdometer ?? 0) + 300 }, signature: { method: 'in_person', signerName: 'Customer', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] } }, idempotencyKey: key('ci') }, owner) as { id: string }
    const repairOrderId = (await openShopRepairOrder(null, { input: { checkInId: ci.id, kind: 'standard' }, idempotencyKey: key('ro') }, owner) as { id: string }).id
    const oil = await addRepairJob(null, { input: { repairOrderId, title: 'Oil and filter change', lines: OIL }, idempotencyKey: key('j1') }, owner) as { id: string }
    const brakes = await addRepairJob(null, { input: { repairOrderId, title: 'Front brake pads and rotors', lines: BRAKES }, idempotencyKey: key('j2') }, owner) as { id: string }
    const row = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId } })
    const version = await sendRepairEstimate(null, { repairOrderId, expectedVersion: row.version, idempotencyKey: key('e') }, owner) as { id: string }
    await recordCustomerAuthorization(null, { input: { estimateVersionId: version.id, method: 'in_person_signature', actorName: 'Customer', replacedPartsElection: 'do_not_return', signature: { method: 'in_person', signerName: 'Customer', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] }, answers: [{ jobId: oil.id, decision: 'approve' }, { jobId: brakes.id, decision: 'decline', reason: 'Wants a second quote' }] }, idempotencyKey: key('a') }, owner)
    for (const to of ['in_progress', 'completed']) {
      const j = await prisma.job.findUniqueOrThrow({ where: { id: oil.id } })
      await transitionRepairJob(null, { jobId: oil.id, to, expectedVersion: j.version, cause: 'Due for service', correction: 'Changed oil and filter', idempotencyKey: key('t') } as never, owner)
    }
    return { repairOrderId, oilId: oil.id, brakesId: brakes.id, vehicleId: vehicle.id }
  }

  beforeAll(async () => {
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, s] = await Promise.all([make('owner'), make('marketing')])
    owner = { session: sessionFor(o.id, permissionNames.filter(x => x !== 'canBreakGlass')), prisma }
    staff = { session: sessionFor(s.id, MARKETING), prisma }
    // The remote scratch database can push one seed step past the 60 s transaction limit. Each step is its own
    // idempotent command under this one key, so trying again resumes where it stopped.
    const setupKey = key('setup')
    for (let attempt = 1; ; attempt += 1) {
      try { await loadNorthgateSetup(null, { idempotencyKey: setupKey }, owner); break } catch (error) { if (attempt >= 4) throw error }
    }
  }, 1_500_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('knows the STOP family and nothing else', () => {
    for (const w of ['STOP', ' stop ', 'Unsubscribe.', 'opt out', 'CANCEL', 'end', 'quit', 'revoke']) expect(stopKeyword(w)).toBeTruthy()
    for (const w of ['please stop by tomorrow', 'ok', 'stopping', '']) expect(stopKeyword(w)).toBeNull()
  })

  it('refuses marketing without written consent, at the API and in the database', { timeout: 120_000 }, async () => {
    const maria = await newCustomer('Maria', 'Delgado', '+19165550301', 'maria.delgado@example.com')
    const id = await campaign()
    // Transactional consent only: not on the list, and the copy button says why.
    await consent(maria.sms, 'sms', 'transactional', 'granted')
    await expect(copyMarketingMessage(null, { campaignId: id, customerId: maria.id, idempotencyKey: key('cp') }, staff)).rejects.toMatchObject({ code: 'CONSENT_BLOCKED' })
    await expect(logCustomerMessage(null, { input: { customerId: maria.id, direction: 'outbound', channel: 'sms', purpose: 'marketing', body: 'Spring special' }, idempotencyKey: key('m') }, staff)).rejects.toMatchObject({ code: 'CONSENT_BLOCKED' })
    // Straight to the database, around every rule in the app: refused by the trigger.
    const bad = await tx(async uow => uow.tx.campaignRecipient.create({ data: { campaignId: id, customerId: maria.id, contactId: maria.sms, channel: 'sms' } as never })).catch(e => e)
    expect(String(bad.message ?? bad)).toMatch(/consent/i)
    const badMsg = await prisma.message.create({ data: { shopId: NGA, customerId: maria.id, contactId: maria.sms, direction: 'outbound', channel: 'sms', purpose: 'marketing', source: 'staff_log', body: 'x' } as never }).catch(e => e)
    expect(String(badMsg.message ?? badMsg)).toMatch(/consent/i)
  })

  it('STOP between building the audience and exporting it keeps the contact off the file', { timeout: 120_000 }, async () => {
    const dana = await newCustomer('Dana', 'Whitfield', '+19165550302', 'dana.whitfield@example.com')
    const lee = await newCustomer('Lee', 'Okafor', '+19165550303', 'lee.okafor@example.com')
    for (const c of [dana, lee]) { await consent(c.sms, 'sms', 'marketing', 'granted', true); await consent(c.mail, 'email', 'marketing', 'granted', true) }
    const id = await campaign()
    const before = await campaignPreview(null, { campaignId: id }, staff) as any
    expect(before.included.map((x: any) => x.name)).toEqual(expect.arrayContaining(['Dana Whitfield', 'Lee Okafor']))
    // Dana replies STOP after the list was shown. Her text consent is revoked, and email is still allowed for her, so check both channels go.
    const inbound = await tx(uow => recordInbound(uow, sys, { fromHash: contactHash('mobile', dana.phone), body: 'STOP', providerMessageId: key('pm') })) as any
    expect(inbound.revoked).toBe(true)
    await consent(dana.mail, 'email', 'marketing', 'revoked')
    const out = await exportMarketingCampaign(null, { campaignId: id, idempotencyKey: key('x') }, staff) as any
    expect(out.csv).toContain('Lee Okafor')
    expect(out.csv).not.toContain('Dana Whitfield')
    expect(out.excluded.map((x: any) => x.name)).toContain('Dana Whitfield')
    // Revoking again does not stack: still the latest event that decides.
    const row = await prisma.campaignRecipient.findMany({ where: { exportId: out.exportId } })
    expect(row.every(r => r.customerId !== dana.id)).toBe(true)
    await expect(copyMarketingMessage(null, { campaignId: id, customerId: dana.id, idempotencyKey: key('cp') }, staff)).rejects.toMatchObject({ code: 'CONSENT_BLOCKED' })
    // A later written grant wins again.
    await consent(dana.sms, 'sms', 'marketing', 'granted', true)
    const text = await copyMarketingMessage(null, { campaignId: id, customerId: dana.id, idempotencyKey: key('cp') }, staff) as any
    expect(text.text).toContain('Hi Dana,')
  })

  it('records an inbound STOP once, with no reply, and sends other replies to review', { timeout: 120_000 }, async () => {
    const sam = await newCustomer('Sam', 'Brennan', '+19165550304', 'sam.brennan@example.com')
    await consent(sam.sms, 'sms', 'transactional', 'granted')
    const first = await tx(uow => recordInbound(uow, sys, { fromHash: contactHash('mobile', sam.phone), body: 'Stop', providerMessageId: 'SM-stop-1' })) as any
    const again = await tx(uow => recordInbound(uow, sys, { fromHash: contactHash('mobile', sam.phone), body: 'Stop', providerMessageId: 'SM-stop-1' })) as any
    expect(first.revoked).toBe(true)
    expect(again.replay).toBe(true)
    expect(await prisma.contactConsent.count({ where: { contactId: sam.sms, action: 'revoked' } })).toBe(1)
    expect(await prisma.message.count({ where: { customerId: sam.id, direction: 'outbound' } })).toBe(0)
    await tx(uow => recordInbound(uow, sys, { fromHash: contactHash('mobile', sam.phone), body: 'Can you move my appointment to Friday?', providerMessageId: 'SM-q-1' }))
    expect((await prisma.message.findFirstOrThrow({ where: { providerMessageId: 'SM-q-1' } })).reviewState).toBe('needs_review')
    // A message is a record: it cannot be rewritten or deleted.
    const m = await prisma.message.findFirstOrThrow({ where: { providerMessageId: 'SM-stop-1' } })
    await expect(prisma.message.update({ where: { id: m.id }, data: { body: 'changed' } })).rejects.toThrow(/record/)
    await expect(prisma.message.delete({ where: { id: m.id } })).rejects.toThrow(/record/)
  })

  it('logs a call and a text staff made, on one thread per repair order', { timeout: 120_000 }, async () => {
    const pat = await newCustomer('Pat', 'Nguyen', '+19165550305', 'pat.nguyen@example.com')
    await logCustomerCall(null, { input: { customerId: pat.id, shopId: NGA, direction: 'outbound', outcome: 'left_voicemail', note: 'Brakes are ready.' }, idempotencyKey: key('call') } as never, staff)
    await logCustomerMessage(null, { input: { customerId: pat.id, shopId: NGA, direction: 'outbound', channel: 'email', body: 'Your car is ready for pickup after 3.' }, idempotencyKey: key('msg') } as never, staff)
    const threads = await prisma.messageThread.findMany({ where: { customerId: pat.id } })
    expect(threads).toHaveLength(1)
    expect(await prisma.message.count({ where: { threadId: threads[0].id } })).toBe(1)
    expect(await prisma.callRecord.count({ where: { threadId: threads[0].id } })).toBe(1)
    const replay = await logCustomerMessage(null, { input: { customerId: pat.id, shopId: NGA, direction: 'outbound', channel: 'email', body: 'Your car is ready for pickup after 3.' }, idempotencyKey: 'same-key' } as never, staff) as any
    const replay2 = await logCustomerMessage(null, { input: { customerId: pat.id, shopId: NGA, direction: 'outbound', channel: 'email', body: 'Your car is ready for pickup after 3.' }, idempotencyKey: 'same-key' } as never, staff) as any
    expect(replay2.replay).toBe(true)
    expect(replay2.id).toBe(replay.id)
  })

  it('works out follow-up and reminder dates, and "Mark contacted" records once', { timeout: 600_000 }, async () => {
    // Pure date arithmetic first.
    const base = { declinedAt: '2026-03-01T17:00:00Z', deferUntil: null, lastContactedAt: null }
    expect(nextFollowUp({ ...base, contactedCount: 0 }, [3, 30, 90])).toEqual({ step: 1, of: 3, dueOn: '2026-03-04' })
    expect(nextFollowUp({ ...base, contactedCount: 1 }, [3, 30, 90])).toEqual({ step: 2, of: 3, dueOn: '2026-03-31' })
    expect(nextFollowUp({ ...base, contactedCount: 3 }, [3, 30, 90])).toBeNull()
    expect(nextFollowUp({ ...base, deferUntil: '2026-06-15T00:00:00Z', contactedCount: 0 }, [3, 30, 90])?.dueOn).toBe('2026-06-15')
    const calc = computeReminder({ servicedOn: '2026-01-10', serviceOdometer: 40_000, currentOdometer: 44_000, today: '2026-03-10', interval: { miles: 5000, months: 6 }, perDay: 50 })
    expect(calc).toMatchObject({ dueOn: '2026-07-10', dueAtOdometer: 45_000, projectedDueOn: '2026-03-30', dueDate: '2026-03-30', state: 'later' })
    // Ten days of driving left at 50 miles a day: due in a week and a half, so it shows as coming up.
    expect(computeReminder({ servicedOn: '2026-01-10', serviceOdometer: 40_000, currentOdometer: 44_500, today: '2026-03-10', interval: { miles: 5000, months: 6 }, perDay: 50 })).toMatchObject({ projectedDueOn: '2026-03-20', state: 'soon', daysLate: -10 })
    expect(computeReminder({ servicedOn: '2026-01-10', serviceOdometer: 40_000, currentOdometer: 46_000, today: '2026-03-10', interval: { miles: 5000, months: 6 }, perDay: 50 }).state).toBe('due')

    // A declined job becomes a recommendation through the real authorization path, and the board shows it when due.
    const visit = await visitWithDeclinedBrakes()
    const rec = await prisma.recommendation.findFirstOrThrow({ where: { sourceJobId: visit.brakesId } })
    expect(rec).toMatchObject({ status: 'open', decision: 'declined', repairOrderId: visit.repairOrderId, contactedCount: 0 })
    expect(rec.priceSnapshotMinor > 0n).toBe(true)
    // Not due the moment it is declined (the first follow-up is days away)...
    const early = await followUpBoard(null, { soonDays: 0 }, staff) as any
    expect(early.recommendations.find((r: any) => r.id === rec.id)).toBeUndefined()
    // ...and due on the right date: the shop's first cadence step after the decline day.
    const cadence = (await prisma.shopPolicyVersion.findFirst({ where: { shopId: NGA, status: 'published' }, orderBy: { effectiveFrom: 'desc' } }))?.followUpCadenceDays as number[] | null
    const firstStep = (cadence?.length ? cadence : [3, 30, 90])[0]
    const soon = await followUpBoard(null, { soonDays: 30 }, staff) as any
    const row = soon.recommendations.find((r: any) => r.id === rec.id)
    expect(row).toBeTruthy()
    expect(row.dueOn).toBe(new Date(rec.declinedAt!.getTime() + firstStep * 86_400_000).toISOString().slice(0, 10))
    // Reading twice changes nothing (computed on read, no writes).
    const again = await followUpBoard(null, { soonDays: 30 }, staff) as any
    expect(again.recommendations.find((r: any) => r.id === rec.id).dueOn).toBe(row.dueOn)
    expect(await prisma.recommendation.count({ where: { sourceJobId: visit.brakesId } })).toBe(1)

    const press = () => markFollowUpContacted(null, { recommendationId: rec.id, channel: 'call', expectedContactedCount: 0, idempotencyKey: key('mc') }, staff) as Promise<any>
    const a = await press(), b = await press()
    expect(a.changed).toBe(true)
    expect(b.changed).toBe(false)
    const after = await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } })
    expect(after.contactedCount).toBe(1)
    expect(await prisma.auditEvent.count({ where: { entityId: rec.id, eventType: 'recommendation.contacted' } })).toBe(1)
    // The next follow-up moves to the second cadence step.
    const next = (await followUpBoard(null, { soonDays: 400 }, staff) as any).recommendations.find((r: any) => r.id === rec.id)
    expect(next.step).toBe(2)

    // The completed oil change makes an oil reminder; marking it contacted is recorded once.
    const cycleKey = `${visit.vehicleId}:oil:${visit.oilId}`
    const x = await markServiceReminderContacted(null, { cycleKey, channel: 'text', idempotencyKey: key('r1') }, staff) as any
    const y = await markServiceReminderContacted(null, { cycleKey, channel: 'text', idempotencyKey: key('r2') }, staff) as any
    expect([x.changed, y.changed]).toEqual([true, false])
    expect(await prisma.serviceReminder.count({ where: { cycleKey } })).toBe(1)
    expect((await followUpBoard(null, { soonDays: 400 }, staff) as any).reminders.find((r: any) => r.cycleKey === cycleKey)).toBeUndefined()

    await closeRecommendation(null, { recommendationId: rec.id, reason: 'Customer sold the car', idempotencyKey: key('cl') }, staff)
    expect((await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } })).status).toBe('dismissed')
  })

  it('shows a portal user only history from their ownership period', { timeout: 180_000 }, async () => {
    const prev = await newCustomer('Rita', 'Alvarez', '+19165550306', 'rita.alvarez@example.com')
    const next = await newCustomer('Omar', 'Haddad', '+19165550307', 'omar.haddad@example.com')
    const vehicle = await prisma.vehicle.create({ data: { vin: '1HGCM82633A004352', year: 2016, make: 'Honda', model: 'Civic', status: 'active', vinValid: 'valid' } as never })
    const day = (s: string) => new Date(`${s}T00:00:00Z`)
    await prisma.vehicleOwnership.create({ data: { vehicleId: vehicle.id, customerId: prev.id, role: 'owner', startedAt: day('2024-01-01'), endedAt: day('2025-06-30') } })
    await prisma.vehicleOwnership.create({ data: { vehicleId: vehicle.id, customerId: next.id, role: 'owner', startedAt: day('2025-07-01') } })
    const mk = (n: string, at: string, customerId: string) => prisma.repairOrder.create({ data: { roNumber: n, shopId: NGA, customerId, vehicleId: vehicle.id, status: 'closed', openedAt: new Date(at) } as never })
    const early = await mk('RO-P7-0001', '2024-05-02T16:00:00Z', prev.id)
    const lastDay = await mk('RO-P7-0002', '2025-06-30T22:00:00Z', prev.id)
    const mine = await mk('RO-P7-0003', '2025-09-12T16:00:00Z', next.id)
    await prisma.odometerReading.create({ data: { vehicleId: vehicle.id, value: 52_000, unit: 'mi', source: 'ro_in', anomaly: 'none', at: new Date('2025-01-10T12:00:00Z'), accepted: true } as never })
    await prisma.odometerReading.create({ data: { vehicleId: vehicle.id, value: 61_000, unit: 'mi', source: 'ro_in', anomaly: 'none', at: new Date('2025-09-12T12:00:00Z'), accepted: true } as never })

    const link = await createCustomerPortalLink(null, { customerId: next.id, idempotencyKey: key('pl') }, staff) as any
    const token = String(link.apiPath).split('/').pop()!
    expect(link.apiPath).toMatch(/^\/api\/public\/portal\/[A-Za-z0-9_-]{43}$/)
    const view = await tx(async uow => {
      const customer = await portalCustomer(uow.tx, token, uow.now, true)
      return { overview: await portalOverview(uow.tx, customer.id), one: await portalRepairOrder(uow.tx, customer.id, mine.id), veh: await portalVehicle(uow.tx, customer.id, vehicle.id), blocked: await Promise.all([early.id, lastDay.id].map(id => portalRepairOrder(uow.tx, customer.id, id).then(() => 'leaked', () => 'hidden'))) }
    }) as any
    expect(view.overview.repairOrders.map((r: any) => r.number)).toEqual(['RO-P7-0003'])
    expect(view.overview.count).toBe(1)
    expect(view.one.number).toBe('RO-P7-0003')
    expect(view.blocked).toEqual(['hidden', 'hidden'])
    expect(view.veh.count).toBe(1)
    expect(view.veh.odometer.map((o: any) => o.value)).toEqual([61_000])

    // The previous owner sees only theirs, and the last day of ownership is theirs.
    const prevView = await tx(async uow => ({ overview: await portalOverview(uow.tx, prev.id) })) as any
    expect(prevView.overview.repairOrders.map((r: any) => r.number).sort()).toEqual(['RO-P7-0001', 'RO-P7-0002'])
    expect(prevView.overview.count).toBe(2)
    // A customer who never owned the car cannot ask for it.
    const other = await newCustomer('Ines', 'Moreau', '+19165550308', 'ines.moreau@example.com')
    await expect(tx(uow => portalVehicle(uow.tx, other.id, vehicle.id))).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(tx(uow => portalRepairOrder(uow.tx, other.id, mine.id))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('a same-day sale never shows the new owner the previous owner\'s visit', { timeout: 180_000 }, async () => {
    const daniel = await newCustomer('Daniel', 'Okonkwo', '+19165550311', 'daniel.okonkwo@example.com')
    const hannah = await newCustomer('Hannah', 'Brooks', '+19165550312', 'hannah.brooks@example.com')
    const theo = await newCustomer('Theo', 'Marsh', '+19165550313', 'theo.marsh@example.com')
    const vehicle = await prisma.vehicle.create({ data: { vin: '1HGCV1F34LA012345', year: 2020, make: 'Honda', model: 'Accord', status: 'active', vinValid: 'valid' } as never })
    const sell = (customerId: string) => linkVehicleOwner(null, { vehicleId: vehicle.id, customerId, idempotencyKey: key('own') }, staff)
    const visit = async (n: string, customerId: string, odometer: number) => {
      const ro = await prisma.repairOrder.create({ data: { roNumber: n, shopId: NGA, customerId, vehicleId: vehicle.id, status: 'closed', openedAt: new Date() } as never })
      await prisma.odometerReading.create({ data: { vehicleId: vehicle.id, value: odometer, unit: 'mi', source: 'ro_in', anomaly: 'none', at: new Date(), accepted: true } as never })
      return ro
    }
    const view = (customerId: string) => tx(async uow => {
      const overview = await portalOverview(uow.tx, customerId)
      const veh = await portalVehicle(uow.tx, customerId, vehicle.id).catch(() => null)
      return { ros: overview.repairOrders.map((r: any) => r.number).sort(), count: overview.count, vehRos: veh ? veh.repairOrders.map((r: any) => r.number).sort() : null, odometer: veh ? veh.odometer.map((o: any) => o.value) : null }
    }) as Promise<any>
    const one = (customerId: string, id: string) => tx(uow => portalRepairOrder(uow.tx, customerId, id)).then(() => 'shown', () => 'hidden')

    // Daniel owns the car and brings it in; later that day he sells it to Hannah.
    await sell(daniel.id)
    const danielRo = await visit('RO-P7-0101', daniel.id, 48_210)
    await sell(hannah.id)
    const rows = await prisma.vehicleOwnership.findMany({ where: { vehicleId: vehicle.id }, orderBy: { createdAt: 'asc' } })
    expect(rows.map(r => r.startedAt?.toISOString().slice(0, 10))).toEqual([rows[0].startedAt?.toISOString().slice(0, 10), rows[0].startedAt?.toISOString().slice(0, 10)])
    expect(rows[0].endedAt?.toISOString().slice(0, 10)).toBe(rows[1].startedAt?.toISOString().slice(0, 10))

    const h1 = await view(hannah.id)
    expect(h1).toEqual({ ros: [], count: 0, vehRos: [], odometer: [] })
    expect(await one(hannah.id, danielRo.id)).toBe('hidden')

    // Hannah's own visit the same day shows for her, and not for Daniel.
    const hannahRo = await visit('RO-P7-0102', hannah.id, 48_260)
    expect(await view(hannah.id)).toEqual({ ros: ['RO-P7-0102'], count: 1, vehRos: ['RO-P7-0102'], odometer: [48_260] })

    // Back to back: Hannah sells to Theo the same day. Theo sees neither earlier visit.
    await sell(theo.id)
    expect(await view(theo.id)).toEqual({ ros: [], count: 0, vehRos: [], odometer: [] })
    expect(await one(theo.id, danielRo.id)).toBe('hidden')
    expect(await one(theo.id, hannahRo.id)).toBe('hidden')
    const theoRo = await visit('RO-P7-0103', theo.id, 48_300)
    expect((await view(theo.id)).ros).toEqual(['RO-P7-0103'])

    // The old owners still see their own visit after the sale, and nothing after it.
    const d = await view(daniel.id)
    expect(d.ros).toEqual(['RO-P7-0101'])
    expect(d.count).toBe(1)
    expect(d.odometer).toEqual([48_210])
    expect(await one(daniel.id, danielRo.id)).toBe('shown')
    expect(await one(daniel.id, hannahRo.id)).toBe('hidden')
    expect(await one(daniel.id, theoRo.id)).toBe('hidden')
    const h2 = await view(hannah.id)
    expect(h2.ros).toEqual(['RO-P7-0102'])
    expect(h2.odometer).toEqual([48_260])
    expect(await one(hannah.id, theoRo.id)).toBe('hidden')
  })

  it('refuses every P7 write on another shop\'s records for staff of one shop', { timeout: 300_000 }, async () => {
    const NGT = 'seed_shop_ngt'
    const u = await prisma.user.create({ data: { name: 'nga-only', email: `${uniqueKey('ngaonly')}@test.local`, password: 'x'.repeat(60) } })
    const ngaOnly: Ctx = { prisma, session: { ...sessionFor(u.id, MARKETING), data: { ...sessionFor(u.id, MARKETING).data, memberships: [{ status: 'active', shop: { id: NGA } }] } } }
    const sandra = await prisma.customer.create({ data: { firstName: 'Sandra', lastName: 'Kaur', displayName: 'Sandra Kaur', homeShopId: NGT } as never })
    const sms = await prisma.customerContact.create({ data: { customerId: sandra.id, kind: 'mobile', value: '+19165550321', valueHash: contactHash('mobile', '+19165550321'), isPrimary: true, status: 'active' } as never })
    const vehicle = await prisma.vehicle.create({ data: { vin: '5YJ3E1EA7KF317000', year: 2019, make: 'Toyota', model: 'Camry', status: 'active', vinValid: 'valid' } as never })
    const ro = await prisma.repairOrder.create({ data: { roNumber: 'RO-NGT-P7-0001', shopId: NGT, customerId: sandra.id, vehicleId: vehicle.id, status: 'closed', openedAt: new Date() } as never })
    const job = await prisma.job.create({ data: { repairOrderId: ro.id, number: 1, title: 'Oil and filter change', status: 'completed' } as never })
    const rec = await prisma.recommendation.create({ data: { shopId: NGT, customerId: sandra.id, vehicleId: vehicle.id, repairOrderId: ro.id, title: 'Rear brakes', urgency: 'soon', decision: 'declined', status: 'open', declinedAt: new Date() } as never })
    const camp = (await saveMarketingCampaign(null, { input: { shopId: NGT, name: 'Tire rotation', kind: 'promo', messageText: 'Hi {name}, tire rotations are $20 this week at Northgate Tire.' }, idempotencyKey: key('camp') } as never, owner) as { id: string }).id
    await logCustomerMessage(null, { input: { customerId: sandra.id, shopId: NGT, direction: 'outbound', channel: 'sms', body: 'Your car is ready.' }, idempotencyKey: key('m0') } as never, owner)
    const thread = await prisma.messageThread.findFirstOrThrow({ where: { customerId: sandra.id, shopId: NGT } })
    const before = { msgs: await prisma.message.count({ where: { customerId: sandra.id } }), calls: await prisma.callRecord.count({ where: { customerId: sandra.id } }), reviews: await prisma.reviewRequest.count({ where: { repairOrderId: ro.id } }), tokens: await prisma.publicAccessToken.count({ where: { subjectId: sandra.id } }), exports: await prisma.campaignExport.count({ where: { campaignId: camp } }) }

    const refused = { code: 'NOT_AUTHORIZED' }
    const tries: [string, () => Promise<unknown>][] = [
      ['text on her thread, shop from her home shop', () => logCustomerMessage(null, { input: { customerId: sandra.id, direction: 'outbound', channel: 'sms', body: 'Hi Sandra' }, idempotencyKey: key('x') } as never, ngaOnly)],
      ['text on her thread, NGT named', () => logCustomerMessage(null, { input: { customerId: sandra.id, shopId: NGT, direction: 'outbound', channel: 'sms', body: 'Hi Sandra' }, idempotencyKey: key('x') } as never, ngaOnly)],
      ['text on her NGT repair order, NGA named', () => logCustomerMessage(null, { input: { customerId: sandra.id, shopId: NGA, repairOrderId: ro.id, direction: 'outbound', channel: 'sms', body: 'Hi Sandra' }, idempotencyKey: key('x') } as never, ngaOnly)],
      ['call', () => logCustomerCall(null, { input: { customerId: sandra.id, shopId: NGT, direction: 'outbound', outcome: 'reached' }, idempotencyKey: key('x') } as never, ngaOnly)],
      ['mark thread read', () => readMessageThread(null, { threadId: thread.id, idempotencyKey: key('x') }, ngaOnly)],
      ['review request', () => recordReviewRequest(null, { repairOrderId: ro.id, channel: 'text', idempotencyKey: key('x') }, ngaOnly)],
      ['portal link', () => createCustomerPortalLink(null, { customerId: sandra.id, idempotencyKey: key('x') }, ngaOnly)],
      ['follow-up contacted', () => markFollowUpContacted(null, { recommendationId: rec.id, channel: 'call', expectedContactedCount: 0, idempotencyKey: key('x') }, ngaOnly)],
      ['close recommendation', () => closeRecommendation(null, { recommendationId: rec.id, reason: 'Sold', idempotencyKey: key('x') }, ngaOnly)],
      ['reminder contacted', () => markServiceReminderContacted(null, { cycleKey: `${vehicle.id}:oil:${job.id}`, channel: 'text', idempotencyKey: key('x') }, ngaOnly)],
      ['new campaign at NGT', () => saveMarketingCampaign(null, { input: { shopId: NGT, name: 'x', kind: 'promo', messageText: 'x' }, idempotencyKey: key('x') } as never, ngaOnly)],
      ['edit NGT campaign', () => saveMarketingCampaign(null, { input: { campaignId: camp, shopId: NGA, name: 'x', kind: 'promo', messageText: 'x' }, idempotencyKey: key('x') } as never, ngaOnly)],
      ['export NGT campaign', () => exportMarketingCampaign(null, { campaignId: camp, idempotencyKey: key('x') }, ngaOnly)],
      ['copy NGT campaign', () => copyMarketingMessage(null, { campaignId: camp, customerId: sandra.id, idempotencyKey: key('x') }, ngaOnly)],
    ]
    const results: Record<string, string> = {}
    for (const [name, attempt] of tries) results[name] = await attempt().then(() => 'allowed', (e: any) => e?.code ?? String(e))
    expect(results).toEqual(Object.fromEntries(tries.map(([n]) => [n, refused.code])))
    // Nothing was written.
    expect({ msgs: await prisma.message.count({ where: { customerId: sandra.id } }), calls: await prisma.callRecord.count({ where: { customerId: sandra.id } }), reviews: await prisma.reviewRequest.count({ where: { repairOrderId: ro.id } }), tokens: await prisma.publicAccessToken.count({ where: { subjectId: sandra.id } }), exports: await prisma.campaignExport.count({ where: { campaignId: camp } }) }).toEqual(before)
    expect((await prisma.recommendation.findUniqueOrThrow({ where: { id: rec.id } })).contactedCount).toBe(0)
    // The same person can still do it at their own shop.
    await expect(logCustomerMessage(null, { input: { customerId: sandra.id, shopId: NGA, direction: 'outbound', channel: 'sms', body: 'Hi Sandra, this is Northgate Auto Care.' }, idempotencyKey: key('ok') } as never, ngaOnly)).resolves.toMatchObject({ threadId: expect.any(String) })
    void sms
  })

  it('lists campaign exports and recipients to staff of the campaign\'s shop only', { timeout: 300_000 }, async () => {
    const { getContext } = await import('@keystone-6/core/context')
    const PrismaModule = await import('@prisma/client')
    process.env.DATABASE_URL = TEST_DATABASE_URL
    process.env.SESSION_SECRET ||= 'phase7-test-session-secret-0123456789abcdef'
    const ctx: any = getContext((await import('../index')).default, PrismaModule)
    const zoe = await newCustomer('Zoe', 'Park', '+19165550331', 'zoe.park@example.com')
    await consent(zoe.mail, 'email', 'marketing', 'granted', true)
    const ngaCamp = await campaign()
    const ngaExport = (await exportMarketingCampaign(null, { campaignId: ngaCamp, idempotencyKey: key('x') }, staff) as any).exportId as string
    const ngtCamp = (await saveMarketingCampaign(null, { input: { shopId: 'seed_shop_ngt', name: 'Tire check', kind: 'promo', messageText: 'Hi {name}, free tire checks at Northgate Tire.' }, idempotencyKey: key('camp') } as never, owner) as { id: string }).id
    const ngtExport = await prisma.campaignExport.create({ data: { campaignId: ngtCamp, recipientCount: 0, excludedCount: 0, excluded: [], at: new Date() } as never })
    const ngaOnly = (perms: string[]) => { const s = sessionFor('nga-reader', perms); return { ...s, listKey: 'User', data: { ...s.data, memberships: [{ status: 'active', shop: { id: NGA } }] } } }
    for (const perms of [MARKETING, ['canAccessDashboard', 'canMessageCustomers', 'canReadRepairOrders']]) {
      const r = await ctx.withSession(ngaOnly(perms)).graphql.raw({ query: `query($a:ID!,$b:ID!){ mine: campaignExport(where:{id:$a}){ id recipientCount } other: campaignExport(where:{id:$b}){ id } exports: campaignExports(where:{id:{in:[$a,$b]}}){ id } n: campaignExportsCount(where:{id:{in:[$a,$b]}}) recipients: campaignRecipients(where:{export:{id:{in:[$a,$b]}}}){ id customer { id } } }`, variables: { a: ngaExport, b: ngtExport.id } })
      expect(r.errors).toBeUndefined()
      expect(r.data.mine).toMatchObject({ id: ngaExport })
      expect(r.data.other).toBeNull()
      expect(r.data.exports.map((e: any) => e.id)).toEqual([ngaExport])
      expect(r.data.n).toBe(1)
      expect(r.data.recipients.length).toBeGreaterThan(0)
    }
  })
})
