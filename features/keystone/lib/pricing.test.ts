import { describe, expect, it } from 'vitest'
import { floorPriceMinor, identityHash, partsMultiplier, priceJob, type LineInput, type PricingPolicy } from './pricing'
import { DomainError } from './errors'

// Northgate Auto Care (NGA, Sacramento) as seeded: general $165/h, 8.750% sales tax on parts,
// labor not taxable (CDTFA Pub 25), five-tier parts matrix, CA tire fee $1.75 per new tire.
const NGA: PricingPolicy = {
  rateClasses: [
    { id: 'rc_g', code: 'general', rateMinor: 16500n, taxCategoryCode: 'labor_repair', isDefault: true },
    { id: 'rc_d', code: 'diagnostic', rateMinor: 18500n, taxCategoryCode: 'diagnostic', isDefault: false },
  ],
  laborMatrix: { bands: [], appliesToClasses: [] },
  partsMatrix: {
    tiers: [
      { minCostMinor: '0', maxCostMinor: '1000', multiplier: '2.500000' },
      { minCostMinor: '1000', maxCostMinor: '5000', multiplier: '2.000000' },
      { minCostMinor: '5000', maxCostMinor: '15000', multiplier: '1.750000' },
      { minCostMinor: '15000', maxCostMinor: '50000', multiplier: '1.500000' },
      { minCostMinor: '50000', maxCostMinor: null, multiplier: '1.350000' },
    ],
    categoryOverrides: { tires: '1.250000' },
    marginFloorPct: '0.300000',
  },
  feeRules: [
    { id: 'f1', code: 'ca_tire_fee', kind: 'per_unit', base: 'units_of_item_category', percent: null, flatMinor: null, perUnitMinor: 175n, minMinor: null, maxMinor: null, itemCategory: 'tire_new', taxTreatment: 'non_taxable', refundable: false, invoiceText: 'California tire fee' },
    { id: 'f2', code: 'ca_battery_fee', kind: 'per_unit', base: 'units_of_item_category', percent: null, flatMinor: null, perUnitMinor: 200n, minMinor: null, maxMinor: null, itemCategory: 'battery_lead_acid', taxTreatment: 'non_taxable', refundable: false, invoiceText: 'California battery fee' },
  ],
  taxRules: [
    ['labor_repair', false], ['labor_fabrication', true], ['parts', true], ['tires', true], ['fee_tire', false], ['fee_battery', false], ['battery_deposit', true], ['sublet_labor', false], ['diagnostic', false],
  ].map(([code, taxable]) => ({ categoryCode: code as string, categoryId: `tc_${code}`, taxable: taxable as boolean, rate: '0.087500' })),
  taxRounding: 'per_line',
  law: { requirePartCondition: true, shopSuppliesGenericAllowed: false, subletDisclosureRequired: true },
}

const BRAKES: LineInput[] = [
  { ref: 'L1', kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 160 },
  { ref: 'L2', kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: 4800n },
  { ref: 'L3', kind: 'part', description: 'Front brake rotor', partNumber: '09.C394.13', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 2000, unitCostMinor: 6500n },
]

describe('golden CA brake job (Phase 2 exit gate)', () => {
  const price = priceJob(BRAKES, NGA)

  it('prices labor at the rate class, separately, with no tax', () => {
    const labor = price.lines.find(l => l.kind === 'labor')!
    expect(labor.extendedMinor).toBe(26400n) // 1.60 h × $165.00
    expect(labor.taxable).toBe(false)
    expect(labor.taxMinor).toBe(0n)
    expect(price.laborMinor).toBe(26400n)
  })

  it('marks parts up on the matrix and taxes only the parts', () => {
    const [pads, rotors] = price.lines.filter(l => l.kind === 'part')
    expect(pads.unitPriceMinor).toBe(9600n) // $48.00 × 2.0
    expect(rotors.unitPriceMinor).toBe(11375n) // $65.00 × 1.75
    expect(rotors.extendedMinor).toBe(22750n)
    expect(pads.taxMinor).toBe(840n) // 9600 × 8.75%
    expect(rotors.taxMinor).toBe(1991n) // 1990.625 → half-even once
    expect(price.taxMinor).toBe(2831n)
  })

  it('adds no CA tire fee without new tires', () => {
    expect(price.lines.some(l => l.feeCode === 'ca_tire_fee')).toBe(false)
    expect(price.feesMinor).toBe(0n)
  })

  it('totals exactly', () => {
    expect(price.subtotalMinor).toBe(58750n)
    expect(price.totalMinor).toBe(61581n)
    expect(price.costMinor).toBe(17800n)
    expect(price.problems).toEqual([])
  })

  it('a missing part condition is a problem that stops the estimate', () => {
    const p = priceJob([BRAKES[0], { ...BRAKES[1], condition: null }], NGA)
    expect(p.problems.join(' ')).toMatch(/condition/)
  })

  it('the content hash is stable and changes with what the customer sees', () => {
    expect(priceJob(BRAKES, NGA).contentHash).toBe(price.contentHash)
    const added = priceJob([...BRAKES, { ref: 'L4', kind: 'part', description: 'Brake hardware kit', partNumber: 'H5800', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: 1200n }], NGA)
    expect(added.contentHash).not.toBe(price.contentHash)
    expect(added.totalMinor).toBe(61581n + 2400n + 210n)
  })

  it('cost changes do not change the hash when the price is overridden to the same amount', () => {
    const a = priceJob([{ ...BRAKES[1], unitPriceOverrideMinor: 9600n }], NGA)
    const b = priceJob([{ ...BRAKES[1], unitCostMinor: 4700n, unitPriceOverrideMinor: 9600n }], NGA)
    expect(a.contentHash).toBe(b.contentHash)
  })
})

