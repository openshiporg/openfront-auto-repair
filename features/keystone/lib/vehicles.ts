import { advisoryLock, type Tx } from './db'
import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { toJsonValue } from './canonical'
import type { UnitOfWork } from './unitOfWork'
import { checkVin, normalizeVin } from '../../integrations/vehicle-data/vin'
import type { RecallCampaign, VinDecode } from '../../integrations/vehicle-data/types'
import { decodeHasErrors } from '../../integrations/vehicle-data/nhtsa'

/*
 * Vehicles (SCHEMA §3.9-3.14, DOMAIN I-V1..V3).
 * - VIN: normalised and check-digit verified. A failed check digit is a warning (grey-market and
 *   pre-1981 VINs exist), never a block. One active vehicle per VIN.
 * - Decode and recall results come from the provider outside the transaction and are stored as
 *   immutable snapshots. Recall text is untrusted: it is shown to people and wrapped for agents.
 * - Odometer: a reading lower than the last accepted one needs a reason (rollback, cluster swap, unit mix-up).
 */

export type VehicleInput = {
  id?: string | null
  expectedVersion?: number | null
  vin?: string | null
  noVinReason?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  engine?: string | null
  color?: string | null
  customerId?: string | null
  businessAccountId?: string | null
  plate?: { plate: string; state: string } | null
  /** Fixed id for a new vehicle (seed and imports); ignored on update. */
  createId?: string | null
}

const text = (value: unknown, max = 80) => {
  const t = String(value ?? '').trim()
  if (t.length > max) throw new DomainError(Codes.INVALID_INPUT, `Keep this under ${max} characters.`)
  return t
}

const PLATE = /^[A-Z0-9 -]{1,10}$/
const STATE = /^[A-Z]{2}$/

/** Create a vehicle (or return the existing one for this VIN) and link the owner. */
export async function upsertVehicle(uow: UnitOfWork, actor: Actor, input: VehicleInput) {
  const { tx, now } = uow
  const rawVin = text(input.vin, 40)
  const vin = rawVin ? normalizeVin(rawVin) : null
  const check = checkVin(vin)
  if (vin && check.validity === 'invalid_format') throw new DomainError(Codes.INVALID_INPUT, check.message, { field: 'vin' })
  const noVinReason = vin ? '' : text(input.noVinReason, 200)
  if (!vin && !noVinReason && !input.id) throw new DomainError(Codes.INVALID_INPUT, 'Enter the VIN, or say why there is none (e.g. a trailer or a pre-1981 vehicle).', { field: 'vin' })
  const year = input.year ?? null
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > now.getUTCFullYear() + 2)) throw new DomainError(Codes.INVALID_INPUT, 'Enter a model year such as 2018.', { field: 'year' })
  const fields = { year, make: text(input.make), model: text(input.model), trim: text(input.trim), engine: text(input.engine, 120), color: text(input.color, 40) }

  let id: string
  let existing = false
  if (vin) await advisoryLock(tx, `vin:${vin}`)
  if (input.id) {
    const row = await lockRow<Record<string, any>>(tx, 'Vehicle', input.id)
    if (input.expectedVersion !== undefined && input.expectedVersion !== null && row.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This vehicle changed since you loaded it. Reload and try again.', { currentVersion: row.version })
    if (vin && vin !== row.vin) {
      const other = await tx.vehicle.findFirst({ where: { vin, status: 'active', id: { not: input.id } }, select: { id: true } })
      if (other) throw new DomainError(Codes.DUPLICATE, 'Another vehicle already has this VIN. Merge them instead.', { existingId: other.id, field: 'vin' })
    }
    const data = { ...fields, ...(vin ? { vin, vinValid: check.validity } : {}), version: { increment: 1 } }
    await tx.vehicle.update({ where: { id: input.id }, data })
    uow.audit({ eventType: 'vehicle.updated', entityType: 'Vehicle', entityId: input.id, actorUserId: actorUserId(actor), before: { vin: row.vin, year: row.year, make: row.make, model: row.model }, after: { vin: vin ?? row.vin, ...fields } })
    id = input.id
  } else {
    const found = vin ? await tx.vehicle.findFirst({ where: { vin, status: 'active' }, select: { id: true } }) : null
    if (found) {
      id = found.id
      existing = true
    } else {
      const row = await tx.vehicle.create({ data: { ...(input.createId ? { id: input.createId } : {}), ...fields, vin: vin ?? '', vinValid: check.validity, noVinReason, status: 'active' } })
      auditCreate(uow, actor, 'Vehicle', row.id, 'vehicle.created', { vin, vinValid: check.validity, ...fields })
      id = row.id
    }
  }

  if (input.customerId || input.businessAccountId) await linkOwner(uow, actor, id, { customerId: input.customerId ?? null, businessAccountId: input.businessAccountId ?? null })
  if (input.plate?.plate) await recordPlate(uow, actor, id, input.plate)
  return { id, existing, vinCheck: check }
}

