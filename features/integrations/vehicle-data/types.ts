/** Vehicle data adapter contract (INTEGRATIONS §1.1). Business code depends on this, never on a provider module. */

export type Observed<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'error'; code: string; retryable: boolean; detail?: string }

export type VinDecode = {
  vin: string
  /** NHTSA: "0" = clean; "1" = check digit (9th position) does not calculate properly; comma separated. */
  errorCode: string
  errorText: string
  year?: number
  make?: string
  makeId?: number
  model?: string
  modelId?: number
  trim?: string
  bodyClass?: string
  driveType?: string
  engine?: { cylinders?: number; displacementL?: string; model?: string }
  fuelTypePrimary?: string
  electrificationLevel?: string
  transmissionStyle?: string
  gvwr?: string
  vehicleType?: string
  manufacturer?: string
  plantCountry?: string
  raw: Record<string, string>
}

export type RecallCampaign = {
  nhtsaCampaignNumber: string
  manufacturer: string
  component: string
  summary: string
  consequence: string
  remedy: string
  notes?: string
  reportReceivedDate: string
  parkIt: boolean
  parkOutSide: boolean
  overTheAirUpdate: boolean
}

export interface VehicleDataAdapter {
  key: 'nhtsa' | 'fixture' | 'manual'
  decodeVin(vin: string, modelYear?: number): Promise<Observed<VinDecode>>
  recallsByVehicle(query: { make: string; model: string; modelYear: number }): Promise<Observed<RecallCampaign[]>>
}