describe('fees', () => {
  it('charges the CA tire fee per new tire, not taxed, tires taxed', () => {
    const p = priceJob([{ ref: 'L1', kind: 'tire', description: 'Michelin Defender 225/45R17', condition: 'new', isNewTire: true, quantityMilli: 4000, unitCostMinor: 12000n }], NGA)
    const fee = p.lines.find(l => l.feeCode === 'ca_tire_fee')!
    expect(fee.extendedMinor).toBe(700n)
    expect(fee.taxMinor).toBe(0n)
    expect(p.lines[0].unitPriceMinor).toBe(15000n) // tires override 1.25
    expect(p.lines[0].taxMinor).toBe(5250n)
  })

  it('no fee for used tires', () => {
    const p = priceJob([{ ref: 'L1', kind: 'tire', description: 'Used tire', condition: 'used', isNewTire: false, quantityMilli: 1000, unitCostMinor: 3000n }], NGA)
    expect(p.feesMinor).toBe(0n)
  })

  it('refuses a generic shop-supplies charge in CA', () => {
    expect(() => priceJob([{ ref: 'L1', kind: 'fee', description: 'Shop supplies' }], NGA)).toThrow(DomainError)
  })
})

describe('matrix, floor, overrides', () => {
  it('picks tiers by cost with the upper bound exclusive', () => {
    expect(partsMultiplier(NGA.partsMatrix, 999n, 'brakes').multiplier).toBe('2.500000')
    expect(partsMultiplier(NGA.partsMatrix, 1000n, 'brakes').multiplier).toBe('2.000000')
    expect(partsMultiplier(NGA.partsMatrix, 1n, 'tires').source).toBe('category')
  })

  it('floor price rounds up', () => {
    expect(floorPriceMinor(7000n, '0.300000')).toBe(10000n)
    expect(floorPriceMinor(1000n, '0.300000')).toBe(1429n) // 1428.57… → up
  })

  it('an override below the floor is flagged for approval', () => {
    const p = priceJob([{ ...BRAKES[1], unitPriceOverrideMinor: 6000n }], NGA)
    expect(p.belowFloor).toEqual(['L2'])
  })

  it('a core passes through at cost and needs no condition', () => {
    const p = priceJob([{ ref: 'L1', kind: 'core', description: 'Alternator core', quantityMilli: 1000, unitCostMinor: 4500n }], NGA)
    expect(p.lines[0].unitPriceMinor).toBe(4500n)
    expect(p.problems).toEqual([])
  })

  it('a sublet must name the vendor', () => {
    const p = priceJob([{ ref: 'L1', kind: 'sublet', description: 'Alignment', subletCostMinor: 6000n, subletPriceMinor: 9000n }], NGA)
    expect(p.problems.join(' ')).toMatch(/sublet shop/)
  })
})

describe('tax rounding', () => {
  it('per invoice category spreads the rounded total by largest remainder', () => {
    const lines: LineInput[] = [1, 2, 3].map(i => ({ ref: `L${i}`, kind: 'part' as const, description: `Clip ${i}`, condition: 'new', quantityMilli: 1000, unitCostMinor: 3n, unitPriceOverrideMinor: 11n }))
    const perLine = priceJob(lines, NGA)
    const perCat = priceJob(lines, { ...NGA, taxRounding: 'per_invoice_category' })
    expect(perLine.taxMinor).toBe(3n) // 0.9625 → 1, three times
    expect(perCat.taxMinor).toBe(3n) // 2.8875 → 3, spread 1/1/1
    expect(perCat.lines.map(l => l.taxMinor)).toEqual([1n, 1n, 1n])
  })
})

describe('identity hash (I-R5)', () => {
  it('ignores price but not part number or condition', () => {
    const a = priceJob(BRAKES, NGA).lines
    const cheaper = priceJob([BRAKES[0], { ...BRAKES[1], unitCostMinor: 4000n }, BRAKES[2]], NGA).lines
    const other = priceJob([BRAKES[0], { ...BRAKES[1], partNumber: 'D1234' }, BRAKES[2]], NGA).lines
    const used = priceJob([BRAKES[0], { ...BRAKES[1], condition: 'used' }, BRAKES[2]], NGA).lines
    expect(identityHash(cheaper)).toBe(identityHash(a))
    expect(identityHash(other)).not.toBe(identityHash(a))
    expect(identityHash(used)).not.toBe(identityHash(a))
  })
})
