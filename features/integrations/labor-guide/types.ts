/**
 * Labor guide adapter contract (INTEGRATIONS §2). Pricing depends on this, never on a provider.
 * MOTOR / ALLDATA / Mitchell 1 are licensed; until a licence exists the shop's own library and a
 * fixture serve the same contract (Euler decision 3). No licensed text is stored (G15): a job line
 * keeps the operation id, the hours and a copyright line only.
 */
import type { Observed } from '../vehicle-data/types'

export type { Observed }

export type GuideVehicle = { year?: number | null; make?: string | null; model?: string | null; engine?: string | null }

export type GuideOperation = {
  operationId: string
  description: string
  variant?: string
  centiHours: number
  skillLevel?: 'a' | 'b' | 'c'
  rateClass?: string
  includes?: string[]
  overlapsWith?: { operationId: string; deductCentiHours: number }[]
  notes?: string
  copyright: string
}

export interface LaborGuideAdapter {
  key: 'motor' | 'alldata' | 'mitchell1' | 'shop-library' | 'fixture'
  capabilities(): { search: boolean; maintenance: boolean; fluids: boolean }
  /** Operations for a code (or a text search) that fit the vehicle. Several variants are returned as-is; the caller decides. */
  searchOperations(vehicle: GuideVehicle, query: { code?: string; text?: string; limit?: number }): Promise<Observed<GuideOperation[]>>
  getOperation(vehicle: GuideVehicle, operationId: string): Promise<Observed<GuideOperation>>
}

/** The row stored in JobLine.guideSnapshot: enough to explain the hours, nothing licensed. */
export const guideSnapshot = (adapter: LaborGuideAdapter['key'], op: GuideOperation, at: Date) => ({
  provider: adapter, operationId: op.operationId, variant: op.variant ?? null, centiHours: op.centiHours, copyright: op.copyright, at: at.toISOString(),
})
