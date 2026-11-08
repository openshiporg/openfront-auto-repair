/**
 * Parts supplier adapters (INTEGRATIONS §3). Business code depends on `SupplierAdapter`, never on a
 * provider module. `manual` is the default: staff phone, walk up or use a supplier's website and
 * record what they were told. `fixture` serves three sandbox suppliers with a small catalog so the
 * whole flow (quote, order, receive, invoice) can be exercised without a licensed integration.
 * Licensed catalogs (PartsTech, Nexpart) plug in here later.
 */

export type QuoteRequest = { partNumber: string; brand?: string; quantityMilli: number }
export type SupplierQuote = {
  partNumber: string; brand: string; description: string; unitCostMinor: bigint; listPriceMinor: bigint; coreChargeMinor: bigint
  availableQuantityMilli: number; availability: 'in_stock_local' | 'in_stock_dc' | 'special_order' | 'unavailable'; etaHours: number; location: string
}
export type PlaceRequest = { reference: string; lines: { partNumber: string; quantityMilli: number; unitCostMinor: bigint }[] }
export type PlaceResult = { supplierOrderId: string }
export type OrderStatus = { state: 'placed' | 'not_found'; supplierOrderId?: string }

/** A transport failure where the supplier may or may not have taken the order. The caller must not send again. */
export class AmbiguousSendError extends Error {
  constructor(message = 'The supplier did not answer.') { super(message); this.name = 'AmbiguousSendError' }
}

export interface SupplierAdapter {
  readonly name: 'manual' | 'fixture'
  quote(request: QuoteRequest): Promise<SupplierQuote | null>
  placeOrder(request: PlaceRequest): Promise<PlaceResult>
  orderStatus(reference: string): Promise<OrderStatus>
}

type CatalogEntry = Omit<SupplierQuote, 'availableQuantityMilli' | 'availability' | 'etaHours' | 'location'>
const CATALOG: Record<string, CatalogEntry> = {
  P06075: { partNumber: 'P06075', brand: 'Brembo', description: 'Front brake pad set, ceramic', unitCostMinor: 4800n, listPriceMinor: 8900n, coreChargeMinor: 0n },
  '09.C394.13': { partNumber: '09.C394.13', brand: 'Brembo', description: 'Front brake rotor, vented', unitCostMinor: 6500n, listPriceMinor: 11900n, coreChargeMinor: 0n },
  '5W30-5QT': { partNumber: '5W30-5QT', brand: 'Mobil 1', description: 'Full synthetic 5W-30, 5 quart jug', unitCostMinor: 2650n, listPriceMinor: 3999n, coreChargeMinor: 0n },
  'CF10285': { partNumber: 'CF10285', brand: 'Fram', description: 'Cabin air filter', unitCostMinor: 1150n, listPriceMinor: 2299n, coreChargeMinor: 0n },
  'ALT-11481': { partNumber: 'ALT-11481', brand: 'Bosch', description: 'Alternator, remanufactured', unitCostMinor: 18900n, listPriceMinor: 31900n, coreChargeMinor: 4500n },
  'BAT-H6-AGM': { partNumber: 'BAT-H6-AGM', brand: 'Interstate', description: 'AGM battery, group H6', unitCostMinor: 16400n, listPriceMinor: 24900n, coreChargeMinor: 2200n },
  'XPS-22545R17': { partNumber: 'XPS-22545R17', brand: 'Michelin', description: 'Tire 225/45R17 94W Pilot Sport', unitCostMinor: 17900n, listPriceMinor: 24900n, coreChargeMinor: 0n },
  'KYB-339370': { partNumber: 'KYB-339370', brand: 'KYB', description: 'Front strut assembly, complete', unitCostMinor: 8800n, listPriceMinor: 13900n, coreChargeMinor: 0n },
}

