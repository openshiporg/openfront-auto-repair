import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { advisoryLock, type Tx } from './db'
import { sumMinor } from './money'
import { invoiceStatus, spreadPayment, addDays } from './invoiceMath'
import { zonedDate } from '../../../lib/zonedTime'
import type { UnitOfWork } from './unitOfWork'

/*
 * Payments (STATE-MACHINES §14; DOMAIN D§3.8). A payment is money received; an allocation says which
 * invoice it paid. Allocation happens once, in the transaction that sees the payment succeed, with
 * both rows locked, so a retried, doubled or "unknown" payment can never be counted twice.
 */

export const MANUAL_TENDERS = ['cash', 'check', 'ach', 'card_present', 'tap_to_pay', 'financing', 'store_credit', 'gift_card', 'account_credit'] as const
export const CARD_TENDERS = ['card_link'] as const
export const OPEN_PAYMENT = ['initiated', 'pending', 'unknown'] as const
export const SETTLED_PAYMENT = ['succeeded', 'partially_refunded', 'refunded'] as const

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
export const whole = (value: unknown, field: string, { positive = true } = {}) => {
  const s = String(value ?? '').trim()
  if (!/^\d{1,12}$/.test(s)) throw new DomainError(Codes.INVALID_INPUT, 'Enter an amount in whole cents.', { field })
  const n = BigInt(s)
  if (positive && n <= 0n) throw new DomainError(Codes.INVALID_INPUT, 'The amount must be above zero.', { field })
  return n
}

/** The business date a payment posts to: today in the shop's zone, or the next day that is not closed. */
export async function postingDate(tx: Tx, shopId: string, now: Date) {
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { timeZone: true } })
  let date = zonedDate(shop.timeZone, now)
  for (let i = 0; i < 366; i += 1) {
    const closed = await tx.businessDayClose.findFirst({ where: { shopId, businessDate: new Date(`${date}T00:00:00.000Z`), status: 'closed' }, select: { id: true } })
    if (!closed) return date
    date = addDays(date, 1)
  }
  return date
}
export const asDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

// ── Taking a payment ──────────────────────────────────────────────────────────

export type PaymentInput = {
  purpose: 'invoice' | 'deposit'
  repairOrderId?: string | null
  invoiceIds?: string[]
  tender: string
  amountMinor: string
  payerName?: string | null
  checkNumber?: string | null
  cardBrand?: string | null
  cardLast4?: string | null
}

