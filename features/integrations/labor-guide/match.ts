import type { GuideVehicle } from './types'

/** { makes?, models?, yearFrom?, yearTo?, engines? } — empty = every vehicle. Case-insensitive. */
export type VehicleFilter = { makes?: string[]; models?: string[]; yearFrom?: number; yearTo?: number; engines?: string[] }

const has = (list: unknown, value: string | null | undefined) =>
  !Array.isArray(list) || !list.length || (value ? list.some(v => String(v).toLowerCase() === value.toLowerCase()) : false)

export function fitsVehicle(filter: unknown, vehicle: GuideVehicle): boolean {
  const f = (filter && typeof filter === 'object' ? filter : {}) as VehicleFilter
  if (!has(f.makes, vehicle.make) || !has(f.models, vehicle.model) || !has(f.engines, vehicle.engine)) return false
  if (Number.isInteger(f.yearFrom) && (!vehicle.year || vehicle.year < f.yearFrom!)) return false
  if (Number.isInteger(f.yearTo) && (!vehicle.year || vehicle.year > f.yearTo!)) return false
  return true
}

/** The more specific filter wins when two rows fit (a BMW-only row beats an all-vehicles row). */
export const specificity = (filter: unknown) => {
  const f = (filter && typeof filter === 'object' ? filter : {}) as VehicleFilter
  return (f.makes?.length ? 4 : 0) + (f.models?.length ? 2 : 0) + (f.engines?.length ? 1 : 0) + (f.yearFrom || f.yearTo ? 1 : 0)
}
