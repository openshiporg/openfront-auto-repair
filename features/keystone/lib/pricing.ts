import { dec, Decimal, ONE, toScale, ZERO } from './decimal'
import { canonicalJson, sha256 } from './canonical'
import { sumMinor } from './money'
import { DomainError, Codes } from './errors'

/*
 * Job pricing (STATE-MACHINES §8). Pure: the caller loads the pinned policy versions and the job's
 * lines; this returns every computed field, the fee lines, the totals, the problems that stop the
 * job being offered, and the content hash an authorization binds to.
 *
 * Rounding: each amount is computed exactly with decimal.js and rounded half-even once, to the
 * cent, per line (TaxRuleSetVersion.rounding = per_line; per_invoice_category rounds per tax
 * category and spreads the cents back by largest remainder).
 */

export type LineKind = 'labor' | 'part' | 'fee' | 'sublet' | 'tire' | 'core' | 'discount' | 'refrigerant'

/** What a person (or a canned job) entered. Computed fields are never taken from input. */
export type LineInput = {
  ref: string
  kind: LineKind
  description: string
  // labor
  rateClassCode?: string | null
  soldCentiHours?: number | null
  guideCentiHours?: number | null
  overlapCentiHours?: number | null
  fabrication?: boolean | null
  operationCode?: string | null
  // part, tire, core, refrigerant
  partNumber?: string | null
  brand?: string | null
  partCategory?: string | null
  condition?: string | null
  quantityMilli?: number | null
  unitCostMinor?: bigint | null
  /** A price typed over the matrix. Below the margin floor it needs canApprovePriceOverride. */
  unitPriceOverrideMinor?: bigint | null
  isNewTire?: boolean | null
  // sublet (I-R10)
  subletVendorName?: string | null
  subletCostMinor?: bigint | null
  subletPriceMinor?: bigint | null
  // discount
  discountMinor?: bigint | null
  discountTargetRef?: string | null
}

export type RateClass = { id: string; code: string; rateMinor: bigint; taxCategoryCode: string; isDefault: boolean }
export type PartsTier = { minCostMinor: string; maxCostMinor: string | null; multiplier: string }
export type FeeRuleRow = {
  id: string; code: string; kind: string; base: string; percent: string | null; flatMinor: bigint | null; perUnitMinor: bigint | null
  minMinor: bigint | null; maxMinor: bigint | null; itemCategory: string; taxTreatment: string; refundable: boolean; invoiceText: string
}
export type TaxRuleRow = { categoryCode: string; categoryId: string; taxable: boolean; rate: string }

export type PricingPolicy = {
  rateClasses: RateClass[]
  laborMatrix: { bands: { minCentiHours?: number; maxCentiHours?: number | null; factor: string }[]; appliesToClasses: string[] }
  partsMatrix: { tiers: PartsTier[]; categoryOverrides: Record<string, string>; marginFloorPct: string }
  feeRules: FeeRuleRow[]
  taxRules: TaxRuleRow[]
  taxRounding: 'per_line' | 'per_invoice_category'
  law: { requirePartCondition: boolean; shopSuppliesGenericAllowed: boolean; subletDisclosureRequired: boolean }
}

export type PricedLine = {
  ref: string
  kind: LineKind
  auto: boolean
  description: string
  rateClassCode: string | null
  rateMinor: bigint
  soldCentiHours: number
  guideCentiHours: number
  overlapCentiHours: number
  partNumber: string
  brand: string
  partCategory: string
  condition: string | null
  quantityMilli: number
  unitCostMinor: bigint
  unitPriceMinor: bigint
  matrixTier: { multiplier: string; source: 'tier' | 'category' | 'override'; belowFloor: boolean } | null
  isNewTire: boolean
  subletVendorName: string
  subletCostMinor: bigint
  feeRuleId: string | null
  feeCode: string
  taxCategoryCode: string
  taxable: boolean
  taxRate: string
  extendedMinor: bigint
  taxMinor: bigint
}

