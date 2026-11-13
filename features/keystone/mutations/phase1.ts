import { actorFromSession, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { sessionShopIds } from '../access'
import { createDraft, kindOf, requestPublish } from '../lib/policy'
import { addContact, createBusinessAccount, recordConsent, upsertCustomer, type ConsentInput, type ContactInput, type CustomerInput } from '../lib/customers'
import { linkOwner, recordOdometer, storeDecode, storeRecallCheck, upsertVehicle, vehicleForLookup, type VehicleInput } from '../lib/vehicles'
import { bookAppointment, cancelAppointment, confirmAppointment, markNoShow, placeHold, rescheduleAppointment, type AppointmentKind } from '../lib/scheduling'
import { checkInVehicle, type CheckInInput } from '../lib/checkIn'
import { assertWithinCeiling } from '../lib/ceiling'
import { vehicleData } from '../../integrations/vehicle-data'
import { checkVin } from '../../integrations/vehicle-data/vin'

type Ctx = { session: any; prisma: any }

const KINDS: AppointmentKind[] = ['drop_off', 'waiter', 'pickup_delivery', 'mobile']

/** The caller must belong to the shop (or see all shops). */
export function requireShop(context: Ctx, shopId: unknown): string {
  if (typeof shopId !== 'string' || !shopId) throw new DomainError(Codes.INVALID_INPUT, 'Choose a shop.', { field: 'shopId' })
  const ids = sessionShopIds(context.session)
  if (ids !== 'all' && !ids.includes(shopId)) throw new DomainError(Codes.NOT_AUTHORIZED, "You don't work at this shop.")
  return shopId
}

const date = (value: unknown, field: string) => {
  const d = new Date(String(value ?? ''))
  if (Number.isNaN(d.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Enter a valid date and time.', { field })
  return d
}

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

// ── Policy ────────────────────────────────────────────────────────────────────

export async function createPolicyDraft(_root: unknown, args: { kind: string; headId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePolicies')
  const kind = kindOf(args.kind)
  if (kind !== 'jurisdiction') requireShop(context, args.headId)
  return run(context, actor, 'policy.draft', args.idempotencyKey, args, uow => createDraft(uow, actor, kind, args.headId))
}

export async function publishPolicyVersion(_root: unknown, args: { kind: string; versionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePolicies', 'canPublishPolicies')
  const kind = kindOf(args.kind)
  return run(context, actor, 'policy.publish', args.idempotencyKey, args, uow => requestPublish(uow, actor, kind, args.versionId, args.expectedVersion))
}

// ── Customers ─────────────────────────────────────────────────────────────────

/**
 * `serviceTextConsent`: the customer agreed at the counter to service texts (transactional SMS) on the
 * new mobile number. Recorded in the same command as staff_recorded; marketing consent is never set here.
 */
export async function saveCustomer(_root: unknown, args: { input: CustomerInput & { serviceTextConsent?: boolean | null }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers')
  if (args.input?.homeShopId) requireShop(context, args.input.homeShopId)
  const { createId: _ignored, serviceTextConsent, ...input } = args.input ?? {}
  return run(context, actor, 'customer.save', args.idempotencyKey, args.input, async uow => {
    const saved = await upsertCustomer(uow, actor, input)
    if (serviceTextConsent) {
      const index = (input.contacts ?? []).findIndex(c => c.kind === 'mobile')
      if (index >= 0 && saved.contactIds[index]) await recordConsent(uow, actor, { contactId: saved.contactIds[index], channel: 'sms', purpose: 'transactional', action: 'granted', method: 'staff_recorded', evidence: { note: 'Verbal agreement at the counter' } })
    }
    return saved
  })
}

export async function addCustomerContact(_root: unknown, args: { customerId: string; contact: ContactInput; allowDuplicate?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers')
  return run(context, actor, 'customer.contact.add', args.idempotencyKey, args, async uow => {
    const row = await addContact(uow, actor, args.customerId, args.contact, Boolean(args.allowDuplicate))
    return { id: row.id }
  })
}

export async function recordContactConsent(_root: unknown, args: { input: ConsentInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers', 'canMessageCustomers')
  return run(context, actor, 'customer.consent', args.idempotencyKey, args.input, uow => recordConsent(uow, actor, args.input))
}

export async function saveBusinessAccount(_root: unknown, args: { name: string; termsDays?: number | null; poRequired?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers')
  return run(context, actor, 'business_account.create', args.idempotencyKey, args, uow => createBusinessAccount(uow, actor, { name: args.name, termsDays: args.termsDays ?? 0, poRequired: args.poRequired ?? false }))
}

// ── Vehicles ──────────────────────────────────────────────────────────────────

export async function saveVehicle(_root: unknown, args: { input: VehicleInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers', 'canWriteRepairOrders')
  const { createId: _ignored, ...input } = args.input ?? {}
  return run(context, actor, 'vehicle.save', args.idempotencyKey, input, uow => upsertVehicle(uow, actor, input))
}

export async function linkVehicleOwner(_root: unknown, args: { vehicleId: string; customerId?: string | null; businessAccountId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers')
  return run(context, actor, 'vehicle.owner', args.idempotencyKey, args, uow => linkOwner(uow, actor, args.vehicleId, { customerId: args.customerId ?? null, businessAccountId: args.businessAccountId ?? null }))
}

export async function recordOdometerReading(_root: unknown, args: { vehicleId: string; value: number; unit?: 'mi' | 'km' | null; overrideReason?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canWriteRepairOrders', 'canManageCustomers')
  return run(context, actor, 'vehicle.odometer', args.idempotencyKey, args, uow => recordOdometer(uow, actor, { vehicleId: args.vehicleId, value: args.value, unit: args.unit ?? undefined, source: 'customer', overrideReason: args.overrideReason }))
}

/** Decode the VIN with NHTSA (outside the transaction), then store the snapshot. Read-only to the provider. */
export async function decodeVehicleVin(_root: unknown, args: { vehicleId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers', 'canWriteRepairOrders')
  const vehicle = await vehicleForLookup(context.prisma, args.vehicleId)
  const vin = checkVin(vehicle.vin)
  if (!vin.vin || vin.validity === 'invalid_format' || vin.validity === 'none') throw new DomainError(Codes.INVALID_INPUT, 'This vehicle has no VIN to decode.', { field: 'vin' })
  const adapter = vehicleData()
  const observedAt = new Date()
  const result = await adapter.decodeVin(vin.vin, vehicle.year ?? undefined)
  if (result.kind === 'error') throw new DomainError(Codes.PROVIDER_UNAVAILABLE, result.retryable ? 'NHTSA did not answer. Try again in a minute, or enter the details by hand.' : 'NHTSA could not decode this VIN. Check it, or enter the details by hand.', { reason: result.code })
  return run(context, actor, 'vehicle.decode', args.idempotencyKey, { vehicleId: args.vehicleId, vin: vin.vin }, uow => storeDecode(uow, actor, args.vehicleId, result.value, observedAt))
}

/** Check NHTSA recalls by make, model and year. These are possible recalls: the VIN is not confirmed. */
export async function checkVehicleRecalls(_root: unknown, args: { vehicleId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReadRepairOrders')
  const vehicle = await vehicleForLookup(context.prisma, args.vehicleId)
  if (!vehicle.make || !vehicle.model || !vehicle.year) throw new DomainError(Codes.INVALID_INPUT, 'Add the year, make and model (or decode the VIN) first.')
  const query = { make: vehicle.make, model: vehicle.model, modelYear: vehicle.year }
  const adapter = vehicleData()
  const observedAt = new Date()
  const result = await adapter.recallsByVehicle(query)
  if (result.kind === 'error') throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'NHTSA recalls did not answer. Try again in a minute.', { reason: result.code })
  return run(context, actor, 'vehicle.recalls', args.idempotencyKey, { vehicleId: args.vehicleId, ...query }, uow => storeRecallCheck(uow, actor, args.vehicleId, query, result.value, observedAt))
}

// ── Scheduling ────────────────────────────────────────────────────────────────

type BookArgs = { shopId: string; startsAt: string; kind: string; estimatedCentiHours?: number | null; customerId?: string | null; vehicleId?: string | null; lead?: any; concernText?: string | null; requestedServices?: string[] | null; holdToken?: string | null; confirm?: boolean | null; idempotencyKey: string }

const kindArg = (value: string): AppointmentKind => {
  if (!KINDS.includes(value as AppointmentKind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose drop-off, waiter, pickup or mobile.', { field: 'kind' })
  return value as AppointmentKind
}

export async function holdAppointmentSlot(_root: unknown, args: { shopId: string; startsAt: string; kind: string; estimatedCentiHours?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageSchedule')
  const shopId = requireShop(context, args.shopId)
  return run(context, actor, 'appointment.hold', args.idempotencyKey, args, uow => placeHold(uow, actor, { shopId, startsAt: date(args.startsAt, 'startsAt'), kind: kindArg(args.kind), estimatedCentiHours: args.estimatedCentiHours ?? 100, source: 'staff' }))
}

export async function bookShopAppointment(_root: unknown, args: BookArgs, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageSchedule')
  const shopId = requireShop(context, args.shopId)
  return run(context, actor, 'appointment.book', args.idempotencyKey, args, uow => bookAppointment(uow, actor, {
    shopId, startsAt: date(args.startsAt, 'startsAt'), kind: kindArg(args.kind), estimatedCentiHours: args.estimatedCentiHours ?? 100,
    customerId: args.customerId ?? null, vehicleId: args.vehicleId ?? null, lead: args.lead ?? null, concernText: args.concernText ?? null,
    requestedServices: args.requestedServices ?? [], source: 'staff', holdToken: args.holdToken ?? null, confirm: Boolean(args.confirm),
  }))
}

async function appointmentShop(context: Ctx, id: string) {
  const row = await context.prisma.appointment.findUnique({ where: { id }, select: { shopId: true } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Appointment not found.')
  return requireShop(context, row.shopId)
}

export async function transitionAppointment(_root: unknown, args: { id: string; to: string; expectedVersion: number; reason?: string | null; startsAt?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageSchedule')
  await appointmentShop(context, args.id)
  return run<unknown>(context, actor, `appointment.${args.to}`, args.idempotencyKey, args, (uow): Promise<unknown> => {
    switch (args.to) {
      case 'confirmed': return confirmAppointment(uow, actor, args.id, args.expectedVersion)
      case 'cancelled': return cancelAppointment(uow, actor, { id: args.id, reason: args.reason ?? '', expectedVersion: args.expectedVersion })
      case 'no_show': return markNoShow(uow, actor, { id: args.id, expectedVersion: args.expectedVersion })
      case 'rescheduled': return rescheduleAppointment(uow, actor, { id: args.id, startsAt: date(args.startsAt, 'startsAt'), expectedVersion: args.expectedVersion })
      default: throw new DomainError(Codes.INVALID_INPUT, 'Choose confirm, reschedule, cancel or no-show. Arrival happens at check-in.')
    }
  })
}

export async function checkInShopVehicle(_root: unknown, args: { input: Omit<CheckInInput, 'promisedAt'> & { promisedAt?: string | null }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canWriteRepairOrders')
  const shopId = requireShop(context, args.input?.shopId)
  if (args.input.appointmentId) {
    const shopOfAppointment = await appointmentShop(context, args.input.appointmentId)
    if (shopOfAppointment !== shopId) throw new DomainError(Codes.INVALID_INPUT, 'The appointment is at another shop.')
  }
  const input: CheckInInput = { ...args.input, shopId, promisedAt: args.input.promisedAt ? date(args.input.promisedAt, 'promisedAt') : null }
  return run(context, actor, 'vehicle.check_in', args.idempotencyKey, args.input, uow => checkInVehicle(uow, actor, input))
}

// ── The exit gate: work above the authorized ceiling is refused ──────────────────

/**
 * A read-only check the estimate screens (Phase 2) call before a price change: would this price fit
 * the customer's authorization under the shop's pinned tolerance rule? It refuses with
 * REAUTHORIZATION_REQUIRED when it would not.
 */
export async function checkAuthorizedCeiling(_root: unknown, args: { shopId: string; authorizedMinor: string; priceMinor: string; taxMinor?: string | null }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReadRepairOrders')
  const shopId = requireShop(context, args.shopId)
  const whole = (v: unknown, field: string) => {
    if (typeof v !== 'string' || !/^\d{1,15}$/.test(v)) throw new DomainError(Codes.INVALID_INPUT, 'Amounts are whole cents.', { field })
    return BigInt(v)
  }
  const shop = await context.prisma.shop.findUnique({ where: { id: shopId }, select: { jurisdictionPolicyId: true } })
  if (!shop?.jurisdictionPolicyId) throw new DomainError(Codes.POLICY_MISSING, 'This shop has no published jurisdiction rules.')
  const law = await context.prisma.jurisdictionPolicyVersion.findUnique({ where: { id: shop.jurisdictionPolicyId }, select: { toleranceRule: true, id: true } })
  const result = assertWithinCeiling({ rule: law.toleranceRule, authorizedMinor: whole(args.authorizedMinor, 'authorizedMinor'), priceMinor: whole(args.priceMinor, 'priceMinor'), taxMinor: args.taxMinor ? whole(args.taxMinor, 'taxMinor') : 0n })
  return { ok: true, ceilingMinor: result.ceilingMinor.toString(), comparedMinor: result.comparedMinor.toString(), policyVersionId: law.id }
}
