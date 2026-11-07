import { randomBytes } from 'node:crypto'
import { advisoryLock, type Tx } from './db'
import { sha256 } from './canonical'
import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { fromRows, hoursOn, localDate, zonedInstant, type CalendarSpec } from './calendar'
import { nextShopReference } from './sequence'
import type { UnitOfWork } from './unitOfWork'

/*
 * Appointments (STATE-MACHINES §1, scheduling bookingHolds.ts + barbershop bookingCapacity.ts adapted).
 *   requested → confirmed → arrived | no_show; requested|confirmed → cancelled
 * Capacity is checked under one advisory lock per shop and local date (`capacity:<shop>:<date>`), so
 * the last slot goes to exactly one booking. Live holds count against capacity until they are consumed
 * or expire. All times are shop-local; the calendar fails closed past its coverage.
 */

export type AppointmentKind = 'drop_off' | 'waiter' | 'pickup_delivery' | 'mobile'
export type BookingSource = 'staff' | 'storefront_api' | 'phone_agent' | 'sms_agent' | 'import'

export const HOLD_TTL_MINUTES = 10
const ACTIVE = ['requested', 'confirmed', 'arrived']

export type CapacityRules = {
  maxDropoffsPerDay: number | null
  waiterSlotsPerHour: number | null
  maxBayCentiHoursPerDay: number | null
  noWaitersAfter: string | null
  leadTimeHours: number
  slotMinutes: number
}

type Shop = { id: string; code: string; timeZone: string }

