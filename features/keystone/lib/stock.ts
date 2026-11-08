import { actorUserId, type Actor } from './actor'
import { auditCreate, lockRow } from './cas'
import { advisoryLock } from './db'
import { Codes, DomainError } from './errors'
import { computeMovement, extendMinor, type Levels, type MovementType } from './stockMath'
import type { UnitOfWork } from './unitOfWork'
import { centsOf, choiceOf, textOf } from './partsInput'

/**
 * The only writer of StockLevel quantities (I-S1). It takes the per-item advisory lock and the row
 * lock, computes the new levels with stockMath, updates the level and writes the immutable ledger
 * row in the same transaction. The database refuses a quantity change without the flag set here,
 * and refuses a ledger row that disagrees with the level.
 */

export type PostMovement = {
  shopItemId: string
  type: MovementType
  quantityMilli: number
  unitCostMinor?: bigint
  fromCommittedMilli?: number
  jobId?: string | null
  supplierOrderLineId?: string | null
  cycleCountId?: string | null
  reason?: string
  /** Same key → the same movement; it is never applied twice. */
  key: string
}

export type PostedMovement = { movementId: string; replay: boolean; levels: Levels; unitCostMinor: bigint; quantityMilli: number }

const asLevels = (row: Record<string, any>): Levels => ({
  onHandMilli: row.onHandMilli, committedMilli: row.committedMilli, onOrderMilli: row.onOrderMilli, averageCostMinor: BigInt(row.averageCostMinor),
})

export async function postMovement(uow: UnitOfWork, actor: Actor, input: PostMovement): Promise<PostedMovement> {
  const { tx, now } = uow
  const existing = await tx.stockMovement.findUnique({ where: { idempotencyKey: input.key } })
  if (existing) {
    const after = existing.after as { onHand: number; committed: number; onOrder: number; avgCost: string }
    return { movementId: existing.id, replay: true, levels: { onHandMilli: after.onHand, committedMilli: after.committed, onOrderMilli: after.onOrder, averageCostMinor: BigInt(after.avgCost) }, unitCostMinor: existing.unitCostMinor, quantityMilli: existing.quantityMilli }
  }
  const item = await tx.shopItem.findUnique({ where: { id: input.shopItemId }, select: { id: true, stockId: true, sku: true } })
  if (!item?.stockId) throw new DomainError(Codes.NOT_FOUND, 'That part is not in the shop\'s item list.', { field: 'shopItemId' })
  await advisoryLock(tx, `stock:${item.id}`)
  const level = await lockRow<Record<string, any>>(tx, 'StockLevel', item.stockId)
  const result = computeMovement(asLevels(level), {
    type: input.type, quantityMilli: input.quantityMilli, unitCostMinor: input.unitCostMinor, fromCommittedMilli: input.fromCommittedMilli,
  })
  const next = result.levels
  await tx.$executeRaw`SELECT set_config('app.stock_movement', 'on', true)`
  await tx.stockLevel.update({
    where: { id: item.stockId },
    data: {
      onHandMilli: next.onHandMilli, committedMilli: next.committedMilli, onOrderMilli: next.onOrderMilli, averageCostMinor: next.averageCostMinor,
      ...(input.type === 'count' ? { lastCountedAt: now } : {}), version: { increment: 1 },
    },
  })
  await tx.$executeRaw`SELECT set_config('app.stock_movement', 'off', true)`
  const d = result.deltas
  const signed = d.onHandMilli || d.committedMilli || d.onOrderMilli
  const row = await tx.stockMovement.create({
    data: {
      shopItemId: item.id, type: input.type, quantityMilli: signed, unitCostMinor: result.unitCostMinor,
      onHandDeltaMilli: d.onHandMilli, committedDeltaMilli: d.committedMilli, onOrderDeltaMilli: d.onOrderMilli,
      jobId: input.jobId ?? null, supplierOrderLineId: input.supplierOrderLineId ?? null, cycleCountId: input.cycleCountId ?? null,
      reason: input.reason ?? '', idempotencyKey: input.key, actorUserId: actorUserId(actor), actorName: actor.kind === 'system' ? actor.name : actor.name ?? '', at: now,
      after: { onHand: next.onHandMilli, committed: next.committedMilli, onOrder: next.onOrderMilli, avgCost: next.averageCostMinor.toString() },
    },
  })
  auditCreate(uow, actor, 'StockMovement', row.id, `stock.${input.type}`, {
    sku: item.sku, quantityMilli: signed, unitCostMinor: result.unitCostMinor, onHand: next.onHandMilli, committed: next.committedMilli, onOrder: next.onOrderMilli,
  }, { reason: input.reason || null })
  return { movementId: row.id, replay: false, levels: next, unitCostMinor: result.unitCostMinor, quantityMilli: signed }
}

/** What a job has reserved of an item right now: commits less releases and issues. */
export async function reservedForJob(uow: UnitOfWork, jobId: string, shopItemId: string) {
  const sum = await uow.tx.stockMovement.aggregate({ where: { jobId, shopItemId }, _sum: { committedDeltaMilli: true } })
  return Math.max(0, sum._sum.committedDeltaMilli ?? 0)
}

/**
 * A job's reservation ends with the job (H3). Whatever it still holds of each item, commits less releases and issues,
 * goes back to free stock. Safe to call twice: once the held quantity is zero there is nothing to post.
 */
