import { addDays, hoursOn, localDate, zonedInstant } from '@/features/keystone/lib/calendar'
import { capacityRules, loadShopCalendar, usage, type AppointmentKind } from '@/features/keystone/lib/scheduling'
import { isDomainError } from '@/features/keystone/lib/errors'
import { storefrontDb } from './data'
import { timeAt } from './format'

/*
 * The open times a customer can pick. This reads the same calendar, booking rules and booked
 * appointments that the booking itself checks (scheduling.assertCapacity), once per day instead of
 * once per slot. It only decides what to offer: the booking checks the slot again under the lock.
 */

export type OpenTime = { iso: string; time: string }
export type OpenDay = { date: string; label: string; times: OpenTime[] }

const dayLabel = (date: string, today: string) => {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`))
}

export async function openDays(input: { shopId: string; kind: AppointmentKind; centiHours: number; days?: number; perDay?: number }): Promise<OpenDay[]> {
  const db = storefrontDb()
  const now = new Date()
  const wanted = input.days ?? 5
  const out: OpenDay[] = []
  let calendar
  try {
    calendar = (await loadShopCalendar(db, input.shopId)).calendar
  } catch (error) {
    if (isDomainError(error)) return []
    throw error
  }
  const today = localDate(calendar, now)
  for (let i = 0; i < 21 && out.length < wanted; i += 1) {
    const date = addDays(today, i)
    let hours: { open: string; close: string } | null
    try {
      hours = hoursOn(calendar, date)
    } catch {
      break // past the calendar's confirmed coverage
    }
    if (!hours) continue
    const rules = await capacityRules(db, input.shopId, date)
    const used = await usage(db, input.shopId, date, now)
    const opensAt = zonedInstant(calendar.timeZone, date, hours.open).getTime()
    const closesAt = zonedInstant(calendar.timeZone, date, hours.close).getTime()
    const earliest = Math.max(now.getTime(), now.getTime() + rules.leadTimeHours * 3_600_000)

    if (rules.maxBayCentiHoursPerDay !== null && used.reduce((n, u) => n + u.centiHours, 0) + input.centiHours > rules.maxBayCentiHoursPerDay) continue
    if (input.kind === 'drop_off' && rules.maxDropoffsPerDay !== null && used.filter(u => u.kind === 'drop_off').length >= rules.maxDropoffsPerDay) continue

    const times: OpenTime[] = []
    for (let t = opensAt; t < closesAt; t += rules.slotMinutes * 60_000) {
      if (t < earliest) continue
      const at = new Date(t)
      if (input.kind === 'waiter') {
        const hhmm = new Intl.DateTimeFormat('en-US', { timeZone: calendar.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
        if (rules.noWaitersAfter && hhmm >= rules.noWaitersAfter) continue
        if (rules.waiterSlotsPerHour !== null) {
          const hourStart = zonedInstant(calendar.timeZone, date, `${hhmm.slice(0, 2)}:00`).getTime()
          const taken = used.filter(u => u.kind === 'waiter' && u.at.getTime() >= hourStart && u.at.getTime() < hourStart + 3_600_000).length
          if (taken >= rules.waiterSlotsPerHour) continue
        }
      }
      times.push({ iso: at.toISOString(), time: timeAt(at, calendar.timeZone) })
      if (input.perDay && times.length >= input.perDay) break
    }
    if (times.length) out.push({ date, label: dayLabel(date, today), times })
  }
  return out
}

/** The next few open times across days, each with its day: "Today 2:30 PM PT", "Tomorrow 7:30 AM PT". */
export function nextTimes(days: OpenDay[], count: number) {
  // The first time of each day first, so the choices are spread over days; then later times fill what is left.
  const first = days.map(d => ({ iso: d.times[0].iso, label: `${d.label} ${d.times[0].time}` }))
  const rest = days.flatMap(d => d.times.slice(1).map(t => ({ iso: t.iso, label: `${d.label} ${t.time}` })))
  return [...first, ...rest].slice(0, count).sort((a, b) => a.iso.localeCompare(b.iso))
}
