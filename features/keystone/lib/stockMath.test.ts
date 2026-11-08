import { describe, expect, it } from 'vitest'
import { computeMovement, extendMinor, weightedAverage, type Levels } from './stockMath'

const level = (over: Partial<Levels> = {}): Levels => ({ onHandMilli: 0, committedMilli: 0, onOrderMilli: 0, averageCostMinor: 0n, ...over })

describe('stock ledger math (I-S1)', () => {
  it('receives at the paid cost and closes on-order, never below zero', () => {
    const r = computeMovement(level({ onOrderMilli: 4000 }), { type: 'receipt', quantityMilli: 6000, unitCostMinor: 1250n })
    expect(r.levels).toEqual({ onHandMilli: 6000, committedMilli: 0, onOrderMilli: 0, averageCostMinor: 1250n })
    expect(r.deltas.onOrderMilli).toBe(-4000)
  })

  it('keeps a weighted-average cost across receipts', () => {
    const first = computeMovement(level(), { type: 'receipt', quantityMilli: 4000, unitCostMinor: 1000n })
    const second = computeMovement(first.levels, { type: 'receipt', quantityMilli: 6000, unitCostMinor: 1500n })
    // (4 × 10.00 + 6 × 15.00) / 10 = 13.00
    expect(second.levels.averageCostMinor).toBe(1300n)
    expect(weightedAverage(3000, 999n, 1000, 1000n)).toBe(999n)
  })

  it('issues at the average cost and leaves the average alone', () => {
    const r = computeMovement(level({ onHandMilli: 10000, averageCostMinor: 1300n }), { type: 'issue', quantityMilli: 2000 })
    expect(r.unitCostMinor).toBe(1300n)
    expect(r.levels.onHandMilli).toBe(8000)
    expect(r.levels.averageCostMinor).toBe(1300n)
    expect(extendMinor(2000, r.unitCostMinor)).toBe(2600n)
  })

  it('never issues more than is on hand', () => {
    expect(() => computeMovement(level({ onHandMilli: 1000 }), { type: 'issue', quantityMilli: 1001 })).toThrow(/on hand|free/)
    expect(() => computeMovement(level({ onHandMilli: 0 }), { type: 'issue', quantityMilli: 1 })).toThrow()
  })

  it('keeps other jobs\' reservations out of reach but lets the reserved job issue them', () => {
    const shelf = level({ onHandMilli: 5000, committedMilli: 4000, averageCostMinor: 500n })
    expect(() => computeMovement(shelf, { type: 'issue', quantityMilli: 2000 })).toThrow(/free to issue/)
    const own = computeMovement(shelf, { type: 'issue', quantityMilli: 2000, fromCommittedMilli: 2000 })
    expect(own.levels).toMatchObject({ onHandMilli: 3000, committedMilli: 2000 })
  })

  it('commits only what is free and releases only what is committed', () => {
    expect(() => computeMovement(level({ onHandMilli: 2000, committedMilli: 1500 }), { type: 'commit', quantityMilli: 600 })).toThrow()
    expect(() => computeMovement(level({ onHandMilli: 2000 }), { type: 'release', quantityMilli: 1 })).toThrow()
    expect(computeMovement(level({ onHandMilli: 2000 }), { type: 'commit', quantityMilli: 2000 }).levels.committedMilli).toBe(2000)
  })

  it('posts a count variance in either direction without going below what is reserved', () => {
    const base = level({ onHandMilli: 12000, committedMilli: 3000, averageCostMinor: 800n })
    expect(computeMovement(base, { type: 'count', quantityMilli: -2000 }).levels.onHandMilli).toBe(10000)
    expect(computeMovement(base, { type: 'count', quantityMilli: 1000 }).levels.onHandMilli).toBe(13000)
    expect(() => computeMovement(base, { type: 'count', quantityMilli: -9500 })).toThrow(/reserved/)
    expect(() => computeMovement(base, { type: 'count', quantityMilli: 0 })).toThrow()
  })

  it('tracks orders on order and cancels no more than that', () => {
    const ordered = computeMovement(level(), { type: 'po_order', quantityMilli: 3000 })
    expect(ordered.levels.onOrderMilli).toBe(3000)
    expect(() => computeMovement(ordered.levels, { type: 'po_cancel', quantityMilli: 3001 })).toThrow()
    expect(computeMovement(ordered.levels, { type: 'po_cancel', quantityMilli: 3000 }).levels.onOrderMilli).toBe(0)
  })

  it('returns to stock at the carried cost and to the supplier only from the free shelf', () => {
    const shelf = level({ onHandMilli: 2000, committedMilli: 1500, averageCostMinor: 700n })
    expect(computeMovement(shelf, { type: 'return_to_stock', quantityMilli: 1000 }).levels).toMatchObject({ onHandMilli: 3000, averageCostMinor: 700n })
    expect(() => computeMovement(shelf, { type: 'return_to_supplier', quantityMilli: 600 })).toThrow()
    expect(computeMovement(shelf, { type: 'return_to_supplier', quantityMilli: 500 }).levels.onHandMilli).toBe(1500)
  })

  it('refuses fractions of a milli-unit and a receipt with no cost', () => {
    expect(() => computeMovement(level(), { type: 'receipt', quantityMilli: 1.5, unitCostMinor: 1n })).toThrow()
    expect(() => computeMovement(level(), { type: 'receipt', quantityMilli: 1000 })).toThrow(/cost/)
  })

  it('rounds the extended cost half up to the cent', () => {
    expect(extendMinor(1500, 333n)).toBe(500n) // 499.5 → 500
    expect(extendMinor(333, 100n)).toBe(33n)
  })
})
