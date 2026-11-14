/** Display helpers for the customer site. Money stays in whole minor units; nothing here uses a float for it. */

export function money(minor: string | bigint | number | null | undefined) {
  if (minor === null || minor === undefined || minor === '') return ''
  const text = String(minor).trim()
  if (!/^-?\d+$/.test(text)) return ''
  const negative = text.startsWith('-')
  const digits = text.replace('-', '').padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}$${whole}.${digits.slice(-2)}`
}

/** "PT", "CT": the short everyday name of a time zone. */
export function zoneLabel(timeZone: string, at: Date = new Date()) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortGeneric' }).formatToParts(at).find(p => p.type === 'timeZoneName')
    return part?.value ?? ''
  } catch {
    return ''
  }
}

/** "07:30" → "7:30 AM". */
export function clock(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "2:30 PM PT" for an instant at the shop. */
export function timeAt(at: Date | string, timeZone: string) {
  const date = typeof at === 'string' ? new Date(at) : at
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date)
  return `${time} ${zoneLabel(timeZone, date)}`.trim()
}

/** "Fri, Nov 13" for an instant at the shop. */
export function dayAt(at: Date | string, timeZone: string) {
  const date = typeof at === 'string' ? new Date(at) : at
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(date)
}

/** "Fri, Nov 13, 2:30 PM PT". */
export const dateTimeAt = (at: Date | string, timeZone: string) => `${dayAt(at, timeZone)}, ${timeAt(at, timeZone)}`

/** A calendar date ("2026-11-13") as "Fri, Nov 13". */
export function dayOfDate(date: string | null | undefined) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T12:00:00Z`))
}

/** "+19165550142" → "(916) 555-0142". */
export function phone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length !== 10) return String(value ?? '')
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
}

/** 75 centi-hours → "45 min"; 100 → "1 hour". */
export function duration(centiHours: number | null | undefined) {
  if (!centiHours || centiHours <= 0) return ''
  const minutes = Math.round((centiHours * 60) / 100)
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  if (Number.isInteger(hours)) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  return `${Math.floor(hours)} h ${minutes % 60} min`
}

/** "in_service" → "In service". */
export function words(value: string | null | undefined) {
  const text = String(value ?? '').replaceAll('_', ' ').trim()
  return text ? text[0].toUpperCase() + text.slice(1) : ''
}

const RO_STATUS: Record<string, string> = {
  checked_in: 'Checked in. Your vehicle is at the shop.',
  in_service: 'In service. We are working on your vehicle.',
  on_hold: 'On hold. We are waiting on parts or on your answer.',
  ready: 'Ready for pick-up.',
  completed: 'Work is finished.',
  invoiced: 'Work is finished and invoiced.',
  closed: 'Closed. Thank you.',
  cancelled: 'Cancelled.',
}
export const repairStatus = (status: string) => RO_STATUS[status] ?? `${words(status)}.`

const JOB_STATUS: Record<string, string> = {
  offered: 'Waiting for your answer',
  needs_reauthorization: 'Changed: needs your answer again',
  authorized: 'Approved',
  in_progress: 'Approved, in progress',
  completed: 'Done',
  declined: 'Declined',
  deferred: 'Saved for later',
}
export const jobStatus = (status: string) => JOB_STATUS[status] ?? words(status)