export async function loadShopCalendar(tx: Tx, shopId: string): Promise<{ shop: Shop; calendar: CalendarSpec }> {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, code: true, timeZone: true, status: true, calendarId: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Shop not found.')
  if (shop.status !== 'active') throw new DomainError(Codes.INVALID_TRANSITION, `${shop.code} is ${shop.status} and takes no bookings.`)
  if (!shop.calendarId) throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} has no opening hours yet. Set them under Shops.`)
  const row = await tx.shopCalendar.findUniqueOrThrow({ where: { id: shop.calendarId } })
  const exceptions = await tx.shopCalendarException.findMany({ where: { calendarId: row.id } })
  return { shop, calendar: fromRows(shop.code, shop.timeZone, row as never, exceptions) }
}

const dow = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * The booking rules in force at a shop on a date. A missing rule means no limit of that kind.
 * A rule for specific weekdays beats an every-day rule of the same kind; otherwise the newest wins.
 */
export async function capacityRules(tx: Tx, shopId: string, date: string): Promise<CapacityRules> {
  const found = await tx.bookingRule.findMany({ where: { shopId, active: true }, orderBy: { createdAt: 'asc' } })
  const daySpecific = (r: { appliesToDays: unknown }) => (Array.isArray(r.appliesToDays) && r.appliesToDays.length ? 1 : 0)
  const rows = [...found].sort((a, b) => daySpecific(a) - daySpecific(b))
  const rules: CapacityRules = { maxDropoffsPerDay: null, waiterSlotsPerHour: null, maxBayCentiHoursPerDay: null, noWaitersAfter: null, leadTimeHours: 0, slotMinutes: 30 }
  for (const r of rows) {
    const days = Array.isArray(r.appliesToDays) ? (r.appliesToDays as number[]) : []
    if (days.length && !days.includes(dow(date))) continue
    const n = typeof r.value === 'number' ? r.value : /^\d+$/.test(String(r.value)) ? Number.parseInt(String(r.value), 10) : Number.NaN
    switch (r.kind) {
      case 'max_dropoffs_per_day': if (Number.isInteger(n) && n >= 0) rules.maxDropoffsPerDay = n; break
      case 'waiter_slots_per_hour': if (Number.isInteger(n) && n >= 0) rules.waiterSlotsPerHour = n; break
      case 'max_bay_hours_per_day': if (Number.isInteger(n) && n >= 0) rules.maxBayCentiHoursPerDay = n; break
      case 'no_waiters_after': if (typeof r.value === 'string' && HHMM.test(r.value)) rules.noWaitersAfter = r.value; break
      case 'lead_time_hours': if (Number.isInteger(n) && n >= 0) rules.leadTimeHours = n; break
      case 'slot_minutes': if ([10, 15, 20, 30, 60].includes(n)) rules.slotMinutes = n; break
    }
  }
  return rules
}

const localHHMM = (calendar: CalendarSpec, at: Date) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: calendar.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at).map(x => [x.type, x.value]))
  return `${p.hour}:${p.minute}`
}

export type SlotRequest = { shopId: string; startsAt: Date; kind: AppointmentKind; estimatedCentiHours: number; source: BookingSource }

/** Where and when the slot sits: date, hour bucket, and whether it is inside opening hours and the rules. Pure apart from the reads. */
export async function placeSlot(tx: Tx, request: SlotRequest, now: Date) {
  const { shop, calendar } = await loadShopCalendar(tx, request.shopId)
  if (!Number.isInteger(request.estimatedCentiHours) || request.estimatedCentiHours < 0 || request.estimatedCentiHours > 4000) throw new DomainError(Codes.INVALID_INPUT, 'Estimated time must be 0 to 40 hours.', { field: 'estimatedCentiHours' })
  if (Number.isNaN(request.startsAt.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Choose a date and time.', { field: 'startsAt' })
  const date = localDate(calendar, request.startsAt)
  let hours: { open: string; close: string } | null
  try {
    hours = hoursOn(calendar, date)
  } catch (error) {
    throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} has no confirmed hours for ${date} yet. Extend the calendar under Shops.`, { reason: (error as Error).message })
  }
  if (!hours) throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} is closed on ${date}.`)
  const opensAt = zonedInstant(calendar.timeZone, date, hours.open)
  const closesAt = zonedInstant(calendar.timeZone, date, hours.close)
  const t = request.startsAt.getTime()
  if (t < opensAt.getTime() || t >= closesAt.getTime()) throw new DomainError(Codes.OUTSIDE_HOURS, `${shop.code} is open ${hours.open}-${hours.close} on ${date}.`)
  const rules = await capacityRules(tx, shop.id, date)
  if ((t - opensAt.getTime()) % (rules.slotMinutes * 60_000) !== 0) throw new DomainError(Codes.INVALID_INPUT, `Appointments start on ${rules.slotMinutes}-minute slots from opening (${hours.open}).`, { field: 'startsAt' })
  if (t < now.getTime() - 5 * 60_000) throw new DomainError(Codes.INVALID_INPUT, 'That time has passed.', { field: 'startsAt' })
  if (request.source !== 'staff' && t < now.getTime() + rules.leadTimeHours * 3_600_000) throw new DomainError(Codes.CAPACITY_FULL, `Online and phone bookings need ${rules.leadTimeHours} hours' notice. Call the shop for something sooner.`)
  if (request.kind === 'waiter' && rules.noWaitersAfter && localHHMM(calendar, request.startsAt) >= rules.noWaitersAfter) throw new DomainError(Codes.CAPACITY_FULL, `Waiter appointments start before ${rules.noWaitersAfter}. Book a drop-off instead.`)
  // Waiter limits count per local clock hour (10:00-11:00), the way the counter talks about them.
  const hourStart = zonedInstant(calendar.timeZone, date, `${localHHMM(calendar, request.startsAt).slice(0, 2)}:00`)
  return { shop, calendar, date, hours, opensAt, closesAt, rules, hourStart, hourEnd: new Date(hourStart.getTime() + 3_600_000) }
}

const dateOnly = (date: string) => new Date(`${date}T00:00:00Z`)

/** Appointments and live holds that already use capacity on this date (excluding the one being moved). */
export async function usage(tx: Tx, shopId: string, date: string, now: Date, exclude: { appointmentId?: string; holdId?: string } = {}) {
  const day = dateOnly(date)
  const appointments = await tx.appointment.findMany({
    where: { shopId, date: day, status: { in: ACTIVE }, ...(exclude.appointmentId ? { id: { not: exclude.appointmentId } } : {}) },
    select: { id: true, kind: true, startsAt: true, estimatedCentiHours: true },
  })
  const holds = await tx.bookingHold.findMany({
    where: { shopId, date: day, status: 'held', expiresAt: { gt: now }, ...(exclude.holdId ? { id: { not: exclude.holdId } } : {}) },
    select: { id: true, kind: true, slotStart: true, bayCentiHours: true },
  })
  return [
    ...appointments.map(a => ({ kind: a.kind as AppointmentKind, at: a.startsAt!, centiHours: a.estimatedCentiHours ?? 0 })),
    ...holds.map(h => ({ kind: h.kind as AppointmentKind, at: h.slotStart!, centiHours: h.bayCentiHours ?? 0 })),
  ]
}

