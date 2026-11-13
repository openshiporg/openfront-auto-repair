import { AmbiguousSendError, type SupplierAdapter, type SupplierQuote } from './index'

/** TEST DATA ONLY, never imported by product code: an in-memory supplier for the order-flow tests. */

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

type TestProfile = { markupBasisPoints: number; availability: SupplierQuote['availability']; etaHours: number; location: string; carries: (partNumber: string) => boolean }
const PROFILES: Record<string, TestProfile> = {
  'Capitol Auto Parts': { markupBasisPoints: 0, availability: 'in_stock_local', etaHours: 2, location: 'Capitol Auto Parts, Sacramento counter', carries: p => p !== 'XPS-22545R17' },
  'Valley Warehouse Distributing': { markupBasisPoints: -400, availability: 'in_stock_dc', etaHours: 20, location: 'Valley Warehouse, West Sacramento DC', carries: p => p !== 'BAT-H6-AGM' },
  'Sierra Tire Supply': { markupBasisPoints: 250, availability: 'special_order', etaHours: 30, location: 'Sierra Tire Supply, Rancho Cordova', carries: p => p === 'XPS-22545R17' },
}

/** What the test supplier knows about orders sent to it. */
const received = new Map<string, { supplierOrderId: string; times: number }>()
export const testOrdersReceived = (reference: string) => received.get(reference)?.times ?? 0
export function resetTestSuppliers() { received.clear() }

export function testSupplierAdapter(supplierName: string): SupplierAdapter {
  const profile = PROFILES[supplierName]
  return {
    name: 'manual',
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
