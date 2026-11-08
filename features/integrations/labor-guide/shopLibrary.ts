import type { GuideOperation, LaborGuideAdapter } from './types'
import { fitsVehicle, specificity } from './match'

/** A LaborOperation row as the shop-library adapter needs it (read by the caller, inside or outside a transaction). */
export type LibraryRow = {
  code: string; description: string; variant: string; centiHours: number; skillLevel: string; rateClassCode: string
  includes: unknown; overlaps: unknown; vehicleFilter: unknown; shopId: string | null; active: boolean
}

/**
 * The shop's own labor times (SCHEMA §2.2a). Shop rows beat organisation rows; among rows that fit
 * the vehicle, only the most specific filter level is returned. Variants at that level are all
 * returned so pricing can refuse to guess (GUIDE_AMBIGUOUS).
 */
export function shopLibraryGuide(load: () => Promise<LibraryRow[]>, shopName = 'Shop'): LaborGuideAdapter {
  const toOp = (r: LibraryRow): GuideOperation => ({
    operationId: r.code, description: r.description, ...(r.variant ? { variant: r.variant } : {}), centiHours: r.centiHours,
    skillLevel: (['a', 'b', 'c'].includes(r.skillLevel) ? r.skillLevel : 'b') as 'a' | 'b' | 'c', rateClass: r.rateClassCode,
    includes: Array.isArray(r.includes) ? r.includes.map(String) : [],
    overlapsWith: Array.isArray(r.overlaps) ? (r.overlaps as any[]).map(o => ({ operationId: String(o.operationCode ?? o.operationId), deductCentiHours: Number(o.deductCentiHours) || 0 })) : [],
    copyright: `${shopName} labor times`,
  })
  const best = (rows: LibraryRow[]) => {
    if (!rows.length) return rows
    const byShop = rows.some(r => r.shopId) ? rows.filter(r => r.shopId) : rows
    const top = Math.max(...byShop.map(r => specificity(r.vehicleFilter)))
    return byShop.filter(r => specificity(r.vehicleFilter) === top)
  }
  return {
    key: 'shop-library',
    capabilities: () => ({ search: true, maintenance: false, fluids: false }),
    async searchOperations(vehicle, query) {
      const text = query.text?.toLowerCase()
      const rows = (await load()).filter(r => r.active && fitsVehicle(r.vehicleFilter, vehicle) && (!query.code || r.code === query.code) && (!text || r.description.toLowerCase().includes(text) || r.code.toLowerCase().includes(text)))
      const chosen = query.code ? best(rows) : rows
      return { kind: 'ok', value: chosen.slice(0, query.limit ?? 20).map(toOp) }
    },
    async getOperation(vehicle, operationId) {
      const rows = best((await load()).filter(r => r.active && r.code === operationId && fitsVehicle(r.vehicleFilter, vehicle)))
      if (!rows.length) return { kind: 'error', code: 'NOT_FOUND', retryable: false }
      return { kind: 'ok', value: toOp(rows[0]) }
    },
  }
}
