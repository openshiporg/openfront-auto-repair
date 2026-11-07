import { z } from 'zod'
import { checkVin } from './vin'
import type { Observed, RecallCampaign, VehicleDataAdapter, VinDecode } from './types'

/**
 * NHTSA vPIC decode and the NHTSA recalls API (INTEGRATIONS §1.2). Both are public and keyless.
 * - Calls run outside any database transaction. The caller stores the result as an immutable
 *   snapshot (VehicleDecode, RecallCheck).
 * - Free text from NHTSA (recall summaries) is untrusted. It is shown to people and wrapped for
 *   agents; it is never used as instructions.
 */

const VPIC = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended'
const RECALLS = 'https://api.nhtsa.gov/recalls/recallsByVehicle'
const TIMEOUT_MS = 6_000
const MAX_TEXT = 4_000

export type Fetcher = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const decodeSchema = z.object({ Count: z.number(), Results: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).min(1) })
/** NHTSA sends null for empty text (seen on Notes in the recorded 2018 Accord response). */
const nullableText = z.string().nullish().transform(v => v ?? '')
const nullableFlag = z.boolean().nullish().transform(v => v ?? false)

const recallSchema = z.object({
  Count: z.number(),
  results: z.array(z.object({
    Manufacturer: nullableText,
    NHTSACampaignNumber: z.string(),
    parkIt: nullableFlag,
    parkOutSide: nullableFlag,
    overTheAirUpdate: nullableFlag,
    ReportReceivedDate: nullableText,
    Component: nullableText,
    Summary: nullableText,
    Consequence: nullableText,
    Remedy: nullableText,
    Notes: nullableText,
  }).passthrough()),
})

const clip = (text: string) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text)
const present = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value).trim()
  return text && text !== 'Not Applicable' ? text : undefined
}
const int = (value: unknown) => {
  const text = present(value)
  return text && /^\d+$/.test(text) ? Number(text) : undefined
}

/** "28/05/2020" (NHTSA's day/month/year) → "2020-05-28". */
export function nhtsaDate(text: string): string {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : text
}

export function parseDecode(vin: string, body: unknown): VinDecode {
  const parsed = decodeSchema.parse(body)
  const raw = Object.fromEntries(Object.entries(parsed.Results[0]).filter(([, v]) => v !== null && v !== '').map(([k, v]) => [k, String(v)]))
  return {
    vin,
    errorCode: raw.ErrorCode ?? '',
    errorText: clip(raw.ErrorText ?? ''),
    year: int(raw.ModelYear),
    make: present(raw.Make),
    makeId: int(raw.MakeID),
    model: present(raw.Model),
    modelId: int(raw.ModelID),
    trim: present(raw.Trim) ?? present(raw.Series),
    bodyClass: present(raw.BodyClass),
    driveType: present(raw.DriveType),
    engine: { cylinders: int(raw.EngineCylinders), displacementL: present(raw.DisplacementL), model: present(raw.EngineModel) },
    fuelTypePrimary: present(raw.FuelTypePrimary),
    electrificationLevel: present(raw.ElectrificationLevel),
    transmissionStyle: present(raw.TransmissionStyle),
    gvwr: present(raw.GVWR),
    vehicleType: present(raw.VehicleType),
    manufacturer: present(raw.Manufacturer),
    plantCountry: present(raw.PlantCountry),
    raw,
  }
}

export function parseRecalls(body: unknown): RecallCampaign[] {
  return recallSchema.parse(body).results.map(r => ({
    nhtsaCampaignNumber: r.NHTSACampaignNumber,
    manufacturer: r.Manufacturer,
    component: clip(r.Component),
    summary: clip(r.Summary),
    consequence: clip(r.Consequence),
    remedy: clip(r.Remedy),
    notes: r.Notes ? clip(r.Notes) : undefined,
    reportReceivedDate: nhtsaDate(r.ReportReceivedDate),
    parkIt: r.parkIt,
    parkOutSide: r.parkOutSide,
    overTheAirUpdate: r.overTheAirUpdate,
  }))
}

/** True when the vPIC error list is anything other than a clean decode ("0"). */
export const decodeHasErrors = (errorCode: string) => errorCode.split(',').map(s => s.trim()).some(code => code && code !== '0')

async function getJson(fetcher: Fetcher, url: string): Promise<{ ok: true; body: unknown } | { ok: false; code: string; retryable: boolean; detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetcher(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) return { ok: false, code: res.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR', retryable: res.status === 429 || res.status >= 500, detail: `NHTSA answered ${res.status}` }
    return { ok: true, body: await res.json() }
  } catch (error) {
    const aborted = (error as { name?: string })?.name === 'AbortError'
    return { ok: false, code: aborted ? 'TIMEOUT' : 'PROVIDER_UNAVAILABLE', retryable: true, detail: aborted ? 'NHTSA did not answer within 6 seconds' : 'NHTSA could not be reached' }
  } finally {
    clearTimeout(timer)
  }
}

export function nhtsaAdapter(fetcher: Fetcher = globalThis.fetch as unknown as Fetcher): VehicleDataAdapter {
  return {
    key: 'nhtsa',
    async decodeVin(vin, modelYear) {
      const checked = checkVin(vin)
      if (!checked.vin || checked.validity === 'invalid_format') return { kind: 'error', code: 'INVALID_INPUT', retryable: false, detail: checked.message }
      const url = `${VPIC}/${encodeURIComponent(checked.vin)}?format=json${modelYear ? `&modelyear=${modelYear}` : ''}`
      const res = await getJson(fetcher, url)
      if (!res.ok) return { kind: 'error', code: res.code, retryable: res.retryable, detail: res.detail }
      try {
        return { kind: 'ok', value: parseDecode(checked.vin, res.body) } satisfies Observed<VinDecode>
      } catch {
        return { kind: 'error', code: 'PROVIDER_SHAPE', retryable: false, detail: 'NHTSA returned a response we could not read' }
      }
    },
    async recallsByVehicle(query) {
      const make = query.make.trim()
      const model = query.model.trim()
      if (!make || !model || !Number.isInteger(query.modelYear)) return { kind: 'error', code: 'INVALID_INPUT', retryable: false, detail: 'Recalls need make, model and model year.' }
      const params = new URLSearchParams({ make, model, modelYear: String(query.modelYear) })
      const res = await getJson(fetcher, `${RECALLS}?${params}`)
      if (!res.ok) return { kind: 'error', code: res.code, retryable: res.retryable, detail: res.detail }
      try {
        return { kind: 'ok', value: parseRecalls(res.body) }
      } catch {
        return { kind: 'error', code: 'PROVIDER_SHAPE', retryable: false, detail: 'NHTSA returned a response we could not read' }
      }
    },
  }
}
