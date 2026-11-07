/**
 * Display formatting for exact values. Inputs are the strings GraphQL returns for bigInt and
 * decimal fields; nothing here turns money into a float.
 */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function splitDecimal(value: string) {
  const text = value.trim()
  const negative = text.startsWith('-')
  const [whole = '0', fraction = ''] = text.replace(/^[+-]/, '').split('.')
  return { negative, whole: whole.replace(/^0+(?=\d)/, '') || '0', fraction }
}

/** Minor units ("123456") → "$1,234.56". */
export function money(minor: string | bigint | null | undefined, currency = 'USD', digits = 2) {
  if (minor === null || minor === undefined || minor === '') return '—'
  const text = String(minor)
  if (!/^-?\d+$/.test(text)) return '—'
  const negative = text.startsWith('-')
  const abs = text.replace('-', '').padStart(digits + 1, '0')
  const whole = abs.slice(0, abs.length - digits)
  const fraction = digits ? `.${abs.slice(-digits)}` : ''
  const symbol = currency === 'USD' ? '$' : `${currency} `
  return `${negative ? '−' : ''}${symbol}${group(whole.replace(/^0+(?=\d)/, ''))}${fraction}`
}

/** An exact decimal string trimmed to at most `maxPlaces` (truncating display only) and at least `minPlaces`. */
export function decimalText(value: string | null | undefined, options: { minPlaces?: number; maxPlaces?: number; prefix?: string } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  if (!/^[+-]?\d*(\.\d*)?$/.test(String(value).trim())) return '—'
  const { negative, whole, fraction } = splitDecimal(String(value))
  const max = options.maxPlaces ?? 10
  const min = options.minPlaces ?? 0
  let f = fraction.slice(0, max).replace(/0+$/, '')
  if (f.length < min) f = f.padEnd(min, '0')
  const isZero = /^0*$/.test(whole + f)
  return `${negative && !isZero ? '−' : ''}${options.prefix ?? ''}${group(whole)}${f ? `.${f}` : ''}`
}

/** Labor time from integer centi-hours: 125 → "1.25 h". */
export function hours(centi: number | null | undefined) {
  if (centi === null || centi === undefined) return '—'
  return `${decimalText(`${Math.trunc(centi / 100)}.${String(Math.abs(centi % 100)).padStart(2, '0')}`, { maxPlaces: 2 })} h`
}

/** A quantity from integer milli-units: 5700 → "5.7". */
export function milli(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return decimalText(`${sign}${Math.trunc(abs / 1000)}.${String(abs % 1000).padStart(3, '0')}`, { maxPlaces: 3 })
}

/** A fraction stored as an exact decimal string ("0.0875") shown as a percentage ("8.75%"). */
export function percent(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  const m = String(value).trim().match(/^(-?)(\d*)\.?(\d*)$/)
  if (!m) return '—'
  const digits = (m[3] || '').padEnd(2, '0')
  const whole = `${m[2] || '0'}${digits.slice(0, 2)}`.replace(/^0+(?=\d)/, '')
  return `${decimalText(`${m[1]}${whole}.${digits.slice(2)}`, { maxPlaces: 4 })}%`
}

export function when(iso: string | null | undefined, tz = 'America/Los_Angeles', style: 'full' | 'time' | 'day' | 'seconds' = 'full') {
  if (!iso) return ''
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions =
    style === 'time' ? { hour: 'numeric', minute: '2-digit' }
    : style === 'seconds' ? { hour: 'numeric', minute: '2-digit', second: '2-digit' }
    : style === 'day' ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: style === 'day' ? undefined : 'short', ...opts }).format(d)
}

export const label = (value: string | null | undefined) => (value || '').replaceAll('_', ' ')