/** Open the payment row. Manual tenders settle immediately; a card link stays "initiated" until Stripe is asked. */
export async function createPayment(uow: UnitOfWork, actor: Actor, input: PaymentInput, idempotencyKey: string) {
  const { tx, now } = uow
  const amount = whole(input.amountMinor, 'amountMinor')
  const purpose = input.purpose === 'deposit' ? 'deposit' : 'invoice'
  const isCard = (CARD_TENDERS as readonly string[]).includes(input.tender)
  if (!isCard && !(MANUAL_TENDERS as readonly string[]).includes(input.tender)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how the customer is paying.', { field: 'tender' })
  if (input.tender === 'check' && !text(input.checkNumber, 40)) throw new DomainError(Codes.INVALID_INPUT, 'Enter the check number.', { field: 'checkNumber' })

  let shopId: string, customerId: string | null, repairOrderId: string | null
  let invoiceIds: string[] = []
  if (purpose === 'invoice') {
    invoiceIds = [...new Set((input.invoiceIds ?? []).filter(x => typeof x === 'string'))].sort()
    if (!invoiceIds.length) throw new DomainError(Codes.INVALID_INPUT, 'Choose the invoice this pays.', { field: 'invoiceIds' })
    const invoices: Record<string, any>[] = []
    for (const id of invoiceIds) invoices.push(await lockRow(tx, 'Invoice', id))
    if (new Set(invoices.map(i => i.shopId)).size !== 1) throw new DomainError(Codes.INVALID_INPUT, 'One payment cannot span shops.')
    const owed = sumMinor(invoices.map(i => BigInt(i.balanceMinor as bigint)))
    if (owed <= 0n) throw new DomainError(Codes.GUARD_FAILED, 'That invoice is already paid.')
    if (amount > owed) throw new DomainError(Codes.GUARD_FAILED, `That is more than the ${owed.toString().padStart(3, '0').slice(0, -2)}.${owed.toString().padStart(3, '0').slice(-2)} owed. Take only what is due.`, { field: 'amountMinor' })
    shopId = invoices[0].shopId as string
    customerId = (invoices[0].customerId as string | null) ?? null
    repairOrderId = (invoices[0].repairOrderId as string | null) ?? null
  } else {
    if (!input.repairOrderId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the repair order the deposit is for.', { field: 'repairOrderId' })
    const ro = await lockRow<Record<string, any>>(tx, 'RepairOrder', input.repairOrderId)
    if (['void', 'invoiced', 'closed'].includes(ro.status as string)) throw new DomainError(Codes.GUARD_FAILED, `${ro.roNumber} is ${String(ro.status).replaceAll('_', ' ')}; take the payment on its invoice.`)
    await assertDepositPolicy(tx, ro, amount)
    shopId = ro.shopId as string
    customerId = (ro.customerId as string | null) ?? null
    repairOrderId = ro.id as string
  }

  const settleNow = !isCard
  const row = await tx.payment.create({
    data: {
      shopId, purpose, repairOrderId, customerId, targetInvoiceIds: invoiceIds as never, tender: input.tender, amountMinor: amount, provider: isCard ? 'stripe' : 'manual', idempotencyKey,
      payerName: text(input.payerName, 120), checkNumber: text(input.checkNumber, 40), cardBrand: text(input.cardBrand, 20), cardLast4: /^\d{4}$/.test(String(input.cardLast4 ?? '')) ? String(input.cardLast4) : '',
      receivedById: actorUserId(actor), status: settleNow ? 'succeeded' : 'initiated', settledAt: settleNow ? now : null, businessDate: settleNow ? asDate(await postingDate(tx, shopId, now)) : null,
    },
  })
  auditCreate(uow, actor, 'Payment', row.id, settleNow ? 'payment.received' : 'payment.started', { purpose, tender: input.tender, amountMinor: amount, invoiceIds, repairOrderId })
  let allocated = 0n
  if (settleNow && purpose === 'invoice') allocated = await allocatePayment(uow, actor, row.id)
  return { id: row.id, status: row.status, allocatedMinor: allocated.toString(), amountMinor: amount.toString() }
}

async function assertDepositPolicy(tx: Tx, ro: Record<string, any>, amount: bigint) {
  const policy = ro.shopPolicyVersionId ? await tx.shopPolicyVersion.findUnique({ where: { id: ro.shopPolicyVersionId as string }, select: { depositPolicy: true } }) : null
  const rule = (policy?.depositPolicy ?? {}) as { enabled?: boolean; maxPercentOfEstimate?: number; maxMinor?: string }
  if (rule.enabled === false) throw new DomainError(Codes.GUARD_FAILED, 'This shop does not take deposits.')
  if (rule.maxMinor && amount > BigInt(rule.maxMinor)) throw new DomainError(Codes.GUARD_FAILED, 'That deposit is above the shop limit.', { field: 'amountMinor' })
  if (rule.maxPercentOfEstimate && BigInt(ro.currentTotalMinor as bigint) > 0n) {
    const cap = (BigInt(ro.currentTotalMinor as bigint) * BigInt(Math.round(rule.maxPercentOfEstimate * 100))) / 10000n
    if (amount > cap) throw new DomainError(Codes.GUARD_FAILED, 'That deposit is above the share of the estimate the shop allows.', { field: 'amountMinor' })
  }
}

/**
 * Put a succeeded payment's money onto its invoices, once. The payment and invoices are locked in a fixed
 * order, and only what the payment still holds unallocated can be applied, so a replay does nothing.
 */
export async function allocatePayment(uow: UnitOfWork, actor: Actor, paymentId: string) {
  const { tx, now } = uow
  const payment = await lockRow<Record<string, any>>(tx, 'Payment', paymentId)
  if (!(SETTLED_PAYMENT as readonly string[]).includes(payment.status as string)) return 0n
  const available = BigInt(payment.amountMinor) - BigInt(payment.refundedMinor) - BigInt(payment.allocatedMinor)
  const targets = ((payment.targetInvoiceIds as string[] | null) ?? []).slice().sort()
  if (available <= 0n || !targets.length) return 0n
  const invoices: Record<string, any>[] = []
  for (const id of targets) invoices.push(await lockRow(tx, 'Invoice', id))
  const balances = invoices.map(i => BigInt(i.balanceMinor))
  const owed = sumMinor(balances)
  const apply = available > owed ? owed : available
  if (apply <= 0n) return 0n
  const shares = spreadPayment(apply, balances)
  for (let i = 0; i < invoices.length; i += 1) {
    if (shares[i] <= 0n) continue
    await tx.paymentAllocation.create({ data: { paymentId, invoiceId: invoices[i].id as string, amountMinor: shares[i], at: now } })
    await settleInvoice(uow, actor, invoices[i], shares[i], 0n)
  }
  await tx.payment.update({ where: { id: paymentId }, data: { allocatedMinor: { increment: apply }, version: { increment: 1 } } })
  auditCreate(uow, actor, 'Payment', paymentId, 'payment.allocated', { amountMinor: apply, invoices: invoices.map((inv, i) => ({ id: inv.id, amountMinor: shares[i] })) })
  return apply
}

/** Move an invoice's paid / credited totals and status, and the account's open balance, by the given amounts. */
export async function settleInvoice(uow: UnitOfWork, actor: Actor, invoice: Record<string, any>, paidDelta: bigint, creditedDelta: bigint) {
  const { tx } = uow
  const paid = BigInt(invoice.paidMinor) + paidDelta
  const credited = BigInt(invoice.creditedMinor) + creditedDelta
  const total = BigInt(invoice.totalMinor)
  const status = invoiceStatus({ totalMinor: total, paidMinor: paid, creditedMinor: credited, sent: !!invoice.sentAt })
  await tx.invoice.update({ where: { id: invoice.id as string }, data: { paidMinor: paid, creditedMinor: credited, balanceMinor: total - paid - credited, status, version: { increment: 1 } } })
  if (invoice.businessAccountId) {
    await tx.businessAccount.update({ where: { id: invoice.businessAccountId as string }, data: { openBalanceMinor: { decrement: paidDelta + creditedDelta }, version: { increment: 1 } } })
  }
  uow.audit({ eventType: 'invoice.balance_changed', entityType: 'Invoice', entityId: invoice.id as string, actorUserId: actorUserId(actor), before: { paidMinor: BigInt(invoice.paidMinor), creditedMinor: BigInt(invoice.creditedMinor), status: invoice.status }, after: { paidMinor: paid, creditedMinor: credited, balanceMinor: total - paid - credited, status } })
}

/** Called at finalize: any deposit the customer already paid on this repair order goes onto the customer's invoice, once. */
export async function settleDeposits(uow: UnitOfWork, actor: Actor, repairOrderId: string, invoiceIds: string[]) {
  const { tx } = uow
  const deposits = await tx.payment.findMany({ where: { repairOrderId, purpose: 'deposit', status: { in: ['succeeded', 'partially_refunded'] } }, orderBy: { createdAt: 'asc' } })
  if (!deposits.length) return 0n
  const invoices = await tx.invoice.findMany({ where: { id: { in: invoiceIds }, payerKind: 'customer' }, select: { id: true } })
  if (!invoices.length) return 0n
  let total = 0n
  for (const d of deposits) {
    await advisoryLock(tx, `payment:${d.id}`)
    await tx.payment.update({ where: { id: d.id }, data: { targetInvoiceIds: invoices.map(i => i.id) as never } })
    total += await allocatePayment(uow, actor, d.id)
  }
  return total
}

/** Settle a card payment Stripe reports as paid, or fail one it reports expired. Safe to call any number of times. */
export async function applyCardResult(uow: UnitOfWork, actor: Actor, input: { paymentId: string; outcome: 'paid' | 'expired' | 'failed'; paymentIntentId?: string | null; cardBrand?: string; cardLast4?: string; message?: string }) {
  const { tx, now } = uow
  const payment = await lockRow<Record<string, any>>(tx, 'Payment', input.paymentId)
  if ((SETTLED_PAYMENT as readonly string[]).includes(payment.status as string) || payment.status === 'failed') return { status: payment.status as string, allocatedMinor: '0', already: true }
  if (input.outcome === 'paid') {
    const businessDate = asDate(await postingDate(tx, payment.shopId as string, now))
    await transition(uow, {
      model: 'Payment', id: payment.id as string, from: ['initiated', 'pending', 'unknown'], to: 'succeeded', actor, eventType: 'payment.succeeded',
      data: { providerPaymentId: input.paymentIntentId ?? '', cardBrand: input.cardBrand ?? '', cardLast4: input.cardLast4 ?? '', settledAt: now, businessDate, failureMessage: '' },
    })
    const allocated = payment.purpose === 'invoice' ? await allocatePayment(uow, actor, payment.id as string) : 0n
    return { status: 'succeeded', allocatedMinor: allocated.toString(), already: false }
  }
  await transition(uow, { model: 'Payment', id: payment.id as string, from: ['initiated', 'pending', 'unknown'], to: 'failed', actor, eventType: 'payment.failed', data: { failureMessage: text(input.message || (input.outcome === 'expired' ? 'The payment page expired before it was paid.' : 'The card was not charged.'), 300) } })
  return { status: 'failed', allocatedMinor: '0', already: false }
}
