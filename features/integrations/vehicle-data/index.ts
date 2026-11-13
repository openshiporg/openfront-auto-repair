import type { VehicleDataAdapter } from './types'
import { nhtsaAdapter } from './nhtsa'

export type { VehicleDataAdapter, VinDecode, RecallCampaign, Observed } from './types'
export { checkVin, normalizeVin, vinCheckDigit } from './vin'
export { decodeHasErrors } from './nhtsa'

/**
 * The vehicle-data provider: NHTSA vPIC and recalls, called live.
 */
export function vehicleData(): VehicleDataAdapter {
  return nhtsaAdapter()
}
