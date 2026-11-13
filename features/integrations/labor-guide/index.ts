import type { LaborGuideAdapter } from './types'
import { shopLibraryGuide, type LibraryRow } from './shopLibrary'

export type { LaborGuideAdapter, GuideOperation, GuideVehicle } from './types'
export { guideSnapshot } from './types'
export { fitsVehicle, specificity } from './match'
export type { LibraryRow } from './shopLibrary'
export { shopLibraryGuide }

/**
 * The labor guide is the shop's own library. Licensed guides (MOTOR, ALLDATA, Mitchell 1) plug in here once licensed.
 */
export function laborGuide(load: () => Promise<LibraryRow[]>, shopName?: string): LaborGuideAdapter {
  return shopLibraryGuide(load, shopName)
}
