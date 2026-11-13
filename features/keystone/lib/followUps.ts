import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import type { UnitOfWork } from './unitOfWork'
import type { Tx } from './db'
import { addMonths } from './invoiceMath'

/*
 * Declined-work follow-ups and service reminders (STATE-MACHINES §16, adapted: no timers).
 * Nothing runs on a schedule. What is due is worked out when a page loads from dates and odometer readings, and a person
 * presses "Mark contacted" after they called or texted the customer themselves. Pressing it twice records it once.
 */

const DAY = 86_400_000
const dayOf = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const todayIn = (timeZone: string, now: Date) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now) } catch { return dayOf(now) }
}
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00Z`)
const diffDays = (a: string, b: string) => Math.round((dateOnly(a).getTime() - dateOnly(b).getTime()) / DAY)

// ── Recommendations ──────────────────────────────────────────────────────────

/** Called when a customer declines or defers a job. One recommendation per decision. */
export async function recordRecommendation(uow: UnitOfWork, actor: Actor, input: { jobId: string; decisionId: string; decision: 'declined' | 'deferred'; at: Date; deferUntil: Date | null; deferMiles: number | null; reason: string }) {
  const { tx } = uow
  const job = await tx.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { id: true, title: true, urgency: true, totalMinor: true, repairOrderId: true, repairOrder: { select: { id: true, shopId: true, customerId: true, vehicleId: true } } } })
  const ro = job.repairOrder
  if (!ro?.customerId || !ro.vehicleId || !ro.shopId) return null
  const key = `${job.id}:${input.decisionId}`
  const existing = await tx.recommendation.findUnique({ where: { sourceJobKey: key }, select: { id: true } })
  if (existing) return { id: existing.id }
  const row = await tx.recommendation.create({
    data: {
      shopId: ro.shopId, customerId: ro.customerId, vehicleId: ro.vehicleId, repairOrderId: ro.id, sourceJobId: job.id, sourceJobKey: key, title: job.title, urgency: job.urgency || 'none',
      decision: input.decision, priceSnapshotMinor: job.totalMinor, evidence: { reason: input.reason, deferMiles: input.deferMiles } as never, declinedAt: input.at, deferUntil: input.deferUntil, deferMiles: input.deferMiles,
    },
  })
  auditCreate(uow, actor, 'Recommendation', row.id, 'recommendation.created', { jobId: job.id, decision: input.decision, urgency: job.urgency })
  return { id: row.id }
}

export type CadenceInput = { declinedAt: Date | string; deferUntil: Date | string | null; contactedCount: number; lastContactedAt: Date | string | null }

/**
 * When the next follow-up is due, from the shop's cadence in days after the decline (for example 3, 30, 90).
 * The days count from the shop's calendar day of the decline (an evening decline in Pacific time is still that day).
 * A deferred job with a date waits for that date first. Once every step has been done there is no next one.
 */
export function nextFollowUp(rec: CadenceInput, cadenceDays: number[], timeZone = 'America/Los_Angeles'): { step: number; of: number; dueOn: string } | null {
  const steps = cadenceDays.filter(n => Number.isFinite(n) && n >= 0)
  const declinedDay = todayIn(timeZone, new Date(rec.declinedAt))
  const n = rec.contactedCount
  if (n >= steps.length) return null
  let dueOn = dayOf(addDays(dateOnly(declinedDay), steps[n]))
  if (rec.deferUntil && n === 0) {
    const until = dayOf(new Date(rec.deferUntil))
    if (until > dueOn) dueOn = until
  }
  return { step: n + 1, of: steps.length, dueOn }
}

export function cadenceOf(policy: { followUpCadenceDays?: unknown } | null): number[] {
  const raw = policy?.followUpCadenceDays
  const list = Array.isArray(raw) ? raw.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 730) : []
  return list.length ? list : [3, 30, 90]
}

export async function markRecommendationContacted(uow: UnitOfWork, actor: Actor, input: { recommendationId: string; channel: string; note?: string | null; expectedContactedCount: number }) {
  if (!['call', 'text', 'email', 'in_person'].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how you reached the customer.', { field: 'channel' })
  const rec = await lockRow<any>(uow.tx, 'Recommendation', input.recommendationId)
  if (rec.status !== 'open') throw new DomainError(Codes.INVALID_TRANSITION, `This recommendation is ${rec.status}.`, { currentStatus: rec.status })
  // Pressed twice (or from two screens): the second press sees a different count and records nothing.
  if (rec.contactedCount !== input.expectedContactedCount) return { id: rec.id, changed: false, contactedCount: rec.contactedCount }
  const row = await uow.tx.recommendation.update({ where: { id: rec.id }, data: { contactedCount: { increment: 1 }, lastContactedAt: uow.now, version: { increment: 1 } } })
  auditCreate(uow, actor, 'Recommendation', rec.id, 'recommendation.contacted', { channel: input.channel, step: row.contactedCount, note: String(input.note ?? '').slice(0, 300) })
  return { id: rec.id, changed: true, contactedCount: row.contactedCount }
}

export async function dismissRecommendation(uow: UnitOfWork, actor: Actor, input: { recommendationId: string; reason: string }) {
  const reason = String(input.reason ?? '').trim().slice(0, 300)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why you are closing this one.', { field: 'reason' })
  const rec = await lockRow<any>(uow.tx, 'Recommendation', input.recommendationId)
  if (rec.status === 'dismissed') return { id: rec.id, changed: false }
  if (rec.status !== 'open') throw new DomainError(Codes.INVALID_TRANSITION, `This recommendation is ${rec.status}.`, { currentStatus: rec.status })
  await uow.tx.recommendation.update({ where: { id: rec.id }, data: { status: 'dismissed', dismissedReason: reason, version: { increment: 1 } } })
  auditCreate(uow, actor, 'Recommendation', rec.id, 'recommendation.dismissed', { reason })
  return { id: rec.id, changed: true }
}

/** Recommendations that are open and due now (or coming up within `soonDays`), most overdue first. */
export async function recommendationBoard(tx: Tx, input: { shopIds: string[] | 'all'; now: Date; soonDays?: number }) {
  const rows = await tx.recommendation.findMany({
    where: { status: 'open', ...(input.shopIds === 'all' ? {} : { shopId: { in: input.shopIds } }) },
    orderBy: { declinedAt: 'asc' }, take: 500,
    include: { customer: { select: { id: true, displayName: true } }, vehicle: { select: { id: true, year: true, make: true, model: true } }, shop: { select: { id: true, name: true, timeZone: true, shopPolicy: { select: { followUpCadenceDays: true } } } }, repairOrder: { select: { roNumber: true } } },
  })
  const out = []
  for (const r of rows) {
    const today = todayIn(r.shop?.timeZone ?? 'America/Los_Angeles', input.now)
    const next = nextFollowUp({ declinedAt: r.declinedAt!, deferUntil: r.deferUntil, contactedCount: r.contactedCount ?? 0, lastContactedAt: r.lastContactedAt }, cadenceOf(r.shop?.shopPolicy ?? null), r.shop?.timeZone ?? 'America/Los_Angeles')
    if (!next) continue
    const late = diffDays(today, next.dueOn)
    if (late < -(input.soonDays ?? 7)) continue
    out.push({
      id: r.id, title: r.title, urgency: r.urgency, decision: r.decision, priceMinor: r.priceSnapshotMinor?.toString() ?? '0', declinedAt: r.declinedAt, contactedCount: r.contactedCount ?? 0, lastContactedAt: r.lastContactedAt,
      customer: r.customer, vehicle: r.vehicle, shop: r.shop ? { id: r.shop.id, name: r.shop.name } : null, repairOrder: r.repairOrder?.roNumber ?? '', step: next.step, steps: next.of, dueOn: next.dueOn, daysLate: late, state: late >= 0 ? 'due' : 'soon',
    })
  }
  return out.sort((a, b) => b.daysLate - a.daysLate)
}

// ── Service reminders ────────────────────────────────────────────────────────

export type ReminderKind = 'oil' | 'rotation' | 'inspection'
export const REMINDER_KINDS: ReminderKind[] = ['oil', 'rotation', 'inspection']
export const DEFAULT_INTERVALS: Record<ReminderKind, { miles: number; months: number }> = { oil: { miles: 5000, months: 6 }, rotation: { miles: 7500, months: 6 }, inspection: { miles: 12000, months: 12 } }
const DEFAULT_MILES_PER_DAY = 33

export function reminderKindOf(title: string, kind: string): ReminderKind | null {
  const t = title.toLowerCase()
  if (/\boil\b/.test(t)) return 'oil'
  if (/rotat/.test(t)) return 'rotation'
  if (kind === 'inspection' || /inspection/.test(t)) return 'inspection'
  return null
}

/** Miles per day from the odometer history, when it spans at least 30 days; otherwise a typical 12,000 miles a year. */
export function milesPerDay(readings: { value: number; at: Date | string }[]): number {
  const sorted = [...readings].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  if (sorted.length < 2) return DEFAULT_MILES_PER_DAY
  const first = sorted[0], last = sorted[sorted.length - 1]
  const days = (new Date(last.at).getTime() - new Date(first.at).getTime()) / DAY
  const miles = last.value - first.value
  if (days < 30 || miles <= 0) return DEFAULT_MILES_PER_DAY
  return Math.min(250, Math.max(5, miles / days))
}

export type ReminderCalc = { dueOn: string; dueAtOdometer: number | null; projectedDueOn: string | null; dueDate: string; state: 'due' | 'soon' | 'later'; daysLate: number }

/** Pure: when a service is next due from the date of the last one, the odometer then and now, and the usual driving rate. */
export function computeReminder(input: { servicedOn: string; serviceOdometer: number | null; currentOdometer: number | null; today: string; interval: { miles: number; months: number }; perDay: number; soonDays?: number }): ReminderCalc {
  // Month-end clamps: Aug 31 + 6 months is Feb 28 (or 29), not Mar 3.
  const dueOn = addMonths(input.servicedOn, input.interval.months)
  const dueAtOdometer = input.serviceOdometer !== null ? input.serviceOdometer + input.interval.miles : null
  let projectedDueOn: string | null = null
  if (dueAtOdometer !== null && input.currentOdometer !== null) {
    const left = dueAtOdometer - input.currentOdometer
    projectedDueOn = left <= 0 ? input.today : dayOf(addDays(dateOnly(input.today), Math.ceil(left / input.perDay)))
  }
  const dueDate = projectedDueOn && projectedDueOn < dueOn ? projectedDueOn : dueOn
  const late = diffDays(input.today, dueDate)
  return { dueOn, dueAtOdometer, projectedDueOn, dueDate, daysLate: late, state: late >= 0 ? 'due' : late >= -(input.soonDays ?? 14) ? 'soon' : 'later' }
}

/** Reminders due now or soon, from completed services. A reminder staff already marked contacted for this service stays hidden. */
export async function reminderBoard(tx: Tx, input: { shopIds: string[] | 'all'; now: Date; includeLater?: boolean; limit?: number }) {
  const jobs = await tx.job.findMany({
    where: { status: 'completed', completedAt: { not: null }, repairOrder: { customerId: { not: null }, vehicleId: { not: null }, ...(input.shopIds === 'all' ? {} : { shopId: { in: input.shopIds } }) } },
    orderBy: { completedAt: 'desc' }, take: 2000,
    select: {
      id: true, title: true, kind: true, completedAt: true,
      repairOrder: { select: { id: true, shopId: true, roNumber: true, customerId: true, vehicleId: true, odometerOut: { select: { value: true } }, odometerIn: { select: { value: true } }, shop: { select: { name: true, timeZone: true } } } },
    },
  })
  const latest = new Map<string, (typeof jobs)[number] & { rk: ReminderKind }>()
  for (const j of jobs) {
    const rk = reminderKindOf(j.title, j.kind)
    const vid = j.repairOrder?.vehicleId
    if (!rk || !vid) continue
    const k = `${vid}:${rk}`
    if (!latest.has(k)) latest.set(k, { ...j, rk })
  }
  const vehicleIds = [...new Set([...latest.values()].map(j => j.repairOrder!.vehicleId!))]
  const vehicles = await tx.vehicle.findMany({ where: { id: { in: vehicleIds }, status: 'active' }, select: { id: true, year: true, make: true, model: true, lastOdometer: true, maintenanceIntervals: true, odometerReadings: { select: { value: true, at: true }, orderBy: { at: 'asc' }, take: 60 } } })
  const byVehicle = new Map(vehicles.map(v => [v.id, v]))
  const customers = await tx.customer.findMany({ where: { id: { in: [...new Set([...latest.values()].map(j => j.repairOrder!.customerId!))] }, status: 'active' }, select: { id: true, displayName: true } })
  const byCustomer = new Map(customers.map(c => [c.id, c]))
  const done = await tx.serviceReminder.findMany({ where: { cycleKey: { in: [...latest.values()].map(j => `${j.repairOrder!.vehicleId}:${j.rk}:${j.id}`) } }, select: { cycleKey: true } })
  const doneKeys = new Set(done.map(d => d.cycleKey))
  const out = []
  for (const j of latest.values()) {
    const ro = j.repairOrder!
    const v = byVehicle.get(ro.vehicleId!)
    const c = byCustomer.get(ro.customerId!)
    if (!v || !c) continue
    const cycleKey = `${v.id}:${j.rk}:${j.id}`
    if (doneKeys.has(cycleKey)) continue
    const custom = (v.maintenanceIntervals as Record<string, { miles?: number; months?: number }> | null)?.[j.rk]
    const interval = { miles: Number(custom?.miles) > 0 ? Number(custom!.miles) : DEFAULT_INTERVALS[j.rk].miles, months: Number(custom?.months) > 0 ? Number(custom!.months) : DEFAULT_INTERVALS[j.rk].months }
    const today = todayIn(ro.shop?.timeZone ?? 'America/Los_Angeles', input.now)
    const calc = computeReminder({
      servicedOn: dayOf(j.completedAt!), serviceOdometer: ro.odometerOut?.value ?? ro.odometerIn?.value ?? null, currentOdometer: v.lastOdometer ?? null, today, interval, perDay: milesPerDay(v.odometerReadings.filter(r => r.at).map(r => ({ value: r.value, at: r.at! }))),
    })
    if (calc.state === 'later' && !input.includeLater) continue
    out.push({ cycleKey, kind: j.rk, jobId: j.id, jobTitle: j.title, repairOrderId: ro.id, repairOrder: ro.roNumber, shop: { id: ro.shopId, name: ro.shop?.name ?? '' }, customer: c, vehicle: { id: v.id, year: v.year, make: v.make, model: v.model }, servicedOn: dayOf(j.completedAt!), ...calc })
  }
  return out.sort((a, b) => b.daysLate - a.daysLate).slice(0, input.limit ?? 300)
}

export async function markReminderContacted(uow: UnitOfWork, actor: Actor, input: { cycleKey: string; channel: string; note?: string | null }) {
  if (!['call', 'text', 'email', 'in_person'].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how you reached the customer.', { field: 'channel' })
  const [vehicleId, kind, jobId] = String(input.cycleKey ?? '').split(':')
  if (!vehicleId || !REMINDER_KINDS.includes(kind as ReminderKind) || !jobId) throw new DomainError(Codes.INVALID_INPUT, 'That reminder is not valid.')
  const { tx, now } = uow
  const existing = await tx.serviceReminder.findUnique({ where: { cycleKey: input.cycleKey }, select: { id: true } })
  if (existing) return { id: existing.id, changed: false }
  const job = await tx.job.findUnique({ where: { id: jobId }, select: { id: true, status: true, repairOrder: { select: { shopId: true, customerId: true, vehicleId: true } } } })
  if (!job || job.status !== 'completed' || job.repairOrder?.vehicleId !== vehicleId || !job.repairOrder.customerId || !job.repairOrder.shopId) throw new DomainError(Codes.NOT_FOUND, 'That service is not on record.')
  const row = await tx.serviceReminder.create({
    data: { shopId: job.repairOrder.shopId, vehicleId, customerId: job.repairOrder.customerId, kind, cycleKey: input.cycleKey, lastServiceJobId: job.id, contactChannel: input.channel, note: String(input.note ?? '').slice(0, 300), contactedAt: now, contactedById: actorUserId(actor) },
  })
  auditCreate(uow, actor, 'ServiceReminder', row.id, 'reminder.contacted', { vehicleId, kind, channel: input.channel })
  return { id: row.id, changed: true }
}
