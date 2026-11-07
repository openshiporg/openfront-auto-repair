import { describe, expect, it } from 'vitest'
import { checkSignature, workOrderText } from './checkIn'
import { contactHash, contactLabel, currentConsent, displayNameOf, normalizeContact } from './customers'
import { capacityRules } from './scheduling'
import { contentHash, validatePolicy } from './policy'
import type { Tx } from './db'
import { PACKS } from '../seed/policy'

describe('contacts', () => {
  it('normalises US and international phones to E.164 and emails to lower case', () => {
    expect(normalizeContact('mobile', '(916) 555-0142')).toBe('+19165550142')
    expect(normalizeContact('landline', '1 916 555 0142')).toBe('+19165550142')
    expect(normalizeContact('mobile', '+44 20 7946 0958')).toBe('+442079460958')
    expect(normalizeContact('email', ' Maria.Gonzalez@Example.COM ')).toBe('maria.gonzalez@example.com')
    expect(() => normalizeContact('mobile', '555-0142')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(() => normalizeContact('email', 'not an email')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
  })

  it('mobile and landline share one lookup namespace; email does not', () => {
    expect(contactHash('mobile', '+19165550142')).toBe(contactHash('landline', '+19165550142'))
    expect(contactHash('email', '+19165550142')).not.toBe(contactHash('mobile', '+19165550142'))
  })

  it('labels are masked and names fall back sensibly', () => {
    expect(contactLabel('mobile', '+19165550142')).toBe('•••-•••-0142')
    expect(contactLabel('email', 'maria@example.com')).toBe('m•••@example.com')
    expect(displayNameOf({ firstName: 'Maria', lastName: 'Gonzalez' })).toBe('Maria Gonzalez')
    expect(displayNameOf({ kind: 'business', companyName: 'Capital Valley Plumbing', firstName: 'Ann' })).toBe('Capital Valley Plumbing')
    expect(displayNameOf({})).toBe('Unnamed customer')
  })
})

describe('consent (TCPA, I-C1)', () => {
  it('the latest event wins; "all" covers both purposes; STOP leaves email untouched', () => {
    const state = currentConsent([
      { channel: 'sms', purpose: 'transactional', action: 'granted', at: '2026-01-01T00:00:00Z' },
      { channel: 'sms', purpose: 'marketing', action: 'granted', at: '2026-01-02T00:00:00Z' },
      { channel: 'email', purpose: 'transactional', action: 'granted', at: '2026-01-02T00:00:00Z' },
      { channel: 'sms', purpose: 'all', action: 'revoked', at: '2026-03-01T00:00:00Z' },
    ])
    expect(state['sms:transactional']).toBe('revoked')
    expect(state['sms:marketing']).toBe('revoked')
    expect(state['email:transactional']).toBe('granted')
    expect(state['voice:marketing']).toBe('unknown')
  })

  it('order of input does not matter', () => {
    const events = [
      { channel: 'sms', purpose: 'transactional', action: 'revoked', at: new Date('2026-02-01') },
      { channel: 'sms', purpose: 'transactional', action: 'granted', at: new Date('2026-01-01') },
    ]
    expect(currentConsent(events)['sms:transactional']).toBe('revoked')
    expect(currentConsent([...events].reverse())['sms:transactional']).toBe('revoked')
  })
})

/** A Tx stub that answers the one query capacityRules makes. */
const rulesTx = (rows: { kind: string; value: unknown; appliesToDays?: number[] }[]) => ({ bookingRule: { findMany: async () => rows.map(r => ({ appliesToDays: [], ...r })) } }) as unknown as Tx

describe('booking rules', () => {
  it('reads each rule kind, ignores bad values and applies day filters', async () => {
    const tx = rulesTx([
      { kind: 'max_dropoffs_per_day', value: 8, appliesToDays: [6] }, // Saturdays only: beats the every-day rule even though it is older
      { kind: 'max_dropoffs_per_day', value: 18 },
      { kind: 'waiter_slots_per_hour', value: 2 },
      { kind: 'max_bay_hours_per_day', value: 5700 },
      { kind: 'no_waiters_after', value: '15:00' },
      { kind: 'lead_time_hours', value: 2 },
      { kind: 'slot_minutes', value: 45 }, // not an allowed slot length: ignored
    ])
    expect(await capacityRules(tx, 's', '2026-11-09')).toEqual({ maxDropoffsPerDay: 18, waiterSlotsPerHour: 2, maxBayCentiHoursPerDay: 5700, noWaitersAfter: '15:00', leadTimeHours: 2, slotMinutes: 30 })
    expect((await capacityRules(tx, 's', '2026-11-14')).maxDropoffsPerDay).toBe(8)
  })

  it('no rules means no caps, 30-minute slots and no lead time', async () => {
    expect(await capacityRules(rulesTx([]), 's', '2026-11-09')).toEqual({ maxDropoffsPerDay: null, waiterSlotsPerHour: null, maxBayCentiHoursPerDay: null, noWaitersAfter: null, leadTimeHours: 0, slotMinutes: 30 })
  })
})

describe('work order and signature', () => {
  const CA = PACKS.find(p => p.code === 'US-CA')!
  const text = workOrderText({
    shopName: 'Northgate Auto Care', legalName: 'Northgate Auto Group LLC', registrations: { barArd: 'ARD-000000' },
    concerns: ['Grinding noise from the front when braking'], notices: CA.law.requiredNotices as never, replacedPartsOfferText: String(CA.law.replacedPartsOfferText),
    promisedAt: new Date('2026-11-09T01:00:00Z'), odometer: 61_931, timeZone: 'America/Los_Angeles',
  })

  it('carries the registration, concerns, odometer, promised time and the CA work-order notices', () => {
    expect(text).toContain('Automotive Repair Dealer registration ARD-000000')
    expect(text).toContain('1. Grinding noise from the front when braking')
    expect(text).toContain('Odometer in: 61,931')
    expect(text).toContain('Promised: Nov 8, 2026, 5:00 PM')
    expect(text).toContain('You are entitled to a written estimate')
    expect(text).toContain('replaced parts')
    expect(text).not.toContain('This is a written estimate') // estimate-only notice
  })

  it('needs a signer name and real ink (or a typed acknowledgement)', () => {
    expect(() => checkSignature({ method: 'in_person', signerName: '', strokes: [] })).toThrow(expect.objectContaining({ code: 'SIGNATURE_REQUIRED' }))
    expect(() => checkSignature({ method: 'in_person', signerName: 'Maria Gonzalez', strokes: [[[0, 0], [1, 1]]] })).toThrow(expect.objectContaining({ code: 'SIGNATURE_REQUIRED' }))
    expect(checkSignature({ method: 'in_person', signerName: 'Maria Gonzalez', strokes: [], typedAcknowledgement: true })).toMatchObject({ signerName: 'Maria Gonzalez', typedAcknowledgement: true })
    const strokes = [Array.from({ length: 12 }, (_, i) => [i * 3.14159, i * 2.71828])]
    expect(checkSignature({ method: 'in_person', signerName: 'Maria Gonzalez', strokes })?.strokes[0][1]).toEqual([3.1, 2.7])
    expect(() => checkSignature({ method: 'in_person', signerName: 'Maria', strokes: [[[0, Number.NaN]]] as never })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(checkSignature(null)).toBeNull()
  })
})

describe('policy validation', () => {
  const noTx = {} as Tx
  it('every seeded jurisdiction pack is valid', async () => {
    for (const pack of PACKS) await expect(validatePolicy(noTx, 'jurisdiction', {}, JSON.parse(JSON.stringify(pack.law, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))))).resolves.toBeUndefined()
  })

  it('rejects a bad tolerance rule and unknown authorization methods, listing every problem', async () => {
    const err = await validatePolicy(noTx, 'jurisdiction', {}, { toleranceRule: { kind: 'guess' }, allowedAuthorizationMethods: ['telepathy'], recordRetentionYears: 0, requiredNotices: [] }).catch(e => e)
    expect(err).toMatchObject({ code: 'POLICY_INVALID' })
    expect(err.details.problems).toHaveLength(3)
  })

  it('agents can never be given authorization recording (a voice "yes" becomes a staff callback)', async () => {
    const base = { diagnosisTrustThreshold: '0.7000', agentOrderLimitMinor: '0', discountLimitPctByRole: {} }
    await expect(validatePolicy(noTx, 'shop_policy', {}, { ...base, agentAutonomy: { record_authorization: 'propose_only' } })).rejects.toMatchObject({ code: 'AGENT_FORBIDDEN_ACTION' })
    await expect(validatePolicy(noTx, 'shop_policy', {}, { ...base, agentAutonomy: { record_authorization: 'off', 'booking.propose': 'propose_only' } })).resolves.toBeUndefined()
    await expect(validatePolicy(noTx, 'shop_policy', {}, { ...base, diagnosisTrustThreshold: '1.5', agentAutonomy: {} })).rejects.toMatchObject({ code: 'POLICY_INVALID' })
  })

  it('labor rates need exactly one default and positive rates', async () => {
    await expect(validatePolicy(noTx, 'labor_rates', {}, { classes: [{ code: 'general', rateMinor: '16500', isDefault: true }, { code: 'diagnostic', rateMinor: '18500', isDefault: false }] })).resolves.toBeUndefined()
    await expect(validatePolicy(noTx, 'labor_rates', {}, { classes: [{ code: 'general', rateMinor: '16500', isDefault: true }, { code: 'fleet', rateMinor: '0', isDefault: true }] })).rejects.toMatchObject({ code: 'POLICY_INVALID', details: { problems: expect.arrayContaining([expect.stringContaining('default'), expect.stringContaining('more than zero')]) } })
  })

  it('parts tiers must be contiguous with multipliers of at least 1', async () => {
    const tiers = [{ minCostMinor: '0', maxCostMinor: '1000', multiplier: '2.5' }, { minCostMinor: '1000', maxCostMinor: null, multiplier: '1.35' }]
    await expect(validatePolicy(noTx, 'parts_matrix', {}, { tiers, marginFloorPct: '0.30' })).resolves.toBeUndefined()
    await expect(validatePolicy(noTx, 'parts_matrix', {}, { tiers: [tiers[0], { ...tiers[1], minCostMinor: '1200' }], marginFloorPct: '0.30' })).rejects.toMatchObject({ code: 'POLICY_INVALID' })
    await expect(validatePolicy(noTx, 'parts_matrix', {}, { tiers: [{ ...tiers[0], multiplier: '0.9' }], marginFloorPct: '0.30' })).rejects.toMatchObject({ code: 'POLICY_INVALID' })
  })

  it('a CA shop cannot add a generic shop-supplies percentage', async () => {
    const tx = { shop: { findUnique: async () => ({ jurisdictionPolicyId: 'ca' }) }, jurisdictionPolicyVersion: { findUnique: async () => ({ shopSuppliesGenericAllowed: false }) } } as unknown as Tx
    await expect(validatePolicy(tx, 'fees', { shopId: 's' }, { rules: [{ code: 'shop_supplies_pct', kind: 'percent_of_base', percent: '0.05' }] })).rejects.toMatchObject({ code: 'SHOP_SUPPLIES_PROHIBITED' })
    await expect(validatePolicy(tx, 'fees', { shopId: 's' }, { rules: [{ code: 'ca_tire_fee', kind: 'per_unit', perUnitMinor: '175', itemCategory: 'tire_new' }] })).resolves.toBeUndefined()
  })

  it('a non-taxable category must carry a zero rate; rates are fractions', async () => {
    await expect(validatePolicy(noTx, 'tax', {}, { rules: [{ categoryId: 'labor', taxable: false, rate: '0.0875' }] })).rejects.toMatchObject({ code: 'POLICY_INVALID' })
    await expect(validatePolicy(noTx, 'tax', {}, { rules: [{ categoryId: 'parts', taxable: true, rate: '8.75' }] })).rejects.toMatchObject({ code: 'POLICY_INVALID' })
    await expect(validatePolicy(noTx, 'tax', {}, { rules: [{ categoryId: 'parts', taxable: true, rate: '0.0875' }, { categoryId: 'labor', taxable: false, rate: '0' }] })).resolves.toBeUndefined()
  })

  it('the content hash ignores key order', () => {
    expect(contentHash({ a: 1, b: [1, 2] })).toBe(contentHash({ b: [1, 2], a: 1 }))
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }))
  })
})
