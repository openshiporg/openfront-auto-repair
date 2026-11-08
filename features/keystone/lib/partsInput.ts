import { Codes, DomainError } from './errors'

/** Input checks for the parts commands. Quantities are whole thousandths, money is whole cents as a string. */

export function milliOf(value: unknown, field: string, options: { min?: number; max?: number } = {}) {
  const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Math.trunc(+value.trim()) : value
  const min = options.min ?? 1
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > (options.max ?? 100_000_000)) {
    throw new DomainError(Codes.INVALID_INPUT, `${field} must be a whole number of thousandths${min >= 1 ? ' above zero' : ''}.`, { field })
  }
  return n
}

export function centsOf(value: unknown, field: string, required = true): bigint {
  if (value === null || value === undefined || value === '') {
    if (required) throw new DomainError(Codes.INVALID_INPUT, `${field} is needed, in whole cents.`, { field })
    return 0n
  }
  const text = String(value).trim()
  if (!/^\d{1,12}$/.test(text)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be whole cents.`, { field })
  return BigInt(text)
}

export function textOf(value: unknown, field: string, max: number, required = false) {
  const text = String(value ?? '').trim().slice(0, max)
  if (required && !text) throw new DomainError(Codes.INVALID_INPUT, `${field} is needed.`, { field })
  return text
}

export function idOf(value: unknown, field: string) {
  if (typeof value !== 'string' || !value || value.length > 64) throw new DomainError(Codes.INVALID_INPUT, `Choose ${field}.`, { field })
  return value
}

export function choiceOf<T extends string>(value: unknown, allowed: readonly T[], field: string, fallback?: T): T {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback
  if (!allowed.includes(value as T)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be one of: ${allowed.join(', ')}.`, { field })
  return value as T
}

export function objectOf(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DomainError(Codes.INVALID_INPUT, `${field} is needed.`, { field })
  return value as Record<string, any>
}

export function listOf(value: unknown, field: string, max = 200): any[] {
  if (!Array.isArray(value) || value.length === 0) throw new DomainError(Codes.INVALID_INPUT, `Add at least one line to ${field}.`, { field })
  if (value.length > max) throw new DomainError(Codes.INVALID_INPUT, `${field} can hold ${max} lines at most.`, { field })
  return value
}

export const cents = (minor: bigint) => {
  const t = (minor < 0n ? -minor : minor).toString().padStart(3, '0')
  return `${minor < 0n ? '-' : ''}$${t.slice(0, -2)}.${t.slice(-2)}`
}
