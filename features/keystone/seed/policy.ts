import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import type { UnitOfWork } from '../lib/unitOfWork'
import { applyPublish, contentHash, policyContent, POLICY_KINDS, type PolicyKind } from '../lib/policy'

/*
 * Policy seed (BUILD-PLAN §5, §8). Every version is created as a draft and published through
 * applyPublish, so the seed runs the same validation and pointer updates as the dashboard.
 *
 * Sources checked on 2026-11-07 (BUILD-PLAN §8):
 * - CA rules: 16 CCR §§3353-3358 (fetched).
 * - Sales tax: CDTFA "Tax Rates Effective October 1, 2026" (SalesTaxRates10-1-26.xlsx): Sacramento (city) 8.750%,
 *   Roseville 7.750%. Repair labor is not taxable; parts are (CDTFA Publication 25).
 * - California tire fee $1.75 per new tire since 2005-01-01; California battery fee $2.00 per replacement
 *   lead-acid battery since 2022-04-01 (CDTFA special taxes and fees rates page). Both separately stated and
 *   not taxable; the retailer keeps 1.5% of each (Publication 25).
 * - The lead-acid battery deposit is refundable within 45 days and taxable (Publication 25); its amount is
 *   set outside Publication 25 and is marked "placeholder rate" until checked (BUILD-PLAN §8 V2).
 * - Non-CA packs come from the RepairWorth state dataset (RESEARCH §5.2) and stay unverified (V1).
 */

const SOURCES_CA = [
  { title: '16 CCR §§3353-3358 (Bureau of Automotive Repair)', url: 'https://www.bar.ca.gov/', note: 'Estimates, authorization, invoices, replaced parts. Fetched 2026-11-07.' },
  { title: 'CDTFA Publication 25 (June 2026)', url: 'https://www.cdtfa.ca.gov/formspubs/pub25.pdf', note: 'Labor not taxable; tire and battery fees; deposit; 1.5% retained.' },
  { title: 'CDTFA sales and use tax rates effective 2026-10-01', url: 'https://www.cdtfa.ca.gov/taxes-and-fees/sales-use-tax-rates.htm', note: 'Sacramento 8.750%, Roseville 7.750%.' },
  { title: 'CDTFA special taxes and fees rates', url: 'https://www.cdtfa.ca.gov/taxes-and-fees/special-taxes-and-fees-tax-rates/', note: 'Tire fee $1.75 (2005); California battery fee $2.00 (2022-04-01).' },
]

/** Paraphrased for staff and customers; the regulation is the authority. */
const CA_NOTICES = [
  { key: 'estimate_right', where: 'work_order', text: 'You are entitled to a written estimate before work begins. We will not do any work, or charge more than the estimate, without your consent.' },
  { key: 'estimate_right', where: 'estimate', text: 'This is a written estimate. We will not do work that is not listed here, or charge more than the total shown, unless you authorize it first.' },
  { key: 'part_condition', where: 'invoice', text: 'Each part is identified as new, used, rebuilt or reconditioned. Crash parts are identified as OEM or non-OEM.' },
  { key: 'registration', where: 'invoice', text: 'Licensed by the Bureau of Automotive Repair. Automotive Repair Dealer registration number shown above.' },
]

type PackSeed = {
  code: string; name: string; region: string; verified: boolean; sourceRefs: unknown[]
  law: Record<string, unknown>
}

const BASE_LAW = {
  allowedAuthorizationMethods: ['in_person_signature', 'written_form', 'oral_phone', 'electronic_link', 'fleet_portal', 'fleet_po'],
  authorizationEvidenceRules: { oral_phone: ['personName', 'phoneNumber', 'at', 'amountMinor', 'staffUserId'], electronic_link: ['ip', 'userAgent', 'consentText', 'at'] },
  requireOdometerIn: true, requireOdometerOut: true, requireSignedWorkOrder: true, requirePartCondition: true, crashPartOemDefault: true,
  replacedPartsOfferRequired: true, replacedPartsOfferText: 'You may ask for your replaced parts back when you authorize the work, except parts returned under a warranty or core exchange.',
  nonReturnableNoteText: 'Parts returned under warranty or core exchange can be inspected here on request.',
  teardownRules: { required: true, maxReassemblyDaysDefault: 3, disclosureText: 'If you decline the repair after teardown, we will reassemble the vehicle within the time shown, for the reassembly charge shown.' },
  designeeRules: { allowed: true, evidence: ['name', 'relationship', 'contact'] },
  thirdPartyPayorNoticeText: 'Your insurer or warranty company may pay part of this repair. You remain responsible for any amount they do not pay.',
  towingSeparateAuthorization: true, subletDisclosureRequired: true,
  invoiceRequiredFields: ['registrationNumber', 'odometerIn', 'odometerOut', 'partCondition', 'laborDescription', 'subtotalParts', 'subtotalLabor', 'tax'],
  surchargeAllowed: false,
}

