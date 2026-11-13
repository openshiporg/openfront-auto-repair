/**
 * Parts supplier adapters (INTEGRATIONS §3). Business code depends on `SupplierAdapter`, never on a
 * provider module. `manual` is the default: staff phone, walk up or use a supplier's website and
 * record what they were told. Licensed catalogs (PartsTech, Nexpart) plug in here once licensed.
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
  readonly name: 'manual'
  quote(request: QuoteRequest): Promise<SupplierQuote | null>
  placeOrder(request: PlaceRequest): Promise<PlaceResult>
  orderStatus(reference: string): Promise<OrderStatus>
}

const refused = (what: string) => async (): Promise<never> => { throw new Error(`${what} is done by phone or at the counter for this supplier. Record what they told you.`) }

export function manualAdapter(): SupplierAdapter {
  return { name: 'manual', quote: async () => null, placeOrder: refused('Placing an order'), orderStatus: refused('Checking an order') }
}

let override: ((supplierName: string) => SupplierAdapter) | null = null
/** Test seam: tests install a supplier double; null restores the real adapters. */
export function setSupplierAdapter(make: ((supplierName: string) => SupplierAdapter) | null) { override = make }

/** True only when a supplier API adapter is installed. None is licensed yet, so every supplier is quoted and ordered by phone. */
export const supplierHasApi = () => override !== null

export function supplierAdapter(_adapter: string, supplierName: string): SupplierAdapter {
  return override ? override(supplierName) : manualAdapter()
}

