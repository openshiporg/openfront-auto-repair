import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { assertWithinCeiling, chargeCeilingMinor, parseToleranceRule, toleranceMinor } from './ceiling'

const CA = { kind: 'fixed', fixedMinor: 0, includesTax: true }
const FL = { kind: 'max_of', percent: '0.10', fixedMinor: 1000, capMinor: 5000, includesTax: true }
const MI = { kind: 'min_of', percent: '0.10', fixedMinor: 5000, includesTax: true }
const WA = { kind: 'percent', percent: '0.10', includesTax: false }

describe('authorized ceiling (I-R4)', () => {
  it('CA has no tolerance: one cent over the authorization is refused', () => {
    expect(chargeCeilingMinor(CA, 48_250n)).toBe(48_250n)
    expect(assertWithinCeiling({ rule: CA, authorizedMinor: 48_250n, priceMinor: 45_000n, taxMinor: 3_250n }).comparedMinor).toBe(48_250n)
    expect(() => assertWithinCeiling({ rule: CA, authorizedMinor: 48_250n, priceMinor: 45_001n, taxMinor: 3_250n, jobId: 'job-1' })).toThrow(expect.objectContaining({ code: 'REAUTHORIZATION_REQUIRED', details: expect.objectContaining({ jobId: 'job-1', ceilingMinor: '48250', priceMinor: '48251' }) }))
  })

  it('FL is the larger of 10% and $10, capped at $50', () => {
    expect(toleranceMinor(FL, 5_000n)).toBe(1_000n) // $50 job → $10 floor
    expect(toleranceMinor(FL, 30_000n)).toBe(3_000n) // $300 → 10%
    expect(toleranceMinor(FL, 90_000n)).toBe(5_000n) // $900 → capped at $50
  })

  it('MI is the smaller of 10% and $50', () => {
    expect(toleranceMinor(MI, 20_000n)).toBe(2_000n)
    expect(toleranceMinor(MI, 80_000n)).toBe(5_000n)
  })

  it('WA is 10% excluding tax, rounded half-even to the cent', () => {
    expect(toleranceMinor(WA, 12_345n)).toBe(1_234n) // 1234.5 → 1234
    expect(toleranceMinor(WA, 12_355n)).toBe(1_236n) // 1235.5 → 1236
    expect(() => assertWithinCeiling({ rule: WA, authorizedMinor: 10_000n, priceMinor: 11_000n, taxMinor: 900n })).not.toThrow()
    expect(() => assertWithinCeiling({ rule: WA, authorizedMinor: 10_000n, priceMinor: 11_001n })).toThrow(expect.objectContaining({ code: 'REAUTHORIZATION_REQUIRED' }))
  })

  it('refuses malformed rules instead of guessing', () => {
    expect(() => parseToleranceRule({ kind: 'percent', percent: 0.1, includesTax: false })).toThrow(/decimal fraction/)
    expect(() => parseToleranceRule({ kind: 'fixed', fixedMinor: 1.5, includesTax: true })).toThrow(/whole cents/)
    expect(() => parseToleranceRule({ kind: 'formula', includesTax: true })).toThrow(/kind/)
    expect(() => parseToleranceRule({ kind: 'fixed', fixedMinor: 0 })).toThrow(/includes tax/)
  })

  it('never lets a price above the ceiling through, for any rule and amount (property)', () => {
    const rules = fc.constantFrom(CA, FL, MI, WA)
    fc.assert(fc.property(rules, fc.bigInt({ min: 0n, max: 10_000_000n }), fc.bigInt({ min: 0n, max: 20_000_000n }), (rule, authorized, price) => {
      const ceiling = chargeCeilingMinor(rule, authorized)
      expect(ceiling >= authorized).toBe(true)
      let refused = false
      try { assertWithinCeiling({ rule: { ...rule, includesTax: false }, authorizedMinor: authorized, priceMinor: price }) } catch { refused = true }
      expect(refused).toBe(price > ceiling)
    }), { numRuns: 500 })
  })
})
