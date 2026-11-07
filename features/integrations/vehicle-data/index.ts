import type { VehicleDataAdapter } from './types'
import { fixtureAdapter } from './fixtures'
import { nhtsaAdapter } from './nhtsa'

export type { VehicleDataAdapter, VinDecode, RecallCampaign, Observed } from './types'
export { checkVin, normalizeVin, vinCheckDigit } from './vin'
export { decodeHasErrors } from './nhtsa'

/**
 * Picks the vehicle-data provider. NHTSA is live by default (Euler decision 3).
 * VEHICLE_DATA_PROVIDER=fixture serves the recorded responses, for tests and offline demos;
 * screens label that data "Sandbox data".
 */
export function vehicleData(): VehicleDataAdapter {
  return process.env.VEHICLE_DATA_PROVIDER === 'fixture' ? fixtureAdapter() : nhtsaAdapter()
}
