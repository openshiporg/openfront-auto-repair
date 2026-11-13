/** Starting parts counters for the Northgate demo group. All are quoted and ordered by phone. */
export const SEED_SUPPLIERS = [
  { name: 'Capitol Auto Parts', kind: 'parts_store', phone: '(916) 555-0141', email: 'counter@capitolautoparts.example', website: 'https://capitolautoparts.example', coreReturnWindowDays: 30, priceToleranceMinor: 25n, preferred: true },
  { name: 'Valley Warehouse Distributing', kind: 'warehouse_distributor', phone: '(916) 555-0178', email: 'orders@valleywarehouse.example', website: 'https://valleywarehouse.example', coreReturnWindowDays: 45, priceToleranceMinor: 50n, preferred: false },
  { name: 'Sierra Tire Supply', kind: 'tire_distributor', phone: '(916) 555-0193', email: 'dispatch@sierratiresupply.example', website: 'https://sierratiresupply.example', coreReturnWindowDays: 30, priceToleranceMinor: 100n, preferred: false },
] as const
