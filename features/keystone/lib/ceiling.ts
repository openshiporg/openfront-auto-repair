import { dec, toScale } from './decimal'
import { DomainError, Codes } from './errors'

/**
 * The authorized ceiling (DOMAIN I-R4, STATE-MACHINES §2):
 *   chargeCeiling(job) = authorized(job) + tolerance(policy, authorized(job))
 * Tolerance is a typed rule stored on the pinned JurisdictionPolicyVersion, never code in data.
 * Everything is integer cents; percentages are exact decimal strings rounded half-even once.
 *
 *   CA §3354  { kind: 'fixed', fixedMinor: 0 }                                  → no tolerance
 *   FL        { kind: 'max_of', percent: '0.10', fixedMinor: 1000, capMinor: 5000 }
 *   MI        { kind: 'min_of', percent: '0.10', fixedMinor: 5000 }
 *   WA        { kind: 'percent', percent: '0.10', includesTax: false }
 */
export type ToleranceRule = {
  kind: 'fixed' | 'percent' | 'max_of' | 'min_of'
  percent?: string
  fixedMinor?: string | number | bigint
  capMinor?: string | number | bigint | null
  includesTax: boolean
}

const PCT = /^(0(\.\d{1,6})?|1(\.0{1,6})?)$/

const big = (value: string | number | bigint | null | undefined, field: string): bigint => {
  if (value === null || value === undefined) throw new DomainError(Codes.INVALID_INPUT, `Tolerance rule needs ${field}.`, { field })
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  throw new DomainError(Codes.INVALID_INPUT, `${field} must be whole cents.`, { field })
}

/** Validate a stored rule (used when a policy version is drafted or published). */
export function parseToleranceRule(input: unknown): ToleranceRule {
  const r = (input ?? {}) as Record<string, unknown>
  const kind = r.kind
  if (kind !== 'fixed' && kind !== 'percent' && kind !== 'max_of' && kind !== 'min_of') throw new DomainError(Codes.INVALID_INPUT, 'Tolerance kind must be fixed, percent, max_of or min_of.', { field: 'kind' })
  if (typeof r.includesTax !== 'boolean') throw new DomainError(Codes.INVALID_INPUT, 'Tolerance rule must say whether it includes tax.', { field: 'includesTax' })
  const rule: ToleranceRule = { kind, includesTax: r.includesTax }
  if (kind !== 'fixed') {
    if (typeof r.percent !== 'string' || !PCT.test(r.percent)) throw new DomainError(Codes.INVALID_INPUT, 'Tolerance percent must be a decimal fraction from 0 to 1, e.g. "0.10".', { field: 'percent' })
    rule.percent = r.percent
  }
  if (kind !== 'percent') rule.fixedMinor = big(r.fixedMinor as never, 'fixedMinor').toString()
  if (r.capMinor !== undefined && r.capMinor !== null) rule.capMinor = big(r.capMinor as never, 'capMinor').toString()
  if (rule.fixedMinor !== undefined && BigInt(rule.fixedMinor) < 0n) throw new DomainError(Codes.INVALID_INPUT, 'fixedMinor cannot be negative.', { field: 'fixedMinor' })
  return rule
}

const percentOf = (amountMinor: bigint, percent: string): bigint => BigInt(toScale(dec(amountMinor).times(dec(percent)), 0))

/** Tolerance in cents for an authorized amount. */
export function toleranceMinor(ruleInput: ToleranceRule | unknown, authorizedMinor: bigint): bigint {
  if (authorizedMinor < 0n) throw new DomainError(Codes.INVALID_INPUT, 'Authorized amount cannot be negative.')
  const rule = parseToleranceRule(ruleInput)
  let value: bigint
  switch (rule.kind) {
    case 'fixed': value = BigInt(rule.fixedMinor!); break
    case 'percent': value = percentOf(authorizedMinor, rule.percent!); break
    case 'max_of': { const p = percentOf(authorizedMinor, rule.percent!); const f = BigInt(rule.fixedMinor!); value = p > f ? p : f; break }
    case 'min_of': { const p = percentOf(authorizedMinor, rule.percent!); const f = BigInt(rule.fixedMinor!); value = p < f ? p : f; break }
  }
  if (rule.capMinor !== undefined && rule.capMinor !== null && value > BigInt(rule.capMinor)) value = BigInt(rule.capMinor)
  return value
}

export const chargeCeilingMinor = (rule: ToleranceRule | unknown, authorizedMinor: bigint) => authorizedMinor + toleranceMinor(rule, authorizedMinor)

/**
 * The guard every price-changing command runs for an authorized job. `taxMinor` is added to the
 * compared price only when the rule says the tolerance includes tax.
 */
export function assertWithinCeiling(input: { rule: ToleranceRule | unknown; authorizedMinor: bigint; priceMinor: bigint; taxMinor?: bigint; jobId?: string }) {
  const rule = parseToleranceRule(input.rule)
  const compared = input.priceMinor + (rule.includesTax ? input.taxMinor ?? 0n : 0n)
  const ceiling = chargeCeilingMinor(rule, input.authorizedMinor)
  if (compared > ceiling) {
    throw new DomainError(Codes.REAUTHORIZATION_REQUIRED, `This job would cost more than the customer authorized (ceiling ${ceiling} cents, now ${compared}). Send a revised estimate and record a new authorization.`, {
      jobId: input.jobId ?? null, authorizedMinor: input.authorizedMinor.toString(), ceilingMinor: ceiling.toString(), priceMinor: compared.toString(),
    })
  }
  return { ceilingMinor: ceiling, comparedMinor: compared }
}