export type JobPrice = {
  lines: PricedLine[]
  laborMinor: bigint
  partsMinor: bigint
  subletMinor: bigint
  feesMinor: bigint
  discountMinor: bigint
  subtotalMinor: bigint
  taxMinor: bigint
  totalMinor: bigint
  costMinor: bigint
  marginMinor: bigint
  problems: string[]
  belowFloor: string[]
  contentHash: string
}

export const PART_CONDITIONS = ['new', 'used', 'rebuilt', 'reconditioned', 'oem_crash', 'non_oem_aftermarket_crash']
const PART_KINDS: LineKind[] = ['part', 'tire', 'core', 'refrigerant']

/** cents × fraction, rounded half-even once. */
const roundMinor = (value: Decimal) => BigInt(toScale(value, 0))
const qty = (milli: number) => dec(milli).div(1000)

export function partsMultiplier(matrix: PricingPolicy['partsMatrix'], unitCostMinor: bigint, category: string): { multiplier: string; source: 'tier' | 'category' } {
  const override = category ? matrix.categoryOverrides?.[category] : undefined
  if (override) return { multiplier: override, source: 'category' }
  const tier = matrix.tiers.find(t => unitCostMinor >= BigInt(t.minCostMinor) && (t.maxCostMinor === null || t.maxCostMinor === undefined || unitCostMinor < BigInt(t.maxCostMinor)))
  if (!tier) throw new DomainError(Codes.POLICY_INVALID, `The parts matrix has no tier for a cost of ${unitCostMinor} cents.`)
  return { multiplier: tier.multiplier, source: 'tier' }
}

/** The lowest unit price that keeps the margin floor: cost / (1 - floor), rounded up to the cent. */
export function floorPriceMinor(unitCostMinor: bigint, marginFloorPct: string): bigint {
  const floor = dec(marginFloorPct)
  if (floor.gte(1)) return unitCostMinor
  return BigInt(toScale(dec(unitCostMinor).div(ONE.minus(floor)), 0, Decimal.ROUND_CEIL))
}

function laborFactor(policy: PricingPolicy, rateClassCode: string, centiHours: number): Decimal {
  const m = policy.laborMatrix
  if (!m.bands?.length) return ONE
  if (m.appliesToClasses?.length && !m.appliesToClasses.includes(rateClassCode)) return ONE
  const band = m.bands.find(b => centiHours >= (b.minCentiHours ?? 0) && (b.maxCentiHours === null || b.maxCentiHours === undefined || centiHours < b.maxCentiHours))
  return band ? dec(band.factor) : ONE
}

const FEE_TAX_CATEGORY: Record<string, string> = { ca_tire_fee: 'fee_tire', ca_battery_fee: 'fee_battery', battery_deposit: 'battery_deposit' }

/** Units of an item category on the job: new tires, lead-acid batteries. Whole units only. */
function unitsOf(lines: PricedLine[], itemCategory: string) {
  const matching = lines.filter(l => {
    if (itemCategory === 'tire_new') return l.kind === 'tire' && l.isNewTire && (l.condition ?? 'new') === 'new'
    return PART_KINDS.includes(l.kind) && l.kind !== 'core' && l.partCategory === itemCategory
  })
  return matching.reduce((n, l) => n + Math.floor(l.quantityMilli / 1000), 0)
}