export async function releaseJobReservations(uow: UnitOfWork, actor: Actor, jobId: string, why: string) {
  const held = await uow.tx.stockMovement.groupBy({ by: ['shopItemId'], where: { jobId, shopItemId: { not: null } }, _sum: { committedDeltaMilli: true }, _count: { _all: true } })
  let released = 0
  for (const h of held) {
    const qty = h._sum.committedDeltaMilli ?? 0
    if (qty <= 0 || !h.shopItemId) continue
    await postMovement(uow, actor, { shopItemId: h.shopItemId, type: 'release', quantityMilli: qty, jobId, key: `release:${jobId}:${h.shopItemId}:${h._count._all}`, reason: why })
    released += qty
  }
  return released
}

// ── Item master ───────────────────────────────────────────────────────────────

const UNITS = ['each', 'quart', 'liter', 'gallon', 'ounce', 'pound', 'foot', 'set'] as const

export type ItemInput = {
  id?: string | null; shopId: string; sku: string; partNumber?: string; brand?: string; lineCode?: string; description: string; category?: string; unitOfMeasure?: string
  isStocked?: boolean; binLocation?: string; minQuantityMilli?: number; maxQuantityMilli?: number; coreChargeMinor?: string | null; preferredSupplierId?: string | null; fitmentNotes?: string
}

/** Create or edit an item. A new item gets its stock level (at zero) in the same transaction. */
export async function saveShopItem(uow: UnitOfWork, actor: Actor, input: ItemInput) {
  const { tx } = uow
  const sku = textOf(input.sku, 'SKU', 60, true)
  const description = textOf(input.description, 'Description', 200, true)
  const min = Number.isSafeInteger(input.minQuantityMilli) ? (input.minQuantityMilli as number) : 0
  const max = Number.isSafeInteger(input.maxQuantityMilli) ? (input.maxQuantityMilli as number) : 0
  if (min < 0 || max < 0 || (max > 0 && max < min)) throw new DomainError(Codes.INVALID_INPUT, 'The most to keep must be at least the least.', { field: 'maxQuantityMilli' })
  const data = {
    sku, partNumber: textOf(input.partNumber, 'Part number', 60), brand: textOf(input.brand, 'Brand', 60), lineCode: textOf(input.lineCode, 'Line code', 20), description,
    category: textOf(input.category, 'Category', 40), unitOfMeasure: choiceOf(input.unitOfMeasure, UNITS, 'Unit', 'each'), isStocked: Boolean(input.isStocked),
    binLocation: textOf(input.binLocation, 'Bin', 40), minQuantityMilli: min, maxQuantityMilli: max, coreChargeMinor: centsOf(input.coreChargeMinor, 'Core charge', false),
    preferredSupplierId: input.preferredSupplierId || null, fitmentNotes: textOf(input.fitmentNotes, 'Fitment notes', 500),
  }
  const clash = await tx.shopItem.findFirst({ where: { shopId: input.shopId, sku: { equals: sku, mode: 'insensitive' }, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } })
  if (clash) throw new DomainError(Codes.DUPLICATE, `This shop already has an item numbered ${sku}.`, { field: 'sku', existingId: clash.id })
  if (input.id) {
    const row = await lockRow<Record<string, any>>(tx, 'ShopItem', input.id)
    if (row.shopId !== input.shopId) throw new DomainError(Codes.NOT_FOUND, 'Item not found.')
    await tx.shopItem.update({ where: { id: input.id }, data: { ...data, version: { increment: 1 } } })
    auditCreate(uow, actor, 'ShopItem', input.id, 'shop_item.updated', { sku })
    return { id: input.id, sku, created: false }
  }
  const level = await tx.stockLevel.create({ data: {} })
  const row = await tx.shopItem.create({ data: { ...data, shopId: input.shopId, stockId: level.id } })
  auditCreate(uow, actor, 'ShopItem', row.id, 'shop_item.created', { sku, stocked: data.isStocked })
  return { id: row.id, sku, created: true }
}

/** Find the shop's item for a part number, or make a non-stocked one so a received part has a ledger. */
export async function itemForPart(uow: UnitOfWork, actor: Actor, shopId: string, part: { partNumber: string; brand?: string; description: string; coreChargeMinor?: bigint }) {
  const { tx } = uow
  const found = await tx.shopItem.findFirst({ where: { shopId, partNumber: { equals: part.partNumber, mode: 'insensitive' }, ...(part.brand ? { brand: { equals: part.brand, mode: 'insensitive' } } : {}) }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (found) return found.id
  const sku = `${(part.brand || 'PART').replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()}-${part.partNumber}`.slice(0, 60)
  const dupe = await tx.shopItem.findFirst({ where: { shopId, sku: { equals: sku, mode: 'insensitive' } }, select: { id: true } })
  if (dupe) return dupe.id
  const made = await saveShopItem(uow, actor, { shopId, sku, partNumber: part.partNumber, brand: part.brand, description: part.description, isStocked: false, coreChargeMinor: part.coreChargeMinor?.toString() ?? null })
  return made.id
}

export const stockValueMinor = (onHandMilli: number, averageCostMinor: bigint) => extendMinor(onHandMilli, averageCostMinor)
