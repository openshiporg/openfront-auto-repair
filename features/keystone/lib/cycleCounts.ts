import type { Actor } from './actor'
import { actorUserId } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import { nextShopReference } from './sequence'
import { postMovement } from './stock'
import { extendMinor } from './stockMath'
import { idOf, listOf, objectOf, textOf } from './partsInput'
import type { ApprovalGate } from './supplierOrders'
import type { UnitOfWork } from './unitOfWork'

/* Cycle counts and stock adjustments (SCHEMA §8.5). A variance worth this much or more needs a manager's approval (action stock.adjust). */
export const STOCK_ADJUST_APPROVAL_MINOR = 10_000n

export async function startCycleCount(uow: UnitOfWork, actor: Actor, input: { shopId: string; shopItemIds: string[] }) {
  const shop = await uow.tx.shop.findUnique({ where: { id: input.shopId }, select: { id: true, code: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Shop not found.', { field: 'shopId' })
  const ids = [...new Set(listOf(input.shopItemIds, 'the count', 500).map(v => idOf(v, 'a part')))]
  const items = await uow.tx.shopItem.findMany({ where: { id: { in: ids }, shopId: shop.id, isStocked: true }, include: { stock: true } })
  if (items.length !== ids.length) throw new DomainError(Codes.INVALID_INPUT, 'Every part to count must be a stocked part at this shop.', { field: 'shopItemIds' })
  const reference = await nextShopReference(uow.tx, 'CC', shop.code, uow.now, 5)
  // The expected quantity is frozen when the count starts, so a sale in the middle does not move the target.
  const frozen = items.map(i => ({ shopItemId: i.id, sku: i.sku, expectedMilli: i.stock?.onHandMilli ?? 0, countedMilli: null as number | null }))
  const row = await uow.tx.cycleCount.create({ data: { shopId: shop.id, reference, items: frozen, status: 'open' } })
  auditCreate(uow, actor, 'CycleCount', row.id, 'cycle_count.started', { reference, items: frozen.length })
  return { id: row.id, reference }
}

export async function recordCounts(uow: UnitOfWork, actor: Actor, input: { cycleCountId: string; counts: { shopItemId: string; countedMilli: number }[]; expectedVersion?: number | null }) {
  const row = await lockRow<Record<string, any>>(uow.tx, 'CycleCount', idOf(input.cycleCountId, 'a count'))
  if (row.status === 'posted') throw new DomainError(Codes.INVALID_TRANSITION, 'This count is already posted.', { currentStatus: row.status })
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== row.version) throw new DomainError(Codes.STALE_STATE, 'This count changed since you loaded it.')
  const items = row.items as { shopItemId: string; sku: string; expectedMilli: number; countedMilli: number | null }[]
  for (const c of listOf(input.counts, 'the count')) {
    const entry = objectOf(c, 'a counted part')
    const item = items.find(i => i.shopItemId === entry.shopItemId)
    if (!item) throw new DomainError(Codes.INVALID_INPUT, 'That part is not in this count.', { field: 'shopItemId' })
    if (!Number.isSafeInteger(entry.countedMilli) || entry.countedMilli < 0) throw new DomainError(Codes.INVALID_INPUT, 'A counted quantity cannot be negative.', { field: 'countedMilli' })
    item.countedMilli = entry.countedMilli
  }
  const complete = items.every(i => i.countedMilli !== null)
  await uow.tx.cycleCount.update({ where: { id: row.id }, data: { items, status: complete ? 'counted' : 'open', version: { increment: 1 } } })
  auditCreate(uow, actor, 'CycleCount', row.id, 'cycle_count.recorded', { counted: items.filter(i => i.countedMilli !== null).length, of: items.length })
  return { id: row.id, status: complete ? 'counted' : 'open' }
}

/** Post the variance of every counted part as stock movements. */
export async function postCycleCount(uow: UnitOfWork, actor: Actor, input: { cycleCountId: string; approvalRequestId?: string | null; expectedVersion?: number | null }, gate: ApprovalGate) {
  const row = await lockRow<Record<string, any>>(uow.tx, 'CycleCount', idOf(input.cycleCountId, 'a count'))
  if (row.status !== 'counted') throw new DomainError(Codes.INVALID_TRANSITION, row.status === 'posted' ? 'This count is already posted.' : 'Count every part before posting.', { currentStatus: row.status })
  if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== row.version) throw new DomainError(Codes.STALE_STATE, 'This count changed since you loaded it.')
  const items = row.items as { shopItemId: string; sku: string; expectedMilli: number; countedMilli: number }[]
  // The variance is measured against the shelf right now, not the frozen figure, so a movement during the count is not undone.
  const plan: { shopItemId: string; sku: string; delta: number; valueMinor: bigint }[] = []
  let variance = 0n
  for (const i of items) {
    const item = await uow.tx.shopItem.findUniqueOrThrow({ where: { id: i.shopItemId }, include: { stock: true } })
    const delta = i.countedMilli - i.expectedMilli
    const value = extendMinor(delta, BigInt(item.stock?.averageCostMinor ?? 0))
    plan.push({ shopItemId: i.shopItemId, sku: i.sku, delta, valueMinor: value })
    variance += value < 0n ? -value : value
  }
  let approvalId: string | null = null
  if (variance >= STOCK_ADJUST_APPROVAL_MINOR) {
    const g = await gate(uow, actor, { action: 'stock.adjust', targetList: 'CycleCount', targetId: row.id, payload: { cycleCountId: row.id, varianceValueMinor: variance.toString(), items: plan.map(p => ({ shopItemId: p.shopItemId, delta: p.delta })) }, summary: `Post count ${row.reference}: ${variance} cents of variance`, approvalRequestId: input.approvalRequestId })
    if (!g.approved) return { approvalRequired: true as const, approvalRequestId: g.approvalRequestId }
    approvalId = g.approvalRequestId
  }
  for (const p of plan) if (p.delta !== 0) await postMovement(uow, actor, { shopItemId: p.shopItemId, type: 'count', quantityMilli: p.delta, cycleCountId: row.id, key: `count:${row.id}:${p.shopItemId}`, reason: `Cycle count ${row.reference}` })
  await transition(uow, { model: 'CycleCount', id: row.id, from: ['counted'], to: 'posted', actor, eventType: 'cycle_count.posted', data: { varianceValueMinor: variance, postedById: actorUserId(actor), postedAt: uow.now }, metadata: { approvalId } })
  return { approvalRequired: false as const, id: row.id, varianceValueMinor: variance.toString() }
}

/** A single correction (damage, found stock). Large ones wait for approval. */
export async function adjustStock(uow: UnitOfWork, actor: Actor, input: { shopItemId: string; deltaMilli: number; reason: string; key: string; approvalRequestId?: string | null }, gate: ApprovalGate) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  const item = await uow.tx.shopItem.findUnique({ where: { id: idOf(input.shopItemId, 'a part') }, include: { stock: true } })
  if (!item) throw new DomainError(Codes.NOT_FOUND, 'Part not found.', { field: 'shopItemId' })
  if (!Number.isSafeInteger(input.deltaMilli) || input.deltaMilli === 0) throw new DomainError(Codes.INVALID_INPUT, 'Enter how many to add or remove.', { field: 'deltaMilli' })
  const value = extendMinor(Math.abs(input.deltaMilli), BigInt(item.stock?.averageCostMinor ?? 0))
  if (value >= STOCK_ADJUST_APPROVAL_MINOR && !(await uow.tx.stockMovement.findUnique({ where: { idempotencyKey: input.key }, select: { id: true } }))) {
    const g = await gate(uow, actor, { action: 'stock.adjust', targetList: 'ShopItem', targetId: item.id, payload: { shopItemId: item.id, deltaMilli: input.deltaMilli, reason }, summary: `Adjust ${item.sku} by ${input.deltaMilli / 1000}: ${reason}`, approvalRequestId: input.approvalRequestId })
    if (!g.approved) return { approvalRequired: true as const, approvalRequestId: g.approvalRequestId }
  }
  const moved = await postMovement(uow, actor, { shopItemId: item.id, type: 'adjustment', quantityMilli: input.deltaMilli, key: input.key, reason })
  return { approvalRequired: false as const, movementId: moved.movementId, onHandMilli: moved.levels.onHandMilli }
}