/** Refuses the slot when it would exceed a rule. Call under the capacity lock. */
export async function assertCapacity(tx: Tx, request: SlotRequest, now: Date, exclude: { appointmentId?: string; holdId?: string } = {}) {
  const slot = await placeSlot(tx, request, now)
  const used = await usage(tx, slot.shop.id, slot.date, now, exclude)
  const { rules } = slot
  if (request.kind === 'drop_off' && rules.maxDropoffsPerDay !== null) {
    const count = used.filter(u => u.kind === 'drop_off').length
    if (count >= rules.maxDropoffsPerDay) throw new DomainError(Codes.CAPACITY_FULL, `${slot.date} is full for drop-offs (${rules.maxDropoffsPerDay} a day). Choose another day.`)
  }
  if (request.kind === 'waiter' && rules.waiterSlotsPerHour !== null) {
    const count = used.filter(u => u.kind === 'waiter' && u.at >= slot.hourStart && u.at < slot.hourEnd).length
    if (count >= rules.waiterSlotsPerHour) throw new DomainError(Codes.CAPACITY_FULL, `The waiter slots for that hour are taken (${rules.waiterSlotsPerHour} an hour). Choose another time.`)
  }
  if (rules.maxBayCentiHoursPerDay !== null) {
    const total = used.reduce((sum, u) => sum + u.centiHours, 0) + request.estimatedCentiHours
    if (total > rules.maxBayCentiHoursPerDay) throw new DomainError(Codes.CAPACITY_FULL, `${slot.date} has no bay time left for a ${request.estimatedCentiHours / 100} h job. Choose another day.`)
  }
  return slot
}

const capacityKey = (shopId: string, date: string) => `capacity:${shopId}:${date}`

async function lockCapacity(uow: UnitOfWork, shopId: string, startsAt: Date) {
  const { calendar } = await loadShopCalendar(uow.tx, shopId)
  const date = localDate(calendar, startsAt)
  await advisoryLock(uow.tx, capacityKey(shopId, date))
  return date
}

/** Hold a slot for ten minutes while the booking is completed (storefront API, phone or SMS agent). Returns a one-time token. */
export async function placeHold(uow: UnitOfWork, actor: Actor, request: SlotRequest) {
  await lockCapacity(uow, request.shopId, request.startsAt)
  const slot = await assertCapacity(uow.tx, request, uow.now)
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(uow.now.getTime() + HOLD_TTL_MINUTES * 60_000)
  const row = await uow.tx.bookingHold.create({
    data: { shopId: request.shopId, date: dateOnly(slot.date), slotStart: request.startsAt, kind: request.kind === 'waiter' ? 'waiter' : 'drop_off', bayCentiHours: request.estimatedCentiHours, tokenHash: sha256(token), source: request.source === 'import' ? 'staff' : request.source, expiresAt, status: 'held' },
  })
  auditCreate(uow, actor, 'BookingHold', row.id, 'booking.hold_placed', { shopId: request.shopId, date: slot.date, kind: request.kind, expiresAt })
  return { holdId: row.id, token, expiresAt }
}

/** Expire holds past their TTL (scheduling expireStaleBookingHolds). Safe to run often. */
export async function expireStaleHolds(uow: UnitOfWork) {
  const result = await uow.tx.bookingHold.updateMany({ where: { status: 'held', expiresAt: { lte: uow.now } }, data: { status: 'expired' } })
  return { expired: result.count }
}

export type BookInput = {
  shopId: string
  startsAt: Date
  kind: AppointmentKind
  estimatedCentiHours?: number
  customerId?: string | null
  vehicleId?: string | null
  lead?: { name: string; phone?: string | null; vehicle?: string | null } | null
  concernText?: string | null
  requestedServices?: string[]
  source: BookingSource
  holdToken?: string | null
  confirm?: boolean
  bayId?: string | null
}