export function priceJob(inputs: LineInput[], policy: PricingPolicy): JobPrice {
  const problems: string[] = []
  const belowFloor: string[] = []
  const tax = new Map(policy.taxRules.map(r => [r.categoryCode, r]))
  const defaultClass = policy.rateClasses.find(c => c.isDefault) ?? policy.rateClasses[0]
  const lines: PricedLine[] = []

  const base = (input: LineInput): PricedLine => ({
    ref: input.ref, kind: input.kind, auto: false, description: String(input.description ?? '').trim(), rateClassCode: null, rateMinor: 0n,
    soldCentiHours: 0, guideCentiHours: input.guideCentiHours ?? 0, overlapCentiHours: input.overlapCentiHours ?? 0,
    partNumber: input.partNumber?.trim() ?? '', brand: input.brand?.trim() ?? '', partCategory: input.partCategory?.trim() ?? '',
    condition: input.condition ?? null, quantityMilli: input.quantityMilli ?? 1000, unitCostMinor: input.unitCostMinor ?? 0n, unitPriceMinor: 0n, matrixTier: null,
    isNewTire: Boolean(input.isNewTire), subletVendorName: input.subletVendorName?.trim() ?? '', subletCostMinor: input.subletCostMinor ?? 0n,
    feeRuleId: null, feeCode: '', taxCategoryCode: '', taxable: false, taxRate: '0.000000', extendedMinor: 0n, taxMinor: 0n,
  })

  for (const input of inputs) {
    const line = base(input)
    if (!line.description) problems.push(`${input.ref}: describe the line.`)
    switch (input.kind) {
      case 'labor': {
        const cls = input.rateClassCode ? policy.rateClasses.find(c => c.code === input.rateClassCode) : defaultClass
        if (!cls) { problems.push(`${input.ref}: labor rate class ${input.rateClassCode} is not in this repair order's rates.`); break }
        const hours = input.soldCentiHours ?? 0
        if (!Number.isInteger(hours) || hours <= 0) problems.push(`${input.ref}: labor needs sold hours above zero.`)
        line.rateClassCode = cls.code
        line.rateMinor = cls.rateMinor
        line.soldCentiHours = Math.max(0, hours)
        line.taxCategoryCode = input.fabrication ? 'labor_fabrication' : cls.taxCategoryCode || 'labor_repair'
        line.extendedMinor = roundMinor(dec(cls.rateMinor).times(line.soldCentiHours).div(100).times(laborFactor(policy, cls.code, line.soldCentiHours)))
        break
      }
      case 'part': case 'tire': case 'core': case 'refrigerant': {
        if (!Number.isInteger(line.quantityMilli) || line.quantityMilli <= 0) problems.push(`${input.ref}: quantity must be above zero.`)
        if (input.unitCostMinor === null || input.unitCostMinor === undefined) problems.push(`${input.ref}: enter the part cost (a quote or stock cost).`)
        if (input.kind !== 'core' && policy.law.requirePartCondition && !(line.condition && PART_CONDITIONS.includes(line.condition))) problems.push(`${input.ref}: part condition (new, used, rebuilt or reconditioned) is required.`)
        if (input.kind === 'tire') line.partCategory = line.partCategory || 'tires'
        const category = input.kind === 'tire' ? 'tires' : line.partCategory
        if (input.kind === 'core') {
          // A core charge is passed through at its price; it is refunded when the old part comes back.
          line.unitPriceMinor = input.unitPriceOverrideMinor ?? line.unitCostMinor
          line.matrixTier = { multiplier: '1', source: 'override', belowFloor: false }
        } else {
          const { multiplier, source } = partsMultiplier(policy.partsMatrix, line.unitCostMinor, category)
          const matrixPrice = roundMinor(dec(line.unitCostMinor).times(dec(multiplier)))
          if (input.unitPriceOverrideMinor !== null && input.unitPriceOverrideMinor !== undefined) {
            const floor = floorPriceMinor(line.unitCostMinor, policy.partsMatrix.marginFloorPct)
            const below = input.unitPriceOverrideMinor < floor
            if (below) belowFloor.push(input.ref)
            line.unitPriceMinor = input.unitPriceOverrideMinor
            line.matrixTier = { multiplier, source: 'override', belowFloor: below }
          } else {
            line.unitPriceMinor = matrixPrice
            line.matrixTier = { multiplier, source, belowFloor: false }
          }
        }
        line.taxCategoryCode = input.kind === 'tire' ? 'tires' : 'parts'
        line.extendedMinor = roundMinor(dec(line.unitPriceMinor).times(qty(line.quantityMilli)))
        break
      }
      case 'sublet': {
        if (!line.subletVendorName && policy.law.subletDisclosureRequired) problems.push(`${input.ref}: name the sublet shop (it is printed on the estimate).`)
        const price = input.subletPriceMinor ?? input.subletCostMinor ?? null
        if (price === null) problems.push(`${input.ref}: enter the sublet price.`)
        line.unitPriceMinor = price ?? 0n
        line.taxCategoryCode = 'sublet_labor'
        line.extendedMinor = line.unitPriceMinor
        break
      }
      case 'discount': {
        const amount = input.discountMinor ?? 0n
        if (amount <= 0n) problems.push(`${input.ref}: a discount needs an amount above zero.`)
        const target = lines.find(l => l.ref === input.discountTargetRef)
        if (!target) problems.push(`${input.ref}: choose the line the discount applies to.`)
        line.taxCategoryCode = target?.taxCategoryCode ?? 'parts'
        line.extendedMinor = -amount
        break
      }
      case 'fee': {
        // Fees are computed from the fee policy only; a typed "fee" line is refused (CA: no generic shop supplies).
        if (/suppl/i.test(line.description) && !policy.law.shopSuppliesGenericAllowed) {
          throw new DomainError(Codes.SHOP_SUPPLIES_PROHIBITED, "This state's rules don't allow a generic shop-supplies charge. Add the supplies as itemised parts.", { field: 'kind' })
        }
        problems.push(`${input.ref}: fees come from the fee policy; add the item they apply to instead.`)
        break
      }
    }
    lines.push(line)
  }

  // Fees from the pinned fee policy (only rules this jurisdiction allows were publishable).
  for (const rule of policy.feeRules) {
    if (rule.code === 'shop_supplies_pct' && !policy.law.shopSuppliesGenericAllowed) continue
    let amount: bigint | null = null
    let units = 0
    if (rule.kind === 'per_unit' && rule.perUnitMinor !== null) {
      units = unitsOf(lines, rule.itemCategory)
      if (units > 0) amount = rule.perUnitMinor * BigInt(units)
    } else if (rule.kind === 'percent_of_base' && rule.percent) {
      const baseMinor = sumMinor(lines.filter(l => (rule.base === 'labor' ? l.kind === 'labor' : rule.base === 'parts' ? PART_KINDS.includes(l.kind) : l.kind === 'labor' || PART_KINDS.includes(l.kind))).map(l => l.extendedMinor))
      if (baseMinor > 0n) {
        amount = roundMinor(dec(baseMinor).times(dec(rule.percent)))
        if (rule.minMinor !== null && amount < rule.minMinor) amount = rule.minMinor
        if (rule.maxMinor !== null && amount > rule.maxMinor) amount = rule.maxMinor
      }
    }
    // flat_per_ro fees are charged once on the invoice (Phase 3), not per job.
    if (amount === null || amount === 0n) continue
    const category = FEE_TAX_CATEGORY[rule.code] ?? (rule.taxTreatment === 'taxable' ? 'parts' : '')
    const line = base({ ref: `fee:${rule.code}`, kind: 'fee', description: rule.invoiceText || rule.code })
    Object.assign(line, { auto: true, feeRuleId: rule.id, feeCode: rule.code, quantityMilli: units ? units * 1000 : 1000, unitPriceMinor: units ? rule.perUnitMinor! : amount, extendedMinor: amount, taxCategoryCode: category })
    if (rule.taxTreatment === 'non_taxable') line.taxCategoryCode = category || 'fee_tire'
    lines.push(line)
  }

  // Tax by category from the pinned tax rules.
  for (const line of lines) {
    const rule = tax.get(line.taxCategoryCode)
    if (!rule) { problems.push(`${line.ref}: no tax rule for category ${line.taxCategoryCode || '(none)'}.`); continue }
    line.taxable = rule.taxable
    line.taxRate = rule.taxable ? toScale(rule.rate, 'pct') : '0.000000'
  }
  if (policy.taxRounding === 'per_invoice_category') {
    const byCategory = new Map<string, PricedLine[]>()
    for (const l of lines.filter(x => x.taxable)) byCategory.set(l.taxCategoryCode, [...(byCategory.get(l.taxCategoryCode) ?? []), l])
    for (const group of byCategory.values()) {
      const exact = group.map(l => dec(l.extendedMinor).times(dec(l.taxRate)))
      const total = roundMinor(exact.reduce((a, b) => a.plus(b), ZERO))
      // Spread the rounded category total back to lines: each line's floor, then the leftover cents by largest remainder.
      const floors = exact.map(x => BigInt(toScale(x, 0, Decimal.ROUND_FLOOR)))
      let leftover = total - sumMinor(floors)
      const order = exact.map((x, i) => ({ i, r: x.minus(x.floor()) })).sort((a, b) => b.r.comparedTo(a.r) || a.i - b.i)
      for (let k = 0; leftover > 0n; k = (k + 1) % order.length, leftover -= 1n) floors[order[k].i] += 1n
      group.forEach((l, i) => { l.taxMinor = floors[i] })
    }
  } else {
    for (const line of lines) line.taxMinor = line.taxable ? roundMinor(dec(line.extendedMinor).times(dec(line.taxRate))) : 0n
  }

  const sumKind = (kinds: LineKind[]) => sumMinor(lines.filter(l => kinds.includes(l.kind)).map(l => l.extendedMinor))
  const subtotalMinor = sumMinor(lines.map(l => l.extendedMinor))
  const taxMinor = sumMinor(lines.map(l => l.taxMinor))
  const costMinor = sumMinor(lines.filter(l => PART_KINDS.includes(l.kind)).map(l => roundMinor(dec(l.unitCostMinor).times(qty(l.quantityMilli))))) + sumMinor(lines.filter(l => l.kind === 'sublet').map(l => l.subletCostMinor))
  const result: JobPrice = {
    lines,
    laborMinor: sumKind(['labor']),
    partsMinor: sumKind(['part', 'tire', 'core', 'refrigerant']),
    subletMinor: sumKind(['sublet']),
    feesMinor: sumKind(['fee']),
    discountMinor: -sumKind(['discount']),
    subtotalMinor,
    taxMinor,
    totalMinor: subtotalMinor + taxMinor,
    costMinor,
    // Gross margin before labor cost (technician pay is Phase 5).
    marginMinor: subtotalMinor - sumKind(['fee']) - costMinor,
    problems,
    belowFloor,
    contentHash: '',
  }
  result.contentHash = jobContentHash(result)
  return result
}

