import { describe, expect, it } from 'vitest'
import { Decimal } from './decimal'
import { addDays, addMonths, addYears, invoiceStatus, payerWeights, spreadPayment, splitLine, totalsOf, type BillLine } from './invoiceMath'

// A small deterministic generator, so a failing case can be replayed from its seed.
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000 }
}
const KINDS = ['labor', 'part', 'part', 'fee', 'sublet', 'tire', 'core', 'refrigerant', 'discount']

function randomLines(r: () => number): BillLine[] {
  const n = 1 + Math.floor(r() * 12)
  return Array.from({ length: n }, () => {
    const kind = KINDS[Math.floor(r() * KINDS.length)]
    const ext = BigInt(Math.floor(r() * 250_000)) * (kind === 'discount' ? -1n : 1n)
    const taxRate = r() < 0.6 ? 0.0875 : 0
    const tax = kind === 'discount' || taxRate === 0 ? 0n : BigInt(Math.round(Number(ext) * taxRate))
    return { kind, extendedMinor: ext, taxMinor: tax }
  })
}

describe('invoice totals', () => {
  it('equal the sum of the rounded lines for 1,000 random repair orders', () => {
    const r = rng(20261107)
    for (let i = 0; i < 1000; i += 1) {
      const lines = randomLines(r)
      const t = totalsOf(lines)
      const lineSum = lines.reduce((a, l) => a + l.extendedMinor + l.taxMinor, 0n)
      expect(t.totalMinor).toBe(lineSum)
      expect(t.laborSubtotalMinor + t.partsSubtotalMinor + t.feesSubtotalMinor + t.subletSubtotalMinor + t.discountMinor + t.taxMinor).toBe(t.totalMinor)
    }
  })

  it('split among payers adds back to the repair order to the cent, for 1,000 random splits', () => {
    const r = rng(7)
    for (let i = 0; i < 1000; i += 1) {
      const lines = randomLines(r)
      const whole = totalsOf(lines)
      const payers = 2 + Math.floor(r() * 3)
      const raw = Array.from({ length: payers }, () => 1 + Math.floor(r() * 90))
      const sum = raw.reduce((a, b) => a + b, 0)
      const percents = raw.map(x => new Decimal(x).times(100).div(sum).toDecimalPlaces(4))
      const deductible = r() < 0.5 ? BigInt(Math.floor(r() * 30_000)) : 0n
      const shares = percents.map((p, k) => ({ key: String(k), percent: p, deductibleMinor: k === 0 ? deductible : 0n }))
      const jobTotal = whole.totalMinor > 0n ? whole.totalMinor : 0n
      const weights = payerWeights(jobTotal, shares)
      const perPayer = weights.map(() => [] as BillLine[])
      for (const line of lines) splitLine(line, weights).forEach((part, k) => perPayer[k].push(part))
      const totals = perPayer.map(totalsOf)
      expect(totals.reduce((a, t) => a + t.totalMinor, 0n)).toBe(whole.totalMinor)
      expect(totals.reduce((a, t) => a + t.taxMinor, 0n)).toBe(whole.taxMinor)
      for (const [k, t] of totals.entries()) expect(t.totalMinor).toBe(perPayer[k].reduce((a, l) => a + l.extendedMinor + l.taxMinor, 0n))
    }
  })

  it('charges the customer the deductible first on a warranty-style split', () => {
    const w = payerWeights(100_000n, [{ key: 'customer', percent: new Decimal(0), deductibleMinor: 10_000n }, { key: 'insurer', percent: new Decimal(100) }])
    const [customer, insurer] = splitLine({ kind: 'labor', extendedMinor: 100_000n, taxMinor: 0n }, w)
    expect(customer.extendedMinor).toBe(10_000n)
    expect(insurer.extendedMinor).toBe(90_000n)
  })
})

describe('spreading a payment', () => {
  it('never allocates more than each invoice owes, and the shares add up', () => {
    const r = rng(99)
    for (let i = 0; i < 1000; i += 1) {
      const balances = Array.from({ length: 1 + Math.floor(r() * 4) }, () => BigInt(1 + Math.floor(r() * 90_000)))
      const owed = balances.reduce((a, b) => a + b, 0n)
      const amount = BigInt(Math.floor(r() * Number(owed) + 1))
      const shares = spreadPayment(amount, balances)
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(amount)
      shares.forEach((s, k) => { expect(s <= balances[k]).toBe(true); expect(s >= 0n).toBe(true) })
    }
  })
  it('refuses more than is owed', () => {
    expect(() => spreadPayment(101n, [100n])).toThrow()
  })
})

describe('dates and status', () => {
  it('keeps records four years in California', () => {
    expect(addYears('2026-11-07', 4)).toBe('2030-11-07')
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29')
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28')
  })
  it('adds warranty months without overflowing short months', () => {
    expect(addMonths('2026-08-31', 24)).toBe('2028-08-31')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04')
  })
  it('moves the invoice through its states from its money', () => {
    expect(invoiceStatus({ totalMinor: 100n, paidMinor: 0n, creditedMinor: 0n, sent: false })).toBe('finalized')
    expect(invoiceStatus({ totalMinor: 100n, paidMinor: 0n, creditedMinor: 0n, sent: true })).toBe('sent')
    expect(invoiceStatus({ totalMinor: 100n, paidMinor: 40n, creditedMinor: 0n, sent: true })).toBe('partially_paid')
    expect(invoiceStatus({ totalMinor: 100n, paidMinor: 100n, creditedMinor: 0n, sent: true })).toBe('paid')
    expect(invoiceStatus({ totalMinor: 100n, paidMinor: 0n, creditedMinor: 100n, sent: true })).toBe('credited')
  })
})