export async function bookAppointment(uow: UnitOfWork, actor: Actor, input: BookInput) {
  const { tx, now } = uow
  if (!input.customerId && !input.lead?.name?.trim()) throw new DomainError(Codes.INVALID_INPUT, 'Choose the customer, or enter a name and phone number for a new one.', { field: 'customerId' })
  if (input.vehicleId && input.customerId) {
    const owned = await tx.vehicleOwnership.count({ where: { vehicleId: input.vehicleId, customerId: input.customerId, endedAt: null } })
    if (!owned) throw new DomainError(Codes.INVALID_INPUT, "This vehicle isn't linked to this customer. Link it first.", { field: 'vehicleId' })
  }
  const concernText = (input.concernText ?? '').trim().slice(0, 2000) || null
  const request: SlotRequest = { shopId: input.shopId, startsAt: input.startsAt, kind: input.kind, estimatedCentiHours: input.estimatedCentiHours ?? 100, source: input.source }
  await lockCapacity(uow, input.shopId, input.startsAt)

  let hold: { id: string } | null = null
  if (input.holdToken) {
    const found = await tx.bookingHold.findUnique({ where: { tokenHash: sha256(input.holdToken) } })
    if (!found || found.shopId !== input.shopId) throw new DomainError(Codes.HOLD_EXPIRED, 'That slot hold was not found. Choose the time again.')
    if (found.status !== 'held' || found.expiresAt! <= now) throw new DomainError(Codes.HOLD_EXPIRED, 'The slot hold expired. Choose the time again.')
    if (found.slotStart!.getTime() !== input.startsAt.getTime()) throw new DomainError(Codes.HOLD_EXPIRED, 'The hold is for a different time. Choose the time again.')
    hold = found
  }
  const slot = await assertCapacity(tx, request, now, hold ? { holdId: hold.id } : {})
  const reference = await nextShopReference(tx, 'APT', slot.shop.code, now)
  const endsAt = new Date(input.startsAt.getTime() + Math.max(30, Math.ceil((request.estimatedCentiHours * 60) / 100)) * 60_000)
  const status = input.confirm ? 'confirmed' : 'requested'
  const row = await tx.appointment.create({
    data: {
      shopId: input.shopId, reference, customerId: input.customerId ?? null, vehicleId: input.vehicleId ?? null,
      lead: input.lead ? ({ name: input.lead.name.trim().slice(0, 120), phone: input.lead.phone?.trim().slice(0, 30) ?? null, vehicle: input.lead.vehicle?.trim().slice(0, 120) ?? null } as never) : undefined,
      date: dateOnly(slot.date), startsAt: input.startsAt, endsAt, kind: input.kind, requestedServices: (input.requestedServices ?? []).slice(0, 20) as never,
      concernText: concernText ?? '', estimatedCentiHours: request.estimatedCentiHours, source: input.source, status, bayId: input.bayId ?? null,
    },
  })
  if (hold) await tx.bookingHold.update({ where: { id: hold.id }, data: { status: 'consumed', appointmentId: row.id } })
  auditCreate(uow, actor, 'Appointment', row.id, 'appointment.requested', { reference, shopId: input.shopId, startsAt: input.startsAt, kind: input.kind, source: input.source, status, holdId: hold?.id ?? null })
  uow.emit({ topic: 'appointment.requested', aggregateType: 'Appointment', aggregateId: row.id, payload: { reference, shopId: input.shopId, startsAt: input.startsAt.toISOString(), status }, dedupeKey: `appointment.requested:${row.id}` })
  if (status === 'confirmed') emitConfirmation(uow, row.id, reference)
  return { id: row.id, reference, status, date: slot.date }
}

/** The confirmation is a transactional message; the sender checks consent and quiet hours when it goes out. */
function emitConfirmation(uow: UnitOfWork, appointmentId: string, reference: string) {
  uow.emit({ topic: 'message.appointment_confirmation', aggregateType: 'Appointment', aggregateId: appointmentId, payload: { reference, purpose: 'transactional' }, dedupeKey: `appointment.confirmed:${appointmentId}` })
}

export async function confirmAppointment(uow: UnitOfWork, actor: Actor, id: string, expectedVersion?: number | null) {
  const row = await transition<Record<string, any>>(uow, {
    model: 'Appointment', id, from: ['requested'], to: 'confirmed', expectedVersion, actor, eventType: 'appointment.confirmed',
    guard: r => { if (!r.customerId) throw new DomainError(Codes.GUARD_FAILED, 'Add the customer to the appointment before confirming it.') },
  })
  emitConfirmation(uow, id, row.reference)
  return { id, status: 'confirmed' }
}

