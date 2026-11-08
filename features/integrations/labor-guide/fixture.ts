import type { GuideOperation, LaborGuideAdapter } from './types'
import { fitsVehicle } from './match'

/**
 * A small invented guide for tests and offline demos ("Sandbox data"). Times are illustrative,
 * not from any licensed guide. BRK-PAD-F has two variants for BMWs so the ambiguity refusal can
 * be shown.
 */
const COPY = 'Sandbox labor times (illustrative, not a licensed guide)'
const ROWS: (GuideOperation & { filter?: object })[] = [
  { operationId: 'BRK-PAD-F', description: 'Front brake pads, replace', centiHours: 110, copyright: COPY },
  { operationId: 'BRK-ROT-F', description: 'Front brake rotors, replace (includes pads)', centiHours: 160, includes: ['BRK-PAD-F'], overlapsWith: [{ operationId: 'BRK-PAD-F', deductCentiHours: 110 }], copyright: COPY },
  { operationId: 'BRK-PAD-F', description: 'Front brake pads, replace', variant: 'with wear sensor', centiHours: 130, copyright: COPY, filter: { makes: ['BMW'] } },
  { operationId: 'OIL-CHG', description: 'Engine oil and filter, change', centiHours: 50, copyright: COPY },
  { operationId: 'DIAG-1', description: 'Diagnose concern, first hour', centiHours: 100, rateClass: 'diagnostic', copyright: COPY },
]

export function fixtureLaborGuide(): LaborGuideAdapter {
  const fits = (vehicle: Parameters<LaborGuideAdapter['searchOperations']>[0]) => ROWS.filter(r => fitsVehicle(r.filter, vehicle))
  const strip = ({ filter: _f, ...op }: GuideOperation & { filter?: object }) => op
  return {
    key: 'fixture',
    capabilities: () => ({ search: true, maintenance: false, fluids: false }),
    async searchOperations(vehicle, query) {
      const text = query.text?.toLowerCase()
      const rows = fits(vehicle).filter(r => (!query.code || r.operationId === query.code) && (!text || r.description.toLowerCase().includes(text)))
      return { kind: 'ok', value: rows.slice(0, query.limit ?? 20).map(strip) }
    },
    async getOperation(vehicle, operationId) {
      const rows = fits(vehicle).filter(r => r.operationId === operationId)
      if (!rows.length) return { kind: 'error', code: 'NOT_FOUND', retryable: false }
      return { kind: 'ok', value: strip(rows[0]) }
    },
  }
}