/**
 * What the customer agrees to: each line's identity, quantity, price and tax, and the totals.
 * Cost, margin and ids are excluded, so re-pricing the same content gives the same hash.
 */
export function jobContentHash(price: Pick<JobPrice, 'lines' | 'subtotalMinor' | 'taxMinor' | 'totalMinor'>) {
  return sha256(canonicalJson({
    lines: price.lines.map(l => ({
      kind: l.kind, description: l.description, rateClass: l.rateClassCode, rate: l.rateMinor, hours: l.soldCentiHours, partNumber: l.partNumber, brand: l.brand,
      condition: l.condition, quantityMilli: l.quantityMilli, unitPrice: l.unitPriceMinor, sublet: l.subletVendorName, fee: l.feeCode, taxCategory: l.taxCategoryCode,
      extended: l.extendedMinor, tax: l.taxMinor,
    })),
    subtotal: price.subtotalMinor, tax: price.taxMinor, total: price.totalMinor,
  }))
}

/** Line identities whose change needs a new authorization even under the ceiling (I-R5): part number, condition, method. */
export const identityHash = (lines: Pick<PricedLine, 'kind' | 'description' | 'partNumber' | 'condition' | 'rateClassCode' | 'subletVendorName'>[]) =>
  sha256(canonicalJson(lines.map(l => [l.kind, l.description, l.partNumber, l.condition, l.rateClassCode, l.subletVendorName]).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))))
