import type { LaborGuideAdapter } from './types'
import { fixtureLaborGuide } from './fixture'
import { shopLibraryGuide, type LibraryRow } from './shopLibrary'

export type { LaborGuideAdapter, GuideOperation, GuideVehicle } from './types'
export { guideSnapshot } from './types'
export { fitsVehicle, specificity } from './match'
export type { LibraryRow } from './shopLibrary'
export { fixtureLaborGuide, shopLibraryGuide }

/**
 * Picks the labor guide. The shop's own library is the default; LABOR_GUIDE_PROVIDER=fixture serves
 * the sandbox times. Licensed guides (MOTOR, ALLDATA, Mitchell 1) plug in here once licensed.
 */
export function laborGuide(load: () => Promise<LibraryRow[]>, shopName?: string): LaborGuideAdapter {
  return process.env.LABOR_GUIDE_PROVIDER === 'fixture' ? fixtureLaborGuide() : shopLibraryGuide(load, shopName)
}
