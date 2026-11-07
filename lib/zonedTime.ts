/**
 * Pure wall-clock ↔ instant conversion for an IANA time zone (DST-safe). No imports, so both the
 * domain core (features/keystone/lib/calendar) and client screens use the same arithmetic.
 */
export const zoneParts = (timeZone: string, at: number) =>
  Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]))

/** The local "YYYY-MM-DD" of an instant in a zone (never the server's midnight). */
export function zonedDate(timeZone: string, at: Date | number) {
  const p = zoneParts(timeZone, typeof at === 'number' ? at : at.getTime())
  return `${p.year}-${p.month}-${p.day}`
}

/** The UTC instant of a local wall-clock time ("HH:mm") on a "YYYY-MM-DD" date in the zone. */
export function wallClockInstant(timeZone: string, date: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(x => Number.parseInt(x, 10))
  let guess = Date.parse(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  for (let i = 0; i < 3; i += 1) {
    const p = zoneParts(timeZone, guess)
    const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
    const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m)
    const diff = target - local
    if (diff === 0) break
    guess += diff
  }
  return new Date(guess)
}