type FixtureProfile = { markupBasisPoints: number; availability: SupplierQuote['availability']; etaHours: number; location: string; carries: (partNumber: string) => boolean }
const PROFILES: Record<string, FixtureProfile> = {
  'Capitol Auto Parts': { markupBasisPoints: 0, availability: 'in_stock_local', etaHours: 2, location: 'Capitol Auto Parts, Sacramento counter', carries: p => p !== 'XPS-22545R17' },
  'Valley Warehouse Distributing': { markupBasisPoints: -400, availability: 'in_stock_dc', etaHours: 20, location: 'Valley Warehouse, West Sacramento DC', carries: p => p !== 'BAT-H6-AGM' },
  'Sierra Tire Supply': { markupBasisPoints: 250, availability: 'special_order', etaHours: 30, location: 'Sierra Tire Supply, Rancho Cordova', carries: p => p === 'XPS-22545R17' },
}

/** What the sandbox suppliers know about orders sent to them. Process memory: enough for the fixture, never for production. */
const received = new Map<string, { supplierOrderId: string; times: number }>()
export const fixtureOrdersReceived = (reference: string) => received.get(reference)?.times ?? 0
export function resetFixtureSuppliers() { received.clear() }

export function fixtureAdapter(supplierName: string): SupplierAdapter {
  const profile = PROFILES[supplierName]
  return {
    name: 'fixture',
    async quote(request) {
      const entry = CATALOG[request.partNumber]
      if (!entry || !profile?.carries(request.partNumber)) return null
      const adjusted = (entry.unitCostMinor * BigInt(10_000 + profile.markupBasisPoints) + 5000n) / 10_000n
      return { ...entry, unitCostMinor: adjusted, availableQuantityMilli: 24_000, availability: profile.availability, etaHours: profile.etaHours, location: profile.location }
    },
    async placeOrder(request) {
      const seen = received.get(request.reference)
      const supplierOrderId = seen?.supplierOrderId ?? `${supplierName.split(' ').map(w => w[0]).join('')}-${100000 + received.size + 1}`
      received.set(request.reference, { supplierOrderId, times: (seen?.times ?? 0) + 1 })
      // The supplier took the order, and the answer never came back.
      if (request.lines.some(l => l.partNumber === 'KYB-339370')) throw new AmbiguousSendError('The supplier did not answer in time.')
      return { supplierOrderId }
    },
    async orderStatus(reference) {
      const seen = received.get(reference)
      return seen ? { state: 'placed', supplierOrderId: seen.supplierOrderId } : { state: 'not_found' }
    },
  }
}

const refused = (what: string) => async (): Promise<never> => { throw new Error(`${what} is done by phone or at the counter for this supplier. Record what they told you.`) }

export function manualAdapter(): SupplierAdapter {
  return { name: 'manual', quote: async () => null, placeOrder: refused('Placing an order'), orderStatus: refused('Checking an order') }
}

export function supplierAdapter(adapter: string, supplierName: string): SupplierAdapter {
  return adapter === 'fixture' ? fixtureAdapter(supplierName) : manualAdapter()
}

export const FIXTURE_SUPPLIERS = [
  { name: 'Capitol Auto Parts', kind: 'parts_store', phone: '(916) 555-0141', email: 'counter@capitolautoparts.example', website: 'https://capitolautoparts.example', coreReturnWindowDays: 30, priceToleranceMinor: 25n, preferred: true },
  { name: 'Valley Warehouse Distributing', kind: 'warehouse_distributor', phone: '(916) 555-0178', email: 'orders@valleywarehouse.example', website: 'https://valleywarehouse.example', coreReturnWindowDays: 45, priceToleranceMinor: 50n, preferred: false },
  { name: 'Sierra Tire Supply', kind: 'tire_distributor', phone: '(916) 555-0193', email: 'dispatch@sierratiresupply.example', website: 'https://sierratiresupply.example', coreReturnWindowDays: 30, priceToleranceMinor: 100n, preferred: false },
] as const
