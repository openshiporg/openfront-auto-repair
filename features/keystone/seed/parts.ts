import type { Actor } from '../lib/actor'
import { auditCreate } from '../lib/cas'
import { postMovement, saveShopItem } from '../lib/stock'
import type { UnitOfWork } from '../lib/unitOfWork'
import { FIXTURE_SUPPLIERS } from '../../integrations/parts-supplier'

/**
 * Phase 4 demo data: three suppliers, the shelf items a general repair shop keeps, and opening stock
 * received through the ledger at what the shop paid. Create-only and keyed by name, so it runs once.
 */

const STOCKED = [
  { shop: 'seed_shop_nga', sku: 'OIL-5W30-QT', partNumber: '5W30-QT', brand: 'Mobil 1', description: 'Full synthetic 5W-30, per quart', category: 'oil', unitOfMeasure: 'quart', bin: 'A-01', min: 24_000, max: 96_000, onHand: 60_000, costMinor: 585n },
  { shop: 'seed_shop_nga', sku: 'FIL-OIL-PH3614', partNumber: 'PH3614', brand: 'Fram', description: 'Oil filter, spin-on', category: 'filters', unitOfMeasure: 'each', bin: 'A-04', min: 6_000, max: 24_000, onHand: 14_000, costMinor: 375n },
  { shop: 'seed_shop_nga', sku: 'FIL-CAB-CF10285', partNumber: 'CF10285', brand: 'Fram', description: 'Cabin air filter', category: 'filters', unitOfMeasure: 'each', bin: 'A-06', min: 4_000, max: 12_000, onHand: 3_000, costMinor: 1150n },
  { shop: 'seed_shop_nga', sku: 'BRK-PAD-P06075', partNumber: 'P06075', brand: 'Brembo', description: 'Front brake pad set, ceramic', category: 'brakes', unitOfMeasure: 'set', bin: 'B-02', min: 2_000, max: 8_000, onHand: 4_000, costMinor: 4800n },
  { shop: 'seed_shop_nga', sku: 'BRK-ROT-09C39413', partNumber: '09.C394.13', brand: 'Brembo', description: 'Front brake rotor, vented', category: 'brakes', unitOfMeasure: 'each', bin: 'B-03', min: 2_000, max: 8_000, onHand: 2_000, costMinor: 6500n },
  { shop: 'seed_shop_nga', sku: 'BAT-H6-AGM', partNumber: 'BAT-H6-AGM', brand: 'Interstate', description: 'AGM battery, group H6', category: 'batteries', unitOfMeasure: 'each', bin: 'C-01', min: 1_000, max: 4_000, onHand: 2_000, costMinor: 16400n, core: '2200' },
  { shop: 'seed_shop_nga', sku: 'WIP-24', partNumber: 'WB-24', brand: 'Bosch', description: 'Wiper blade, 24 in', category: 'wipers', unitOfMeasure: 'each', bin: 'D-02', min: 4_000, max: 10_000, onHand: 6_000, costMinor: 790n },
  { shop: 'seed_shop_ngt', sku: 'TIR-MICH-22545R17', partNumber: 'XPS-22545R17', brand: 'Michelin', description: 'Tire 225/45R17 94W Pilot Sport', category: 'tires', unitOfMeasure: 'each', bin: 'T-11', min: 4_000, max: 16_000, onHand: 8_000, costMinor: 17900n },
  { shop: 'seed_shop_ngt', sku: 'VLV-STEM-TR413', partNumber: 'TR413', brand: 'Schrader', description: 'Valve stem, snap-in', category: 'tires', unitOfMeasure: 'each', bin: 'T-02', min: 8_000, max: 40_000, onHand: 32_000, costMinor: 85n },
] as const

export async function seedParts(uow: UnitOfWork, actor: Actor) {
  const { tx } = uow
  const counts = { suppliers: 0, shopItems: 0, openingStock: 0 }
  const have = new Set((await tx.supplier.findMany({ select: { name: true } })).map(s => s.name))
  const byName = new Map<string, string>()
  for (const s of FIXTURE_SUPPLIERS) {
    if (have.has(s.name)) { byName.set(s.name, (await tx.supplier.findFirstOrThrow({ where: { name: s.name }, select: { id: true } })).id); continue }
    const row = await tx.supplier.create({
      data: { name: s.name, kind: s.kind, adapter: 'fixture', phone: s.phone, email: s.email, website: s.website, coreReturnWindowDays: s.coreReturnWindowDays, priceToleranceMinor: s.priceToleranceMinor, preferred: s.preferred, active: true },
    })
    auditCreate(uow, actor, 'Supplier', row.id, 'supplier.created', { name: s.name, kind: s.kind }, { metadata: { seed: true } })
    byName.set(s.name, row.id)
    counts.suppliers += 1
  }
  // A walk-in parts counter that is quoted by phone, to keep the manual path real.
  if (!have.has('Delta Brake & Clutch Supply')) {
    const row = await tx.supplier.create({ data: { name: 'Delta Brake & Clutch Supply', kind: 'specialty', adapter: 'manual', phone: '(916) 555-0127', coreReturnWindowDays: 30, priceToleranceMinor: 25n, active: true } })
    auditCreate(uow, actor, 'Supplier', row.id, 'supplier.created', { name: row.name, kind: 'specialty' }, { metadata: { seed: true } })
    counts.suppliers += 1
  }
  const preferred = byName.get('Capitol Auto Parts') ?? null
  for (const p of STOCKED) {
    if (await tx.shopItem.findFirst({ where: { shopId: p.shop, sku: p.sku }, select: { id: true } })) continue
    const made = await saveShopItem(uow, actor, {
      shopId: p.shop, sku: p.sku, partNumber: p.partNumber, brand: p.brand, description: p.description, category: p.category, unitOfMeasure: p.unitOfMeasure, isStocked: true, binLocation: p.bin,
      minQuantityMilli: p.min, maxQuantityMilli: p.max, preferredSupplierId: p.category === 'tires' ? byName.get('Sierra Tire Supply') ?? preferred : preferred, coreChargeMinor: 'core' in p ? p.core : null,
    })
    counts.shopItems += 1
    await postMovement(uow, actor, { shopItemId: made.id, type: 'receipt', quantityMilli: p.onHand, unitCostMinor: p.costMinor, key: `seed-opening:${p.shop}:${p.sku}`, reason: 'Opening stock' })
    counts.openingStock += 1
  }
  return counts
}
