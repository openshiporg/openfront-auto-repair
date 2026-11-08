import { Codes, DomainError } from './errors'

/**
 * The stock ledger's arithmetic (I-S1), ported from the dealership parts ledger and kept in integer
 * milli-units. Pure: it takes the levels and a movement and returns the new levels, or refuses.
 * Nothing here touches the database, so the rules can be tested without one.
 */

export const MOVEMENT_TYPES = ['receipt', 'issue', 'return_to_stock', 'return_to_supplier', 'adjustment', 'count', 'commit', 'release', 'po_order', 'po_cancel'] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export type Levels = { onHandMilli: number; committedMilli: number; onOrderMilli: number; averageCostMinor: bigint }

export type MovementRequest = {
  type: MovementType
  /** Magnitude for every type except adjustment and count, where it is signed (count: counted minus on hand). */
  quantityMilli: number
  /** Cost per whole unit for receipts and returns to stock. Issues use the average cost. */
  unitCostMinor?: bigint
  /** How much of an issue was reserved for the job beforehand (it leaves committed as it leaves on hand). */
  fromCommittedMilli?: number
}

export type MovementResult = {
  levels: Levels
  deltas: { onHandMilli: number; committedMilli: number; onOrderMilli: number }
  /** Cost per whole unit that this movement carries: the basis for issues, the paid price for receipts. */
  unitCostMinor: bigint
}

const refuse = (message: string, field = 'quantityMilli'): never => {
  throw new DomainError(Codes.GUARD_FAILED, message, { field })
}

const whole = (value: number, field: string) => {
  if (!Number.isSafeInteger(value)) throw new DomainError(Codes.INVALID_INPUT, 'Quantity must be a whole number of thousandths.', { field })
  return value
}

/** Quantity in milli-units times a per-unit cost, rounded half up to a cent. */
export function extendMinor(quantityMilli: number, unitCostMinor: bigint): bigint {
  const raw = BigInt(quantityMilli) * unitCostMinor
  const negative = raw < 0n
  const abs = negative ? -raw : raw
  const rounded = (abs + 500n) / 1000n
  return negative ? -rounded : rounded
}

/** Weighted-average cost after receiving `quantityMilli` at `unitCostMinor` on top of the current stock. */
export function weightedAverage(onHandMilli: number, averageCostMinor: bigint, quantityMilli: number, unitCostMinor: bigint): bigint {
  if (onHandMilli <= 0) return unitCostMinor
  const total = BigInt(onHandMilli) * averageCostMinor + BigInt(quantityMilli) * unitCostMinor
  const divisor = BigInt(onHandMilli + quantityMilli)
  return (total * 2n + divisor) / (divisor * 2n)
}

export function computeMovement(current: Levels, request: MovementRequest): MovementResult {
  const q = whole(request.quantityMilli, 'quantityMilli')
  const cost = request.unitCostMinor
  if (cost !== undefined && cost < 0n) throw new DomainError(Codes.INVALID_INPUT, 'Cost cannot be negative.', { field: 'unitCostMinor' })
  const available = current.onHandMilli - current.committedMilli
  let d = { onHandMilli: 0, committedMilli: 0, onOrderMilli: 0 }
  let unitCostMinor = current.averageCostMinor
  let averageCostMinor = current.averageCostMinor

  const positive = () => { if (q <= 0) refuse('Quantity must be above zero.') }
  switch (request.type) {
    case 'receipt': {
      positive()
      if (cost === undefined) throw new DomainError(Codes.INVALID_INPUT, 'A receipt needs the cost paid.', { field: 'unitCostMinor' })
      averageCostMinor = weightedAverage(current.onHandMilli, current.averageCostMinor, q, cost)
      unitCostMinor = cost
      // Receiving against an order closes that much of the on-order quantity, never more than is on order.
      d = { onHandMilli: q, committedMilli: 0, onOrderMilli: -Math.min(q, current.onOrderMilli) }
      break
    }
    case 'issue': {
      positive()
      const reserved = Math.min(whole(request.fromCommittedMilli ?? 0, 'fromCommittedMilli'), q, current.committedMilli)
      const unreserved = q - reserved
      if (unreserved > available) refuse(`Only ${formatMilli(Math.max(available, 0))} is free to issue; the rest is reserved for other jobs or not on the shelf.`)
      if (q > current.onHandMilli) refuse(`Only ${formatMilli(current.onHandMilli)} is on hand.`)
      d = { onHandMilli: -q, committedMilli: -reserved, onOrderMilli: 0 }
      break
    }
    case 'return_to_stock': {
      positive()
      d = { onHandMilli: q, committedMilli: 0, onOrderMilli: 0 }
      // A part that comes back re-enters at the cost it left with, so the average does not move.
      break
    }
    case 'return_to_supplier': {
      positive()
      if (q > available) refuse(`Only ${formatMilli(Math.max(available, 0))} is free to send back.`)
      d = { onHandMilli: -q, committedMilli: 0, onOrderMilli: 0 }
      break
    }
    case 'adjustment':
    case 'count': {
      if (q === 0) refuse('There is nothing to adjust.')
      if (q < 0 && -q > current.onHandMilli) refuse(`Only ${formatMilli(current.onHandMilli)} is on hand.`)
      if (current.onHandMilli + q < current.committedMilli) refuse('That would leave less on hand than is reserved for jobs.')
      d = { onHandMilli: q, committedMilli: 0, onOrderMilli: 0 }
      if (q > 0 && cost !== undefined && cost > 0n) averageCostMinor = weightedAverage(current.onHandMilli, current.averageCostMinor, q, cost)
      break
    }
    case 'commit': {
      positive()
      if (q > available) refuse(`Only ${formatMilli(Math.max(available, 0))} is free to reserve.`)
      d = { onHandMilli: 0, committedMilli: q, onOrderMilli: 0 }
      break
    }
    case 'release': {
      positive()
      if (q > current.committedMilli) refuse('That is more than is reserved.')
      d = { onHandMilli: 0, committedMilli: -q, onOrderMilli: 0 }
      break
    }
    case 'po_order': {
      positive()
      d = { onHandMilli: 0, committedMilli: 0, onOrderMilli: q }
      break
    }
    case 'po_cancel': {
      positive()
      if (q > current.onOrderMilli) refuse('That is more than is on order.')
      d = { onHandMilli: 0, committedMilli: 0, onOrderMilli: -q }
      break
    }
    default:
      throw new DomainError(Codes.INVALID_INPUT, 'Unknown stock movement.', { field: 'type' })
  }

  const levels: Levels = {
    onHandMilli: current.onHandMilli + d.onHandMilli,
    committedMilli: current.committedMilli + d.committedMilli,
    onOrderMilli: current.onOrderMilli + d.onOrderMilli,
    averageCostMinor,
  }
  // The same three checks the database holds (I-S1).
  if (levels.onHandMilli < 0 || levels.committedMilli < 0 || levels.committedMilli > levels.onHandMilli || levels.onOrderMilli < 0) {
    refuse('That would make the stock levels impossible.')
  }
  return { levels, deltas: d, unitCostMinor }
}

export function formatMilli(value: number) {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const frac = String(abs % 1000).padStart(3, '0').replace(/0+$/, '')
  return `${sign}${Math.trunc(abs / 1000)}${frac ? `.${frac}` : ''}`
}