/** Make a customer (or fleet account) the current owner; the previous owner's link is ended, not deleted. */
export async function linkOwner(uow: UnitOfWork, actor: Actor, vehicleId: string, owner: { customerId: string | null; businessAccountId: string | null }) {
  const { tx, now } = uow
  if (!owner.customerId && !owner.businessAccountId) throw new DomainError(Codes.INVALID_INPUT, 'Choose a customer or an account.')
  const today = now.toISOString().slice(0, 10)
  const current = await tx.vehicleOwnership.findMany({ where: { vehicleId, role: 'owner', endedAt: null } })
  const same = current.find(o => o.customerId === owner.customerId && o.businessAccountId === owner.businessAccountId)
  if (same) return { id: same.id, changed: false }
  for (const o of current) await tx.vehicleOwnership.update({ where: { id: o.id }, data: { endedAt: new Date(`${today}T00:00:00Z`) } })
  const row = await tx.vehicleOwnership.create({ data: { vehicleId, customerId: owner.customerId, businessAccountId: owner.businessAccountId, role: 'owner', startedAt: new Date(`${today}T00:00:00Z`) } })
  auditCreate(uow, actor, 'VehicleOwnership', row.id, 'vehicle.owner_linked', { vehicleId, ...owner, endedPrevious: current.map(o => o.id) })
  return { id: row.id, changed: true }
}

export async function recordPlate(uow: UnitOfWork, actor: Actor, vehicleId: string, input: { plate: string; state: string }) {
  const plate = String(input.plate ?? '').trim().toUpperCase()
  const state = String(input.state ?? '').trim().toUpperCase()
  if (!PLATE.test(plate)) throw new DomainError(Codes.INVALID_INPUT, 'Plates are up to 10 letters and digits.', { field: 'plate' })
  if (!STATE.test(state)) throw new DomainError(Codes.INVALID_INPUT, 'Use the two-letter state code, e.g. CA.', { field: 'state' })
  const { tx, now } = uow
  const existing = await tx.plateRegistration.findFirst({ where: { vehicleId, plate, state } })
  if (existing) {
    await tx.plateRegistration.update({ where: { id: existing.id }, data: { lastSeenAt: now, active: true } })
    return { id: existing.id }
  }
  await tx.plateRegistration.updateMany({ where: { vehicleId, active: true }, data: { active: false } })
  const row = await tx.plateRegistration.create({ data: { vehicleId, plate, state, firstSeenAt: now, lastSeenAt: now, active: true } })
  auditCreate(uow, actor, 'PlateRegistration', row.id, 'vehicle.plate_recorded', { vehicleId, plate, state })
  return { id: row.id }
}

export type OdometerInput = { vehicleId: string; value: number; unit?: 'mi' | 'km'; source: 'ro_in' | 'ro_out' | 'customer' | 'import' | 'telematics'; overrideReason?: string | null; checkInId?: string | null }

/** A big jump is flagged for review but accepted (a year of driving can be 40,000 miles). */
const JUMP = 150_000

/** Append an odometer reading. A lower reading needs a reason and is flagged. */
export async function recordOdometer(uow: UnitOfWork, actor: Actor, input: OdometerInput) {
  const { tx, now } = uow
  if (!Number.isInteger(input.value) || input.value < 0 || input.value > 2_000_000) throw new DomainError(Codes.INVALID_INPUT, 'Enter the odometer as a whole number.', { field: 'odometer' })
  const vehicle = await lockRow<Record<string, any>>(tx, 'Vehicle', input.vehicleId)
  const unit = input.unit ?? (vehicle.lastOdometerUnit as 'mi' | 'km') ?? 'mi'
  const previous = vehicle.lastOdometer as number | null
  const comparable = previous !== null && unit === vehicle.lastOdometerUnit
  let anomaly: 'none' | 'lower_than_previous' | 'jump' = 'none'
  const reason = text(input.overrideReason, 300)
  if (comparable && input.value < previous!) {
    if (!reason) throw new DomainError(Codes.ODOMETER_REGRESSION, `The odometer reads lower than last time (${previous!.toLocaleString('en-US')} ${unit}). Check it, or give a reason (cluster replaced, unit mix-up).`, { previous, field: 'odometer' })
    anomaly = 'lower_than_previous'
  } else if (comparable && input.value - previous! > JUMP) anomaly = 'jump'
  const row = await tx.odometerReading.create({
    data: { vehicleId: input.vehicleId, value: input.value, unit, source: input.source, checkInId: input.checkInId ?? null, recordedById: actorUserId(actor), at: now, accepted: true, anomaly, overrideReason: reason },
  })
  // The vehicle keeps the latest reading even when it went down: the override is the shop's decision, and it is audited.
  await tx.vehicle.update({ where: { id: input.vehicleId }, data: { lastOdometer: input.value, lastOdometerUnit: unit, version: { increment: 1 } } })
  auditCreate(uow, actor, 'OdometerReading', row.id, 'vehicle.odometer_recorded', { vehicleId: input.vehicleId, value: input.value, unit, previous, anomaly }, { reason })
  return { id: row.id, anomaly, previous }
}

