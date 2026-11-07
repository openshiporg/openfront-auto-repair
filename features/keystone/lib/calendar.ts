/**
 * Shop-hours calendars (SCHEMA §1.3, DOMAIN §3). Dates are "YYYY-MM-DD" strings in the shop's own
 * time zone; a date never implies a time. Unknown dates fail closed: a calendar only answers inside
 * its coverage, so no appointment, promise time or obligation due date is computed on a guess.
 *
 * The database (ShopCalendar + ShopCalendarException) is the source of truth; `fromRows` turns
 * those rows into a CalendarSpec for pure computation.
 */

import { wallClockInstant, zonedDate } from '../../../lib/zonedTime'

export type DayHours = { dow: number; open: string; close: string }

export type CalendarSpec = {
  code: string
  timeZone: string
  /** Regular weekly hours; a weekday with no entry is closed. dow 0 = Sunday. */
  weeklyHours: readonly DayHours[]
  /** Dates the shop is closed all day. */
  closures: ReadonlySet<string>
  /** Dates with special hours (late open or early close). */
  specialHours: ReadonlyMap<string, { open: string; close: string }>
  coverageThrough: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function assertDate(date: string) {
  if (!DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new Error(`Invalid date ${date}`)
}

export function assertHours(hours: readonly DayHours[]) {
  for (const h of hours) {
    if (!Number.isInteger(h.dow) || h.dow < 0 || h.dow > 6) throw new Error(`Invalid weekday ${h.dow}`)
    if (!HHMM.test(h.open) || !HHMM.test(h.close) || h.open >= h.close) throw new Error(`Invalid hours ${h.open}-${h.close}`)
  }
  if (new Set(hours.map(h => h.dow)).size !== hours.length) throw new Error('One opening window per weekday')
}

export function addDays(date: string, days: number) {
  assertDate(date)
  const t = Date.parse(`${date}T12:00:00Z`) + days * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()

function covered(calendar: CalendarSpec, date: string) {
  if (date > calendar.coverageThrough) throw new Error(`${calendar.code} has no verified schedule for ${date}`)
}

/** Opening window for a date, or null when the shop is closed. */
export function hoursOn(calendar: CalendarSpec, date: string): { open: string; close: string } | null {
  assertDate(date)
  covered(calendar, date)
  if (calendar.closures.has(date)) return null
  const special = calendar.specialHours.get(date)
  if (special) return special
  const regular = calendar.weeklyHours.find(h => h.dow === weekday(date))
  return regular ? { open: regular.open, close: regular.close } : null
}

export function isBusinessDay(calendar: CalendarSpec, date: string) {
  return hoursOn(calendar, date) !== null
}

export function nextBusinessDay(calendar: CalendarSpec, date: string) {
  let d = addDays(date, 1)
  while (!isBusinessDay(calendar, d)) d = addDays(d, 1)
  return d
}

export function previousBusinessDay(calendar: CalendarSpec, date: string) {
  let d = addDays(date, -1)
  while (!isBusinessDay(calendar, d)) d = addDays(d, -1)
  return d
}

/** date + n business days (a negative n counts back). */
export function addBusinessDays(calendar: CalendarSpec, date: string, n: number) {
  let d = date
  for (let i = 0; i < Math.abs(n); i += 1) d = n > 0 ? nextBusinessDay(calendar, d) : previousBusinessDay(calendar, d)
  return d
}

/** Business days in (from, to]. */
export function businessDaysBetween(calendar: CalendarSpec, from: string, to: string) {
  let count = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isBusinessDay(calendar, d)) count += 1
  return count
}

/** The shop-local date of an instant (never the server's midnight). */
export function localDate(calendar: Pick<CalendarSpec, 'timeZone'>, at: Date | number) {
  return zonedDate(calendar.timeZone, at)
}

/** The UTC instant of a local wall-clock time on a date in the given zone (DST-safe). */
export function zonedInstant(timeZone: string, date: string, hhmm: string) {
  assertDate(date)
  return wallClockInstant(timeZone, date, hhmm)
}

export type Session = { date: string; businessDay: boolean; phase: 'open' | 'closed'; opensAt: Date | null; closesAt: Date | null; specialHours: boolean }

/** Whether the shop is open at an instant, with that day's opening window. */
export function sessionAt(calendar: CalendarSpec, at: Date | number): Session {
  const t = typeof at === 'number' ? at : at.getTime()
  const date = localDate(calendar, t)
  const hours = hoursOn(calendar, date)
  if (!hours) return { date, businessDay: false, phase: 'closed', opensAt: null, closesAt: null, specialHours: false }
  const opensAt = zonedInstant(calendar.timeZone, date, hours.open)
  const closesAt = zonedInstant(calendar.timeZone, date, hours.close)
  const phase = t >= opensAt.getTime() && t < closesAt.getTime() ? 'open' : 'closed'
  return { date, businessDay: true, phase, opensAt, closesAt, specialHours: calendar.specialHours.has(date) }
}

type CalendarRow = { name?: string; weeklyHours: unknown; coverageThrough: Date | string | null }
type ExceptionRow = { date: Date | string; closed: boolean; open?: string | null; close?: string | null }

const isoDate = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** Build a CalendarSpec from ShopCalendar + ShopCalendarException rows. */
export function fromRows(code: string, timeZone: string, calendar: CalendarRow, exceptions: readonly ExceptionRow[]): CalendarSpec {
  const weeklyHours = (Array.isArray(calendar.weeklyHours) ? calendar.weeklyHours : []) as DayHours[]
  assertHours(weeklyHours)
  if (!calendar.coverageThrough) throw new Error(`${code} calendar has no coverage date`)
  const closures = new Set<string>()
  const specialHours = new Map<string, { open: string; close: string }>()
  for (const e of exceptions) {
    const date = isoDate(e.date)
    if (e.closed) closures.add(date)
    else if (e.open && e.close) {
      assertHours([{ dow: 0, open: e.open, close: e.close }])
      specialHours.set(date, { open: e.open, close: e.close })
    }
  }
  return { code, timeZone, weeklyHours, closures, specialHours, coverageThrough: isoDate(calendar.coverageThrough) }
}