export const PACKS: PackSeed[] = [
  {
    code: 'US-CA', name: 'California', region: 'CA', verified: true, sourceRefs: SOURCES_CA,
    law: { ...BASE_LAW, estimateThresholdMinor: null, writtenEstimateWaiverAllowed: false, toleranceRule: { kind: 'fixed', fixedMinor: '0', includesTax: true }, shopSuppliesGenericAllowed: false, recordRetentionYears: 4, requiredNotices: CA_NOTICES, notes: 'California: written estimate for every job; no charge above the authorized amount.' },
  },
  {
    code: 'US-FL', name: 'Florida', region: 'FL', verified: false, sourceRefs: [{ title: 'Fla. Stat. §§559.904-.909', note: 'From the RepairWorth state dataset; not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: 15000n, writtenEstimateWaiverAllowed: true, waiverFormText: 'I do not want a written estimate.', toleranceRule: { kind: 'max_of', percent: '0.10', fixedMinor: '1000', capMinor: '5000', includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 1, requiredNotices: [] },
  },
  {
    code: 'US-IL', name: 'Illinois', region: 'IL', verified: false, sourceRefs: [{ title: '815 ILCS 306', note: 'From the RepairWorth state dataset; not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: 10000n, writtenEstimateWaiverAllowed: true, toleranceRule: { kind: 'percent', percent: '0.10', includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [] },
  },
  {
    code: 'US-MI', name: 'Michigan', region: 'MI', verified: false, sourceRefs: [{ title: 'MCL 257.1332', note: 'From the RepairWorth state dataset; not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: 'min_of', percent: '0.10', fixedMinor: '5000', includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [] },
  },
  {
    code: 'US-NY', name: 'New York', region: 'NY', verified: false, sourceRefs: [{ title: 'VTL §§398-c, 398-d; 15 NYCRR 82', note: 'From the RepairWorth state dataset; not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: 'fixed', fixedMinor: '0', includesTax: true }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [] },
  },
  {
    code: 'US-OH', name: 'Ohio', region: 'OH', verified: false, sourceRefs: [{ title: 'OAC 109:4-3-13', note: 'From the RepairWorth state dataset; not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: 5000n, writtenEstimateWaiverAllowed: true, toleranceRule: { kind: 'percent', percent: '0.10', includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 1, requiredNotices: [] },
  },
  {
    code: 'US-WA', name: 'Washington', region: 'WA', verified: false, sourceRefs: [{ title: 'RCW 46.71.025', note: 'From the RepairWorth state dataset; not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: 'percent', percent: '0.10', includesTax: false }, shopSuppliesGenericAllowed: true, recordRetentionYears: 3, requiredNotices: [] },
  },
  {
    code: 'US-TX', name: 'Texas', region: 'TX', verified: false, sourceRefs: [{ title: 'Occ. Code ch. 2304', note: 'Covers body (non-mechanical) repair only; mechanical repair follows shop policy. Not yet re-verified.' }],
    law: { ...BASE_LAW, estimateThresholdMinor: null, toleranceRule: { kind: 'fixed', fixedMinor: '0', includesTax: true }, shopSuppliesGenericAllowed: true, recordRetentionYears: 2, requiredNotices: [], notes: 'No statewide mechanical repair estimate rule; the strictest setting (no tolerance) is the default.' },
  },
]

export const TAX_CATEGORIES = [
  { code: 'labor_repair', name: 'Repair labor', description: 'Labor to repair or install. Not taxable in California.' },
  { code: 'labor_fabrication', name: 'Fabrication labor', description: 'Labor to make a new part. Taxable in California.' },
  { code: 'parts', name: 'Parts', description: 'Tangible parts sold. Taxable.' },
  { code: 'tires', name: 'Tires', description: 'New tires. Taxable (the tire fee is not).' },
  { code: 'fee_tire', name: 'California tire fee', description: 'Separately stated, not taxable.' },
  { code: 'fee_battery', name: 'California battery fee', description: 'Separately stated, not taxable.' },
  { code: 'battery_deposit', name: 'Battery deposit', description: 'Refundable deposit. Taxable; the tax is not refunded with the deposit.' },
  { code: 'sublet_labor', name: 'Sublet labor', description: 'Labor bought from another shop and resold. Follows the labor rule.' },
  { code: 'diagnostic', name: 'Diagnostic labor', description: 'Diagnosis time. Labor.' },
]

const TAXABLE: Record<string, boolean> = { labor_repair: false, labor_fabrication: true, parts: true, tires: true, fee_tire: false, fee_battery: false, battery_deposit: true, sublet_labor: false, diagnostic: false }

type ShopSeed = { id: string; code: string; taxRate: string; rates: { code: string; name: string; rateMinor: bigint; isDefault?: boolean }[] }

export const SHOP_POLICY: ShopSeed[] = [
  {
    id: 'seed_shop_nga', code: 'NGA', taxRate: '0.087500',
    rates: [
      { code: 'general', name: 'General repair', rateMinor: 16500n, isDefault: true },
      { code: 'diagnostic', name: 'Diagnostic', rateMinor: 18500n },
      { code: 'electrical', name: 'Electrical', rateMinor: 18500n },
      { code: 'european', name: 'European', rateMinor: 19500n },
      { code: 'fleet', name: 'Fleet', rateMinor: 15000n },
    ],
  },
  {
    id: 'seed_shop_ngt', code: 'NGT', taxRate: '0.077500',
    rates: [
      { code: 'general', name: 'General repair', rateMinor: 14500n, isDefault: true },
      { code: 'diagnostic', name: 'Diagnostic', rateMinor: 16500n },
      { code: 'fleet', name: 'Fleet', rateMinor: 13500n },
    ],
  },
]

/** Cost-plus parts matrix: lower-cost parts carry a higher multiplier. */
const PARTS_TIERS = [
  { minCostMinor: '0', maxCostMinor: '1000', multiplier: '2.500000' },
  { minCostMinor: '1000', maxCostMinor: '5000', multiplier: '2.000000' },
  { minCostMinor: '5000', maxCostMinor: '15000', multiplier: '1.750000' },
  { minCostMinor: '15000', maxCostMinor: '50000', multiplier: '1.500000' },
  { minCostMinor: '50000', maxCostMinor: null, multiplier: '1.350000' },
]

/** Placeholder deposit until BUILD-PLAN §8 V2 confirms the statutory amount. */
export const BATTERY_DEPOSIT_PLACEHOLDER_MINOR = 1200n

const delegate = (uow: UnitOfWork, name: string) => (uow.tx as unknown as Record<string, any>)[name]

/** Create a version as a draft with its rows, then publish it through applyPublish. Skips when a published version exists. */
async function seedVersion(uow: UnitOfWork, actor: Actor, kind: PolicyKind, headId: string, id: string, fields: Record<string, unknown>, children: Record<string, unknown>[] = []) {
  const spec = POLICY_KINDS[kind]
  if (await delegate(uow, spec.delegate).findFirst({ where: { [spec.head]: headId, status: { in: ['published', 'retired'] } }, select: { id: true } })) return false
  if (!(await delegate(uow, spec.delegate).findUnique({ where: { id }, select: { id: true } }))) {
    await delegate(uow, spec.delegate).create({ data: { id, [spec.head]: headId, versionNumber: 1, status: 'draft', notes: String(fields.notes ?? 'Seeded'), ...Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'notes')) } })
    for (const [i, child] of children.entries()) await delegate(uow, spec.children!.delegate).create({ data: { id: `${id}_${i + 1}`, ...child, [spec.children!.fk]: id } })
    auditCreate(uow, actor, spec.model, id, 'policy.draft_created', { kind, headId, versionNumber: 1 }, { metadata: { seed: true } })
  }
  const row = await delegate(uow, spec.delegate).findUnique({ where: { id } })
  const { content } = await policyContent(uow.tx, kind, id)
  await applyPublish(uow, actor, { kind, versionId: id, contentHash: contentHash(content), baseVersion: row.version })
  return true
}

/** Jurisdiction packs (published v1 each) and the shared tax categories. */
export async function seedJurisdictions(uow: UnitOfWork, actor: Actor) {
  const { tx } = uow
  const created: Record<string, number> = { packs: 0, taxCategories: 0, versions: 0 }

  for (const pack of PACKS) {
    const id = `seed_pack_${pack.region.toLowerCase()}`
    if (!(await tx.jurisdictionPack.findFirst({ where: { OR: [{ id }, { code: pack.code }] } }))) {
      await tx.jurisdictionPack.create({ data: { id, code: pack.code, name: pack.name, region: pack.region, country: 'US', verified: pack.verified, sourceRefs: pack.sourceRefs as never } })
      auditCreate(uow, actor, 'JurisdictionPack', id, 'policy.pack_created', { code: pack.code, verified: pack.verified }, { metadata: { seed: true } })
      created.packs += 1
    }
    const packId = (await tx.jurisdictionPack.findUniqueOrThrow({ where: { code: pack.code } })).id
    if (pack.code === 'US-CA') {
      // Shops in California follow the CA pack; the pointer moves with each published version.
      await tx.shop.updateMany({ where: { region: 'CA', jurisdictionPackId: null }, data: { jurisdictionPackId: packId } })
    }
    if (await seedVersion(uow, actor, 'jurisdiction', packId, `${id}_v1`, pack.law)) created.versions += 1
  }

  for (const cat of TAX_CATEGORIES) {
    if (await tx.taxCategory.findUnique({ where: { code: cat.code } })) continue
    await tx.taxCategory.create({ data: { id: `seed_tax_${cat.code}`, ...cat } })
    created.taxCategories += 1
  }
  return created
}

/** One shop's policy versions: shop policy, labor rates and matrix, parts matrix, fees, tax and warranty. */
export async function seedShopPolicy(uow: UnitOfWork, actor: Actor, shopId: string) {
  const { tx } = uow
  const created: Record<string, number> = { versions: 0 }
  const shop = SHOP_POLICY.find(s => s.id === shopId)
  if (!shop || !(await tx.shop.findUnique({ where: { id: shop.id }, select: { id: true } }))) return created
  const categories = Object.fromEntries((await tx.taxCategory.findMany({ select: { id: true, code: true } })).map(c => [c.code, c.id]))
  {
    const v = (kind: string) => `${shop.id}_${kind}_v1`
    const results = [
      await seedVersion(uow, actor, 'shop_policy', shop.id, v('policy'), {
        notes: 'Agents propose only; parts orders by agents are off ($0 limit).',
        agentAutonomy: { 'booking.propose': 'propose_only', 'message.draft': 'propose_only', 'parts.quote': 'propose_only', 'diagnosis.run': 'propose_only', record_authorization: 'off' },
      }),
      await seedVersion(uow, actor, 'labor_rates', shop.id, v('labor'), { notes: 'Posted hourly rates.' },
        shop.rates.map(r => ({ code: r.code, name: r.name, rateMinor: r.rateMinor, isDefault: Boolean(r.isDefault), taxCategoryId: categories[r.code === 'diagnostic' ? 'diagnostic' : 'labor_repair'] }))),
      await seedVersion(uow, actor, 'labor_matrix', shop.id, v('labor_matrix'), { notes: 'No labor matrix: book hours at the class rate.', bands: [], appliesToClasses: [] }),
      await seedVersion(uow, actor, 'parts_matrix', shop.id, v('parts'), { notes: 'Five-tier cost-plus matrix; 30% margin floor.', tiers: PARTS_TIERS, categoryOverrides: { tires: '1.250000' }, supplierOverrides: {}, marginFloorPct: '0.300000' }),
      await seedVersion(uow, actor, 'fees', shop.id, v('fees'), { notes: 'California tire and battery fees (CDTFA). Battery deposit amount: placeholder rate (BUILD-PLAN §8 V2).' }, [
        { code: 'ca_tire_fee', kind: 'per_unit', base: 'units_of_item_category', perUnitMinor: 175n, itemCategory: 'tire_new', taxTreatment: 'non_taxable', separatelyStated: true, refundable: false, invoiceText: 'California tire fee' },
        { code: 'ca_battery_fee', kind: 'per_unit', base: 'units_of_item_category', perUnitMinor: 200n, itemCategory: 'battery_lead_acid', taxTreatment: 'non_taxable', separatelyStated: true, refundable: false, invoiceText: 'California battery fee' },
        { code: 'battery_deposit', kind: 'per_unit', base: 'units_of_item_category', perUnitMinor: BATTERY_DEPOSIT_PLACEHOLDER_MINOR, itemCategory: 'battery_lead_acid', taxTreatment: 'taxable', separatelyStated: true, refundable: true, refundWindowDays: 45, invoiceText: 'Battery deposit (refunded when a used battery is returned within 45 days) - placeholder rate' },
      ]),
      await seedVersion(uow, actor, 'tax', shop.id, v('tax'), { notes: `CDTFA combined rate for ${shop.code === 'NGA' ? 'Sacramento' : 'Roseville'}, effective 2026-10-01.`, rounding: 'per_line' },
        Object.entries(TAXABLE).map(([code, taxable]) => ({ categoryId: categories[code], taxable, rate: taxable ? shop.taxRate : '0.000000', coreChargeRule: 'refund_refunds_tax', warrantyDeductibleRule: code === 'parts' ? 'parts_share' : 'none' }))),
      await seedVersion(uow, actor, 'warranty', shop.id, v('warranty'), { notes: 'Nationwide 24 months / 24,000 miles on parts and labor.' }, [
        { code: 'standard', name: '24 months / 24,000 miles', months: 24, miles: 24000, appliesTo: ['parts', 'labor'], invoiceText: 'Parts and labor are warranted for 24 months or 24,000 miles, whichever comes first.' },
        { code: 'tires', name: 'Tire road hazard 12 months', months: 12, miles: 12000, appliesTo: ['tires'], invoiceText: 'Road hazard coverage for 12 months or 12,000 miles.' },
      ]),
    ]
    created.versions += results.filter(Boolean).length
  }
  return created
}