/** Store a decode snapshot and fill blank vehicle fields from it (it never overwrites what staff typed). */
export async function storeDecode(uow: UnitOfWork, actor: Actor, vehicleId: string, v: VinDecode, observedAt: Date, fixture: boolean) {
  const { tx } = uow
  const vehicle = await lockRow<Record<string, any>>(tx, 'Vehicle', vehicleId)
  const errorCodes = v.errorCode.split(',').map(c => c.trim()).filter(Boolean)
  const { raw: _raw, ...kept } = v
  const row = await tx.vehicleDecode.create({
    data: {
      vehicleId, provider: fixture ? 'fixture' : 'nhtsa_vpic', requestedVin: v.vin, decoded: toJsonValue(kept) as never,
      errorCode: v.errorCode ?? '', errorText: v.errorText?.slice(0, 2000) ?? '', fetchedAt: observedAt, fetchedById: actorUserId(actor),
    },
  })
  const fill: Record<string, unknown> = {}
  const set = (field: string, value: unknown) => { if ((vehicle[field] === null || vehicle[field] === '') && value !== null && value !== undefined && value !== '') fill[field] = value }
  // Fill only from a clean decode, or one whose only problem is the check digit (the rest still decodes).
  if (!decodeHasErrors(v.errorCode) || errorCodes.every(c => c === '0' || c === '1')) {
    const engine = [v.engine?.displacementL ? `${v.engine.displacementL}L` : null, v.engine?.cylinders ? `${v.engine.cylinders}-cyl` : null, v.engine?.model].filter(Boolean).join(' ')
    set('year', v.year); set('make', v.make); set('model', v.model); set('trim', v.trim)
    set('engine', engine || null); set('drivetrain', v.driveType); set('transmission', v.transmissionStyle); set('fuelType', v.fuelTypePrimary); set('bodyClass', v.bodyClass)
  }
  await tx.vehicle.update({ where: { id: vehicleId }, data: { ...fill, currentDecodeId: row.id, version: { increment: 1 } } })
  auditCreate(uow, actor, 'VehicleDecode', row.id, 'vehicle.decoded', { vehicleId, provider: row.provider, errorCode: v.errorCode, filled: Object.keys(fill) })
  return { id: row.id, filled: Object.keys(fill), errorCode: v.errorCode }
}

export async function storeRecallCheck(uow: UnitOfWork, actor: Actor, vehicleId: string, query: { make: string; model: string; modelYear: number }, campaigns: RecallCampaign[], observedAt: Date, fixture: boolean) {
  const parkItAny = campaigns.some(c => c.parkIt || c.parkOutSide)
  const row = await uow.tx.recallCheck.create({
    data: {
      vehicleId, source: fixture ? 'fixture' : 'nhtsa_make_model_year', query: query as never, campaigns: toJsonValue(campaigns) as never,
      campaignCount: campaigns.length, parkItAny, checkedAt: observedAt, checkedById: actorUserId(actor),
    },
  })
  auditCreate(uow, actor, 'RecallCheck', row.id, 'vehicle.recalls_checked', { vehicleId, campaignCount: campaigns.length, parkItAny, source: row.source })
  return { id: row.id, campaignCount: campaigns.length, parkItAny }
}

export async function vehicleForLookup(tx: Tx, vehicleId: string) {
  const v = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { id: true, vin: true, year: true, make: true, model: true, status: true } })
  if (!v) throw new DomainError(Codes.NOT_FOUND, 'Vehicle not found.')
  return v
}