export async function rescheduleAppointment(uow: UnitOfWork, actor: Actor, input: { id: string; startsAt: Date; expectedVersion?: number | null; kind?: AppointmentKind }) {
  const { tx, now } = uow
  const current = await tx.appointment.findUnique({ where: { id: input.id }, select: { shopId: true, startsAt: true } })
  if (!current) throw new DomainError(Codes.NOT_FOUND, 'Appointment not found.')
  // Lock both dates in a fixed order so two reschedules crossing the same days can't deadlock.
  const { calendar } = await loadShopCalendar(tx, current.shopId!)
  const dates = [...new Set([localDate(calendar, current.startsAt!), localDate(calendar, input.startsAt)])].sort()
  for (const date of dates) await advisoryLock(tx, capacityKey(current.shopId!, date))
  const row = await lockRow<Record<string, any>>(tx, 'Appointment', input.id)
  if (!['requested', 'confirmed'].includes(row.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A ${row.status} appointment can't be moved.`, { currentStatus: row.status })
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && row.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This appointment changed since you loaded it. Reload and try again.', { currentVersion: row.version })
  const kind = input.kind ?? (row.kind as AppointmentKind)
  const slot = await assertCapacity(tx, { shopId: row.shopId, startsAt: input.startsAt, kind, estimatedCentiHours: row.estimatedCentiHours ?? 0, source: 'staff' }, now, { appointmentId: row.id })
  const endsAt = new Date(input.startsAt.getTime() + (row.endsAt.getTime() - row.startsAt.getTime()))
  await tx.appointment.update({ where: { id: row.id }, data: { startsAt: input.startsAt, endsAt, date: dateOnly(slot.date), kind, version: { increment: 1 } } })
  uow.audit({ eventType: 'appointment.rescheduled', entityType: 'Appointment', entityId: row.id, actorUserId: actorUserId(actor), before: { startsAt: row.startsAt, kind: row.kind }, after: { startsAt: input.startsAt, kind } })
  uow.emit({ topic: 'message.appointment_rescheduled', aggregateType: 'Appointment', aggregateId: row.id, payload: { reference: row.reference, startsAt: input.startsAt.toISOString(), purpose: 'transactional' }, dedupeKey: `appointment.rescheduled:${row.id}:${row.version + 1}` })
  return { id: row.id, date: slot.date }
}

export async function cancelAppointment(uow: UnitOfWork, actor: Actor, input: { id: string; reason: string; expectedVersion?: number | null }) {
  const reason = input.reason?.trim()
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the appointment is cancelled.', { field: 'reason' })
  const row = await transition<Record<string, any>>(uow, { model: 'Appointment', id: input.id, from: ['requested', 'confirmed'], to: 'cancelled', expectedVersion: input.expectedVersion, actor, eventType: 'appointment.cancelled', reason, data: { cancelReason: reason.slice(0, 300) } })
  uow.emit({ topic: 'appointment.cancelled', aggregateType: 'Appointment', aggregateId: input.id, payload: { reference: row.reference }, dedupeKey: `appointment.cancelled:${input.id}` })
  return { id: input.id, status: 'cancelled' }
}

async function graceMinutes(tx: Tx, shopId: string) {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { shopPolicyId: true } })
  const policy = shop?.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId }, select: { noShowGraceMinutes: true } }) : null
  return policy?.noShowGraceMinutes ?? 30
}

/** No-show: only after the start time plus the shop's grace period. Counts against the customer. */
export async function markNoShow(uow: UnitOfWork, actor: Actor, input: { id: string; expectedVersion?: number | null }) {
  const { tx, now } = uow
  const current = await tx.appointment.findUnique({ where: { id: input.id }, select: { shopId: true } })
  if (!current) throw new DomainError(Codes.NOT_FOUND, 'Appointment not found.')
  const grace = await graceMinutes(tx, current.shopId!)
  const row = await transition<Record<string, any>>(uow, {
    model: 'Appointment', id: input.id, from: ['requested', 'confirmed'], to: 'no_show', expectedVersion: input.expectedVersion, actor, eventType: 'appointment.no_show',
    guard: r => {
      const due = r.startsAt.getTime() + grace * 60_000
      if (now.getTime() < due) throw new DomainError(Codes.GUARD_FAILED, `Wait until ${grace} minutes after the start time before marking a no-show.`)
    },
  })
  if (row.customerId) await tx.customer.update({ where: { id: row.customerId }, data: { noShowCount: { increment: 1 } } })
  return { id: input.id, status: 'no_show' }
}

/** Worker sweep: confirmed appointments past start + grace with no check-in become no-shows. */
export async function sweepNoShows(uow: UnitOfWork, actor: Actor) {
  const candidates = await uow.tx.appointment.findMany({ where: { status: { in: ['requested', 'confirmed'] }, startsAt: { lt: new Date(uow.now.getTime() - 30 * 60_000) } }, select: { id: true }, take: 200 })
  let marked = 0
  for (const c of candidates) {
    try {
      await markNoShow(uow, actor, { id: c.id })
      marked += 1
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== Codes.GUARD_FAILED) throw error
    }
  }
  return { marked }
}
