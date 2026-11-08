import { allocateMinor, sumMinor } from './money'
import { Decimal, dec } from './decimal'

/*
 * Invoice arithmetic, pure and exact (SCHEMA G3, D§3.8). An invoice total is always the sum of its
 * already-rounded lines; a split between payers is made line by line with largest-remainder
 * allocation, so each payer's invoice is also the sum of its own whole-cent lines and the payers'
 * invoices add back to the repair order to the cent.
 */

export type BillLine = { kind: string; extendedMinor: bigint; taxMinor: bigint }

const PART_KINDS = ['part', 'tire', 'core', 'refrigerant']

export type InvoiceTotals = {
  laborSubtotalMinor: bigint
  partsSubtotalMinor: bigint
  feesSubtotalMinor: bigint
  subletSubtotalMinor: bigint
  discountMinor: bigint
  taxMinor: bigint
  totalMinor: bigint
}

export function totalsOf(lines: BillLine[]): InvoiceTotals {
  const of = (kinds: string[]) => sumMinor(lines.filter(l => kinds.includes(l.kind)).map(l => l.extendedMinor))
  const laborSubtotalMinor = of(['labor'])
  const partsSubtotalMinor = of(PART_KINDS)
  const feesSubtotalMinor = of(['fee'])
  const subletSubtotalMinor = of(['sublet'])
  const discountMinor = of(['discount'])
  const taxMinor = sumMinor(lines.map(l => l.taxMinor))
  return { laborSubtotalMinor, partsSubtotalMinor, feesSubtotalMinor, subletSubtotalMinor, discountMinor, taxMinor, totalMinor: laborSubtotalMinor + partsSubtotalMinor + feesSubtotalMinor + subletSubtotalMinor + discountMinor + taxMinor }
}

/** A payer's share of one job: a percentage, with an optional fixed deductible the customer pays first. */
export type PayerShare = { key: string; percent: Decimal; deductibleMinor?: bigint }

/**
 * Weights for splitting one job among payers. A deductible is paid first by the payer that owes it
 * (the customer), and the rest is shared by percentage among everyone.
 */
export function payerWeights(jobTotalMinor: bigint, shares: PayerShare[]): Decimal[] {
  if (!shares.length) throw new Error('payerWeights needs at least one payer')
  const percentSum = shares.reduce((a, s) => a.plus(s.percent), new Decimal(0))
  if (percentSum.isZero()) throw new Error('payer percentages must not all be zero')
  const deductible = shares.reduce((a, s) => a + (s.deductibleMinor ?? 0n), 0n)
  if (jobTotalMinor <= 0n || deductible <= 0n) return shares.map(s => s.percent)
  const capped = deductible > jobTotalMinor ? jobTotalMinor : deductible
  const rest = dec(jobTotalMinor - capped)
  return shares.map(s => {
    const own = s.deductibleMinor && deductible > 0n ? dec(capped).times(dec(s.deductibleMinor)).div(dec(deductible)) : new Decimal(0)
    return own.plus(rest.times(s.percent).div(percentSum))
  })
}

/** Split one line's amount and tax across payers; both parts sum back to the line exactly. */
export function splitLine(line: BillLine, weights: Decimal[]): BillLine[] {
  const ext = allocateMinor(line.extendedMinor, weights)
  const tax = allocateMinor(line.taxMinor, weights)
  return weights.map((_, i) => ({ kind: line.kind, extendedMinor: ext[i], taxMinor: tax[i] }))
}

/** Spread a payment across invoices in proportion to what each still owes; never more than a balance. */
export function spreadPayment(amountMinor: bigint, balances: bigint[]): bigint[] {
  const owed = sumMinor(balances)
  if (amountMinor < 0n) throw new Error('A payment cannot be negative')
  if (amountMinor > owed) throw new Error('A payment cannot exceed what is owed')
  if (amountMinor === 0n || owed === 0n) return balances.map(() => 0n)
  if (balances.length === 1) return [amountMinor]
  const shares = allocateMinor(amountMinor, balances.map(b => b.toString()))
  return shares.map((s, i) => (s > balances[i] ? balances[i] : s))
}

/** "2026-11-07" plus whole days / years, as a calendar date with no time zone involved. */
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function addMonths(date: string, months: number) {
  const [y, m, day] = date.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target.toISOString().slice(0, 10)
}
export const addYears = (date: string, years: number) => addMonths(date, years * 12)

/** The invoice's status from its money. */
export function invoiceStatus(input: { totalMinor: bigint; paidMinor: bigint; creditedMinor: bigint; sent: boolean }) {
  const balance = input.totalMinor - input.paidMinor - input.creditedMinor
  if (balance <= 0n) return input.paidMinor > 0n ? 'paid' : input.creditedMinor > 0n ? 'credited' : 'paid'
  if (input.paidMinor > 0n) return 'partially_paid'
  return input.sent ? 'sent' : 'finalized'
}
