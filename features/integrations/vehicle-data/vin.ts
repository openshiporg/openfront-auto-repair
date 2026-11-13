/**
 * VIN handling done locally, before any provider call (INTEGRATIONS §1.2). Normalisation follows the
 * dealership `normalizeVin`: uppercase, trimmed, 17 characters, no I, O or Q. The ISO 3779 / 49 CFR 565
 * check digit (position 9) is computed here.
 *
 * A wrong check digit is a warning, never a block. Real VINs with typos exist on paperwork, and
 * non-North-American VINs don't always use the check digit. The advisor confirms year, make and model
 * instead (I-V1).
 */

export type VinValidity = 'valid' | 'check_digit_warning' | 'invalid_format' | 'none'

const VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/

export function normalizeVin(value: unknown): string {
  return String(value ?? '').replace(/[\s-]/g, '').toUpperCase()
}

/** The expected check digit ('0'-'9' or 'X') for a 17-character VIN in the allowed alphabet. */
export function vinCheckDigit(vin: string): string {
  let sum = 0
  for (let i = 0; i < 17; i += 1) {
    const ch = vin[i]
    const value = /\d/.test(ch) ? Number(ch) : VALUES[ch]
    if (value === undefined) throw new Error('VIN contains a character that is not allowed')
    sum += value * WEIGHTS[i]
  }
  const remainder = sum % 11
  return remainder === 10 ? 'X' : String(remainder)
}

export function checkVin(value: unknown): { vin: string | null; validity: VinValidity; message: string } {
  const vin = normalizeVin(value)
  if (!vin) return { vin: null, validity: 'none', message: 'No VIN.' }
  if (!VIN_PATTERN.test(vin)) {
    return { vin, validity: 'invalid_format', message: 'A VIN has 17 letters and digits and never uses I, O or Q. Pre-1981 vehicles may have shorter numbers.' }
  }
  const expected = vinCheckDigit(vin)
  if (vin[8] !== expected) {
    return { vin, validity: 'check_digit_warning', message: `The check digit (9th character) should be ${expected}. Check the VIN against the door jamb or windshield plate; the visit can go ahead.` }
  }
  return { vin, validity: 'valid', message: 'VIN format and check digit are correct.' }
}

/** Returns the VIN with its check digit corrected (test helper). */
export function withCheckDigit(vin17: string): string {
  const vin = normalizeVin(vin17)
  return `${vin.slice(0, 8)}${vinCheckDigit(vin)}${vin.slice(9)}`
}
