import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { RECORDED_VINS, recordedAdapter } from '../../integrations/vehicle-data/testdata'
import { permissionNames } from '../access'
import { systemActor } from '../lib/actor'
import { verifyAuditChain } from '../lib/audit'
import { zonedInstant, nextBusinessDay, fromRows } from '../lib/calendar'
import { command } from '../lib/command'
import { expireStaleHolds, markNoShow } from '../lib/scheduling'
import { decideApprovalRequest } from './approvals'
import {
  bookShopAppointment, checkAuthorizedCeiling, checkInShopVehicle, createPolicyDraft, holdAppointmentSlot, publishPolicyVersion,
  recordContactConsent, recordOdometerReading, saveCustomer, saveVehicle, transitionAppointment,
} from './phase1'
import { loadNorthgateSetup } from './setup'
import { CUSTOMERS, FLEETS } from '../seed/customers'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))

/** A Keystone-like session: role flags plus shop memberships. */
const sessionFor = (id: string, granted: string[], shops = ALL_SHOPS) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: shops, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})

const NGA = 'seed_shop_nga'
const NGT = 'seed_shop_ngt'
const SIGNATURE = { method: 'in_person' as const, signerName: 'Test Customer', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] }

describe.skipIf(!hasTestDatabase)('Phase 1 commands (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx
  let manager: Ctx
  let advisor: Ctx
  let ngtOnly: Ctx

  /** The next NGA business day at 09:00 local, at least two days out (clear of lead time and today's seeded bookings). */
  let day: string
  const at = (hhmm: string, date = day) => zonedInstant('America/Los_Angeles', date, hhmm)

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    // The roles' real holders: the seed's staff hold canPublishPolicies (owner, manager), so solo publish never applies to them.
    // These test users stand in for them; the only other holders are made inactive below where a test needs solo publish.
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, m, a, t] = await Promise.all([make('owner'), make('manager'), make('advisor'), make('ngt')])
    const everything = permissionNames.filter(p => p !== 'canBreakGlass')
    owner = { session: sessionFor(o.id, everything), prisma }
    manager = { session: sessionFor(m.id, ['canAccessDashboard', 'canManagePolicies', 'canPublishPolicies', 'canManageSchedule', 'canManageCustomers', 'canWriteRepairOrders', 'canReadRepairOrders']), prisma }
    advisor = { session: sessionFor(a.id, ['canAccessDashboard', 'canManageCustomers', 'canReadCustomerPII', 'canManageSchedule', 'canWriteRepairOrders', 'canReadRepairOrders', 'canMessageCustomers'], [{ status: 'active', shop: { id: NGA } }]), prisma }
    ngtOnly = { session: sessionFor(t.id, ['canAccessDashboard', 'canManageSchedule', 'canWriteRepairOrders', 'canReadRepairOrders'], [{ status: 'active', shop: { id: NGT } }]), prisma }

    await loadNorthgateSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    const cal = await prisma.shop.findUniqueOrThrow({ where: { id: NGA }, include: { calendar: { include: { exceptions: true } } } })
    const spec = fromRows(cal.code, cal.timeZone, cal.calendar as never, cal.calendar!.exceptions as never)
    day = nextBusinessDay(spec, nextBusinessDay(spec, new Date().toISOString().slice(0, 10)))
  }, 600_000)

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('the full Northgate load is idempotent and pins the verified CA pack on both shops', { timeout: 600_000 }, async () => {
    const again = await loadNorthgateSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    expect(Object.values(again.created).every(n => n === 0)).toBe(true)

    const packs = await prisma.jurisdictionPack.findMany({ orderBy: { code: 'asc' } })
    expect(packs.filter(p => p.verified).map(p => p.code)).toEqual(['US-CA'])
    expect(packs).toHaveLength(8)
    for (const id of [NGA, NGT]) {
      const shop = await prisma.shop.findUniqueOrThrow({ where: { id } })
      expect(shop).toMatchObject({ jurisdictionPackId: 'seed_pack_ca', jurisdictionPolicyId: 'seed_pack_ca_v1' })
      for (const pointer of ['shopPolicyId', 'laborRateClassSetId', 'laborMatrixId', 'partsMatrixId', 'feePolicyId', 'taxRuleSetId', 'warrantyTermSetId'] as const) expect(shop[pointer]).toBeTruthy()
    }
    const ca = await prisma.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: 'seed_pack_ca_v1' } })
    expect(ca).toMatchObject({ status: 'published', shopSuppliesGenericAllowed: false, toleranceRule: { kind: 'fixed', fixedMinor: '0' } })

    const ngaRates = await prisma.laborRateClass.findMany({ where: { setId: 'seed_shop_nga_labor_v1' } })
    expect(Object.fromEntries(ngaRates.map(r => [r.code, Number(r.rateMinor)]))).toMatchObject({ general: 16500, diagnostic: 18500, european: 19500, fleet: 15000 })
    const fees = await prisma.feeRule.findMany({ where: { policyId: 'seed_shop_nga_fees_v1' } })
    expect(fees.find(f => f.code === 'ca_tire_fee')).toMatchObject({ perUnitMinor: 175n, taxTreatment: 'non_taxable' })
    expect(fees.find(f => f.code === 'ca_battery_fee')).toMatchObject({ perUnitMinor: 200n, taxTreatment: 'non_taxable' })
    const taxParts = await prisma.taxRule.findFirstOrThrow({ where: { ruleSetId: 'seed_shop_nga_tax_v1', category: { code: 'parts' } } })
    expect(String(taxParts.rate)).toBe('0.0875')
    const taxLabor = await prisma.taxRule.findFirstOrThrow({ where: { ruleSetId: 'seed_shop_ngt_tax_v1', category: { code: 'labor_repair' } } })
    expect(taxLabor.taxable).toBe(false)

    expect(await prisma.customer.count({ where: { id: { startsWith: 'seed_cust_' } } })).toBe(CUSTOMERS.length + FLEETS.length)
    const fleet = await prisma.businessAccount.findUniqueOrThrow({ where: { id: 'seed_acct_cvp' } })
    expect(fleet).toMatchObject({ termsDays: 30, poRequired: true })
    expect(await prisma.vehicleOwnership.count({ where: { businessAccountId: 'seed_acct_cvp', endedAt: null } })).toBe(12)
    // The STOP'd customer: every SMS revoked, email still granted.
    const stopped = CUSTOMERS.findIndex(c => c.consent === 'stopped')
    const contacts = await prisma.customerContact.findMany({ where: { customerId: `seed_cust_${String(stopped + 1).padStart(2, '0')}` }, include: { consents: { orderBy: { at: 'desc' } } } })
    expect(contacts.find(c => c.kind === 'mobile')?.consents[0]).toMatchObject({ action: 'revoked', purpose: 'all', method: 'keyword_reply' })
    expect(contacts.find(c => c.kind === 'email')?.consents[0]).toMatchObject({ action: 'granted', channel: 'email' })
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })

  // ── Policy versions ─────────────────────────────────────────────────────────

  it('a draft copies the published version; publishing needs a second person when one exists, and moves the shop pointer', { timeout: 120_000 }, async () => {
    const draft = await createPolicyDraft(null, { kind: 'labor_rates', headId: NGA, idempotencyKey: uniqueKey('pd') }, manager) as { id: string; versionNumber: number }
    expect(draft.versionNumber).toBe(2)
    const again = await createPolicyDraft(null, { kind: 'labor_rates', headId: NGA, idempotencyKey: uniqueKey('pd') }, manager) as { id: string; existing: boolean }
    expect(again).toMatchObject({ id: draft.id, existing: true })
    await prisma.laborRateClass.updateMany({ where: { setId: draft.id, code: 'general' }, data: { rateMinor: 17500n } })

    const row = await prisma.laborRateClassSetVersion.findUniqueOrThrow({ where: { id: draft.id } })
    const asked = await publishPolicyVersion(null, { kind: 'labor_rates', versionId: draft.id, expectedVersion: row.version, idempotencyKey: uniqueKey('pp') }, manager) as { published: boolean; approvalRequestId: string }
    expect(asked.published).toBe(false)
    expect((await prisma.shop.findUniqueOrThrow({ where: { id: NGA } })).laborRateClassSetId).toBe('seed_shop_nga_labor_v1')

    // Editing the draft after asking makes the approval stale.
    await prisma.laborRateClass.updateMany({ where: { setId: draft.id, code: 'fleet' }, data: { rateMinor: 15500n } })
    await expect(decideApprovalRequest(null, { requestId: asked.approvalRequestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, owner)).rejects.toMatchObject({ code: 'APPROVAL_MISMATCH' })
    await prisma.laborRateClass.updateMany({ where: { setId: draft.id, code: 'fleet' }, data: { rateMinor: 15000n } })

    const approved = await decideApprovalRequest(null, { requestId: asked.approvalRequestId, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, owner)
    expect(approved.status).toBe('approved')
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: NGA } })
    expect(shop.laborRateClassSetId).toBe(draft.id)
    expect((await prisma.laborRateClassSetVersion.findUniqueOrThrow({ where: { id: 'seed_shop_nga_labor_v1' } })).status).toBe('retired')
    expect((await prisma.laborRateClassSetVersion.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('published')
  })

  it('published versions and their rows are immutable in the database', async () => {
    await expect(prisma.laborRateClassSetVersion.update({ where: { id: 'seed_shop_ngt_labor_v1' }, data: { notes: 'rewrite history' } })).rejects.toThrow(/published and cannot change/)
    await expect(prisma.laborRateClass.updateMany({ where: { setId: 'seed_shop_ngt_labor_v1' }, data: { rateMinor: 1n } })).rejects.toThrow(/published version and cannot change/)
    await expect(prisma.laborRateClassSetVersion.update({ where: { id: 'seed_shop_nga_labor_v1' }, data: { status: 'published' } })).rejects.toThrow(/retired and cannot change/)
    await expect(prisma.feeRule.deleteMany({ where: { policyId: 'seed_shop_ngt_fees_v1' } })).rejects.toThrow(/cannot change/)
    await expect(prisma.jurisdictionPolicyVersion.delete({ where: { id: 'seed_pack_ca_v1' } })).rejects.toThrow(/cannot be deleted/)
  })

  it('a generic shop-supplies fee cannot be published in California; agents can never record authorizations', { timeout: 120_000 }, async () => {
    const fees = await createPolicyDraft(null, { kind: 'fees', headId: NGT, idempotencyKey: uniqueKey('pd') }, manager) as { id: string }
    await prisma.feeRule.create({ data: { policyId: fees.id, code: 'shop_supplies_pct', kind: 'percent_of_base', base: 'labor', percent: '0.05' } })
    const feesRow = await prisma.feePolicyVersion.findUniqueOrThrow({ where: { id: fees.id } })
    await expect(publishPolicyVersion(null, { kind: 'fees', versionId: fees.id, expectedVersion: feesRow.version, idempotencyKey: uniqueKey('pp') }, manager)).rejects.toMatchObject({ code: 'SHOP_SUPPLIES_PROHIBITED' })

    const policy = await createPolicyDraft(null, { kind: 'shop_policy', headId: NGT, idempotencyKey: uniqueKey('pd') }, manager) as { id: string }
    await prisma.shopPolicyVersion.update({ where: { id: policy.id }, data: { agentAutonomy: { record_authorization: 'auto_within_policy' } } })
    const policyRow = await prisma.shopPolicyVersion.findUniqueOrThrow({ where: { id: policy.id } })
    await expect(publishPolicyVersion(null, { kind: 'shop_policy', versionId: policy.id, expectedVersion: policyRow.version, idempotencyKey: uniqueKey('pp') }, manager)).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    // Separately, an autonomy change goes to someone with canApproveAgentAutonomy, not just any publisher.
    await prisma.shopPolicyVersion.update({ where: { id: policy.id }, data: { agentAutonomy: { 'booking.propose': 'auto_within_policy', record_authorization: 'off' } } })
    const row2 = await prisma.shopPolicyVersion.findUniqueOrThrow({ where: { id: policy.id } })
    const asked = await publishPolicyVersion(null, { kind: 'shop_policy', versionId: policy.id, expectedVersion: row2.version, idempotencyKey: uniqueKey('pp') }, manager) as { approvalRequestId: string }
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.approvalRequestId } }))).toMatchObject({ action: 'agent.autonomy', requiredPermission: 'canApproveAgentAutonomy' })
  })

  // ── Customers and consent ───────────────────────────────────────────────────

  it('a second customer with the same phone is flagged as a duplicate unless confirmed', async () => {
    const first = await saveCustomer(null, { input: { firstName: 'Dup', lastName: 'One', homeShopId: NGA, contacts: [{ kind: 'mobile', value: '(916) 555-0199' }] }, idempotencyKey: uniqueKey('c') }, advisor) as { id: string }
    await expect(saveCustomer(null, { input: { firstName: 'Dup', lastName: 'Two', homeShopId: NGA, contacts: [{ kind: 'landline', value: '+1 916 555 0199' }] }, idempotencyKey: uniqueKey('c') }, advisor)).rejects.toMatchObject({ code: 'DUPLICATE', details: expect.objectContaining({ existingId: first.id }) })
    const second = await saveCustomer(null, { input: { firstName: 'Dup', lastName: 'Two', homeShopId: NGA, allowDuplicate: true, contacts: [{ kind: 'mobile', value: '9165550199' }] }, idempotencyKey: uniqueKey('c') }, advisor) as { id: string }
    expect(second.id).not.toBe(first.id)
    // A caller can't choose ids through the API.
    const chosen = await saveCustomer(null, { input: { firstName: 'Id', lastName: 'Picker', createId: 'seed_cust_hijack', homeShopId: NGA } as never, idempotencyKey: uniqueKey('c') }, advisor) as { id: string }
    expect(chosen.id).not.toBe('seed_cust_hijack')
    // An advisor at NGA can't make NGT the home shop.
    await expect(saveCustomer(null, { input: { firstName: 'X', homeShopId: NGT }, idempotencyKey: uniqueKey('c') }, advisor)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    // The audit trail never holds the phone number.
    const audits = await prisma.auditEvent.findMany({ where: { entityType: 'CustomerContact' }, select: { after: true } })
    expect(JSON.stringify(audits)).not.toMatch(/555-?0199|5550199/)
  })

  it('marketing texts need written consent; a classifier may revoke but never grant; agents cannot grant at all', async () => {
    const c = await saveCustomer(null, { input: { firstName: 'Consent', lastName: 'Case', homeShopId: NGA, contacts: [{ kind: 'mobile', value: '916-555-0188' }] }, idempotencyKey: uniqueKey('c') }, advisor) as { contactIds: string[] }
    const contactId = c.contactIds[0]
    await expect(recordContactConsent(null, { input: { contactId, channel: 'sms', purpose: 'marketing', action: 'granted', method: 'staff_recorded' }, idempotencyKey: uniqueKey('k') }, advisor)).rejects.toMatchObject({ code: 'CONSENT_BLOCKED' })
    await expect(recordContactConsent(null, { input: { contactId, channel: 'sms', purpose: 'transactional', action: 'granted', method: 'classifier_review' }, idempotencyKey: uniqueKey('k') }, advisor)).rejects.toMatchObject({ code: 'CONSENT_BLOCKED' })
    await recordContactConsent(null, { input: { contactId, channel: 'sms', purpose: 'marketing', action: 'granted', method: 'in_person_form', writtenConsent: true }, idempotencyKey: uniqueKey('k') }, advisor)
    await recordContactConsent(null, { input: { contactId, channel: 'sms', purpose: 'all', action: 'revoked', method: 'classifier_review' }, idempotencyKey: uniqueKey('k') }, advisor)
    // The database refuses an agent-granted consent and any edit to consent history.
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.actor_kind', 'agent', true)`
      await tx.contactConsent.create({ data: { contactId, channel: 'sms', purpose: 'transactional', action: 'granted', method: 'staff_recorded' } })
    })).rejects.toThrow(/agents cannot write/)
    const latest = await prisma.contactConsent.findFirstOrThrow({ where: { contactId }, orderBy: { at: 'desc' } })
    await expect(prisma.contactConsent.update({ where: { id: latest.id }, data: { action: 'granted' } })).rejects.toThrow(/append-only/)
    await expect(prisma.contactConsent.create({ data: { contactId, channel: 'sms', purpose: 'marketing', action: 'granted', method: 'staff_recorded', writtenConsent: false } })).rejects.toThrow(/ContactConsent_marketing_written/)
  })

  // ── Vehicles ────────────────────────────────────────────────────────────────

  it('one active vehicle per VIN; a check-digit typo warns; a lower odometer needs a reason', async () => {
    const existing = await saveVehicle(null, { input: { vin: RECORDED_VINS.clean }, idempotencyKey: uniqueKey('v') }, advisor) as { id: string; existing: boolean }
    expect(existing).toMatchObject({ id: 'seed_veh_01_1', existing: true })
    const typo = await saveVehicle(null, { input: { vin: RECORDED_VINS.checkDigit, year: 2018, make: 'Honda', model: 'Accord' }, idempotencyKey: uniqueKey('v') }, advisor) as { id: string; vinCheck: { validity: string } }
    expect(typo.vinCheck.validity).toBe('check_digit_warning')
    await expect(saveVehicle(null, { input: { id: typo.id, vin: RECORDED_VINS.clean }, idempotencyKey: uniqueKey('v') }, advisor)).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(saveVehicle(null, { input: { vin: 'ABC' }, idempotencyKey: uniqueKey('v') }, advisor)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(prisma.vehicle.create({ data: { vin: RECORDED_VINS.clean, vinValid: 'valid', status: 'active' } as never })).rejects.toThrow(/Vehicle_active_vin_key|Unique constraint/)

    await recordOdometerReading(null, { vehicleId: typo.id, value: 60_000, idempotencyKey: uniqueKey('o') }, advisor)
    await expect(recordOdometerReading(null, { vehicleId: typo.id, value: 59_000, idempotencyKey: uniqueKey('o') }, advisor)).rejects.toMatchObject({ code: 'ODOMETER_REGRESSION' })
    const fixed = await recordOdometerReading(null, { vehicleId: typo.id, value: 59_000, overrideReason: 'Instrument cluster replaced', idempotencyKey: uniqueKey('o') }, advisor) as { anomaly: string }
    expect(fixed.anomaly).toBe('lower_than_previous')
    await expect(prisma.odometerReading.create({ data: { vehicleId: typo.id, value: 1, unit: 'mi', source: 'customer', anomaly: 'lower_than_previous' } })).rejects.toThrow(/OdometerReading_regression_reason/)
  })

  // ── Scheduling ──────────────────────────────────────────────────────────────

  it('the last waiter slot in an hour goes to exactly one of two concurrent bookings', { timeout: 120_000 }, async () => {
    // NGA allows 2 waiters per hour. Fill one, then race two for the last.
    const book = (customerId: string | null, lead?: { name: string }) => bookShopAppointment(null, { shopId: NGA, startsAt: at('10:00').toISOString(), kind: 'waiter', estimatedCentiHours: 50, customerId, lead, idempotencyKey: uniqueKey('b') }, advisor)
    await book(null, { name: 'Walk-in one' })
    const results = await Promise.allSettled([book(null, { name: 'Racer A' }), book(null, { name: 'Racer B' })])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: expect.objectContaining({ code: 'CAPACITY_FULL' }) })
  })

  it('a hold reserves the slot until it is used or expires; a used hold cannot be used twice', { timeout: 120_000 }, async () => {
    const hold = await holdAppointmentSlot(null, { shopId: NGA, startsAt: at('11:00').toISOString(), kind: 'waiter', estimatedCentiHours: 50, idempotencyKey: uniqueKey('h') }, advisor) as { token: string }
    await bookShopAppointment(null, { shopId: NGA, startsAt: at('11:00').toISOString(), kind: 'waiter', lead: { name: 'Other' }, idempotencyKey: uniqueKey('b') }, advisor)
    // Two waiters per hour: the hold plus that booking fill it.
    await expect(bookShopAppointment(null, { shopId: NGA, startsAt: at('11:30').toISOString(), kind: 'waiter', lead: { name: 'Third' }, idempotencyKey: uniqueKey('b') }, advisor)).rejects.toMatchObject({ code: 'CAPACITY_FULL' })
    const booked = await bookShopAppointment(null, { shopId: NGA, startsAt: at('11:00').toISOString(), kind: 'waiter', lead: { name: 'Hold owner' }, holdToken: hold.token, idempotencyKey: uniqueKey('b') }, advisor) as { reference: string }
    expect(booked.reference).toMatch(/^APT-NGA-\d{4}-\d{6}$/)
    await expect(bookShopAppointment(null, { shopId: NGA, startsAt: at('11:00').toISOString(), kind: 'waiter', lead: { name: 'Replay' }, holdToken: hold.token, idempotencyKey: uniqueKey('b') }, advisor)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' })

    const late = await holdAppointmentSlot(null, { shopId: NGA, startsAt: at('13:00').toISOString(), kind: 'waiter', idempotencyKey: uniqueKey('h') }, advisor) as { token: string }
    const later = new Date(Date.now() + 11 * 60_000)
    const swept = await command(prisma, { name: 'test.expire', actor: systemActor('test'), idempotencyKey: uniqueKey('x'), params: {}, now: later }, uow => expireStaleHolds(uow))
    expect(swept.value.expired).toBeGreaterThanOrEqual(1)
    await expect(bookShopAppointment(null, { shopId: NGA, startsAt: at('13:00').toISOString(), kind: 'waiter', lead: { name: 'Too late' }, holdToken: late.token, idempotencyKey: uniqueKey('b') }, advisor)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' })
  })

  it('opening hours, slot alignment, the waiter cut-off and shop membership are enforced', async () => {
    const attempt = (startsAt: Date, kind = 'drop_off', ctx = advisor, shopId = NGA) => bookShopAppointment(null, { shopId, startsAt: startsAt.toISOString(), kind, lead: { name: 'Rules' }, idempotencyKey: uniqueKey('b') }, ctx)
    await expect(attempt(at('06:30'))).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' })
    await expect(attempt(at('09:10'))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(attempt(at('15:30'), 'waiter')).rejects.toMatchObject({ code: 'CAPACITY_FULL' })
    await expect(attempt(at('09:30'), 'drop_off', ngtOnly)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('a no-show waits for the grace period, then counts against the customer; arrival only happens at check-in', { timeout: 120_000 }, async () => {
    const customerId = 'seed_cust_02'
    const vehicle = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId, endedAt: null } })
    const appt = await bookShopAppointment(null, { shopId: NGA, startsAt: at('14:00').toISOString(), kind: 'drop_off', customerId, vehicleId: vehicle.vehicleId, confirm: true, idempotencyKey: uniqueKey('b') }, advisor) as { id: string }
    await expect(transitionAppointment(null, { id: appt.id, to: 'arrived', expectedVersion: 0, idempotencyKey: uniqueKey('t') }, advisor)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(transitionAppointment(null, { id: appt.id, to: 'no_show', expectedVersion: 0, idempotencyKey: uniqueKey('t') }, advisor)).rejects.toMatchObject({ code: 'GUARD_FAILED' })
    const before = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).noShowCount ?? 0
    const afterGrace = new Date(at('14:00').getTime() + 31 * 60_000)
    await command(prisma, { name: 'test.no_show', actor: systemActor('test'), idempotencyKey: uniqueKey('x'), params: {}, now: afterGrace }, uow => markNoShow(uow, systemActor('test'), { id: appt.id }))
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).noShowCount).toBe(before + 1)
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('no_show')
  })

  // ── Check-in ────────────────────────────────────────────────────────────────

  it('CA check-in needs the odometer and a signature, warns about open recalls, and marks the appointment arrived', { timeout: 120_000 }, async () => {
    const customerId = 'seed_cust_07' // the 2017 Kia Sportage with park-outside recalls
    const owned = await prisma.vehicleOwnership.findFirstOrThrow({ where: { customerId, endedAt: null }, include: { vehicle: true } })
    const vehicle = { vehicleId: owned.vehicleId!, vehicle: owned.vehicle! }
    // A recall check taken earlier, from the recorded NHTSA response for this make, model and year.
    const recalls = await recordedAdapter().recallsByVehicle({ make: 'Kia', model: 'Sportage', modelYear: 2017 })
    if (recalls.kind !== 'ok') throw new Error('recorded recalls missing')
    await prisma.recallCheck.create({ data: { vehicleId: vehicle.vehicleId, source: 'nhtsa_make_model_year', query: { make: 'Kia', model: 'Sportage', modelYear: 2017 }, campaigns: JSON.parse(JSON.stringify(recalls.value)), campaignCount: recalls.value.length, parkItAny: recalls.value.some(c => c.parkIt || c.parkOutSide), checkedAt: new Date() } })
    const appt = await bookShopAppointment(null, { shopId: NGA, startsAt: at('15:00').toISOString(), kind: 'drop_off', customerId, vehicleId: vehicle.vehicleId, confirm: true, idempotencyKey: uniqueKey('b') }, advisor) as { id: string }
    const base = { shopId: NGA, appointmentId: appt.id, customerId, vehicleId: vehicle.vehicleId, concerns: ['Check engine light on'], promisedAt: new Date(Date.now() + 86_400_000).toISOString() }
    await expect(checkInShopVehicle(null, { input: { ...base, signature: SIGNATURE }, idempotencyKey: uniqueKey('ci') }, advisor)).rejects.toMatchObject({ code: 'ODOMETER_REQUIRED' })
    await expect(checkInShopVehicle(null, { input: { ...base, odometer: { value: (vehicle.vehicle.lastOdometer ?? 0) + 120 } }, idempotencyKey: uniqueKey('ci') }, advisor)).rejects.toMatchObject({ code: 'SIGNATURE_REQUIRED' })
    await expect(checkInShopVehicle(null, { input: { ...base, appointmentId: appt.id, odometer: { value: 1 }, signature: SIGNATURE }, idempotencyKey: uniqueKey('ci') }, ngtOnly)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })

    const done = await checkInShopVehicle(null, { input: { ...base, odometer: { value: (vehicle.vehicle.lastOdometer ?? 0) + 120 }, signature: SIGNATURE }, idempotencyKey: uniqueKey('ci') }, advisor) as { reference: string; recallWarning: { count: number; campaigns: { parkOutSide: boolean }[] } }
    expect(done.reference).toMatch(/^CI-NGA-/)
    expect(done.recallWarning.count).toBe(4)
    expect(done.recallWarning.campaigns.some(c => c.parkOutSide)).toBe(true)
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe('arrived')
    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { reference: done.reference } })
    expect(checkIn.workOrderText).toContain('You are entitled to a written estimate')
    expect(checkIn.jurisdictionPolicyVersionId).toBe('seed_pack_ca_v1')
    await expect(checkInShopVehicle(null, { input: { ...base, appointmentId: null, odometer: { value: (vehicle.vehicle.lastOdometer ?? 0) + 130 }, signature: SIGNATURE }, idempotencyKey: uniqueKey('ci') }, advisor)).rejects.toMatchObject({ code: 'DUPLICATE' })
  })

  // ── Exit gate ───────────────────────────────────────────────────────────────

  it('EXIT GATE: a price one cent above the authorized amount is refused under the CA pack', async () => {
    const ok = await checkAuthorizedCeiling(null, { shopId: NGA, authorizedMinor: '48250', priceMinor: '45000', taxMinor: '3250' }, advisor)
    expect(ok).toMatchObject({ ok: true, ceilingMinor: '48250', policyVersionId: 'seed_pack_ca_v1' })
    await expect(checkAuthorizedCeiling(null, { shopId: NGA, authorizedMinor: '48250', priceMinor: '45001', taxMinor: '3250' }, advisor)).rejects.toMatchObject({ code: 'REAUTHORIZATION_REQUIRED' })
    await expect(checkAuthorizedCeiling(null, { shopId: NGA, authorizedMinor: '48250', priceMinor: '-1' }, advisor)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })

})
