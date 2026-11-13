import { nhtsaAdapter, type Fetcher } from '../nhtsa'
import type { VehicleDataAdapter } from '../types'
import clean from './vpic-clean.json'
import checkDigit from './vpic-check-digit.json'
import unknown from './vpic-unknown.json'
import accord from './recalls-accord-2018.json'
import parkOutside from './recalls-park-outside.json'
import none from './recalls-none.json'

/**
 * TEST DATA ONLY, never imported by product code. Responses recorded from the live NHTSA APIs on 2026-11-07. The recorded adapter runs the same
 * parsing code as live; only the transport is replaced.
 * - 1HGCV1F37JA000001: 2018 Honda Accord, clean decode.
 * - 1HGCV1F34JA000001: the same VIN with a wrong check digit (NHTSA error 1).
 * - Any other VIN: an unregistered manufacturer (errors 1, 7, 11, 400).
 * - Recalls: 2018 Honda Accord (6 campaigns); 2017 Kia Sportage (park-outside campaigns); anything
 *   else returns none.
 */
export const RECORDED_VINS = { clean: '1HGCV1F37JA000001', checkDigit: '1HGCV1F34JA000001' } as const

export const recordedFetcher: Fetcher = async (url: string) => {
  const u = new URL(url)
  let body: unknown = none
  if (u.hostname === 'vpic.nhtsa.dot.gov') {
    const vin = decodeURIComponent(u.pathname.split('/').pop() ?? '')
    body = vin === RECORDED_VINS.clean ? clean : vin === RECORDED_VINS.checkDigit ? checkDigit : unknown
  } else {
    const make = u.searchParams.get('make')?.toLowerCase()
    const model = u.searchParams.get('model')?.toLowerCase()
    const year = u.searchParams.get('modelYear')
    if (make === 'honda' && model === 'accord' && year === '2018') body = accord
    else if (make === 'kia' && model === 'sportage' && year === '2017') body = parkOutside
  }
  return { ok: true, status: 200, json: async () => structuredClone(body) }
}

export function recordedAdapter(): VehicleDataAdapter {
  return nhtsaAdapter(recordedFetcher)
}
