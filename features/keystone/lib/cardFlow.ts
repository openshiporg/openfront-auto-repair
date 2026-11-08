import { lockRow } from './cas'
import { systemActor, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { runInTransaction } from './unitOfWork'
import { allocatePayment, applyCardResult } from './payments'
import { applyRefundResult, closeIfSettled } from './settlement'
import { StripeRejected, stripeGateway } from './stripeGateway'
import type { Db } from './db'

/*
 * The network half of card payments. Each step is: read in a short transaction, talk to Stripe with
 * no transaction open, then record the answer in a second short transaction. If the answer is lost
 * (a timeout, a crash), the payment stays "unknown" and resolvePayment asks Stripe again, so the money
 * is counted exactly once whenever the answer is finally known.
 */

const SYSTEM = systemActor('payment-resolver')
const baseUrl = () => (process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:3000')).replace(/\/$/, '')

/** Give a freshly created "initiated" card payment a Stripe checkout page. Returns the page's address. */
export async function openCardPage(db: Db, paymentId: string, input: { description: string; returnPath: string; customerEmail?: string | null }) {
  const gateway = stripeGateway()
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } })
  if (payment.status !== 'initiated' && payment.status !== 'pending') throw new DomainError(Codes.GUARD_FAILED, 'This payment is not waiting for a card.')
  if (payment.providerSessionId) {
    const existing = await gateway.retrieveCheckoutSession(payment.providerSessionId)
    if (existing.status === 'open' && existing.url) return { url: existing.url, sessionId: existing.id }
  }
  try {
    const session = await gateway.createCheckoutSession({
      amountMinor: payment.amountMinor, currency: 'usd', description: input.description, customerEmail: input.customerEmail,
      successUrl: `${baseUrl()}${input.returnPath}${input.returnPath.includes('?') ? '&' : '?'}paid=1`, cancelUrl: `${baseUrl()}${input.returnPath}${input.returnPath.includes('?') ? '&' : '?'}cancelled=1`,
      metadata: { paymentId: payment.id, purpose: payment.purpose }, idempotencyKey: `ar-session-${payment.idempotencyKey}`,
    })
    await runInTransaction(db, async uow => {
      await uow.tx.payment.update({ where: { id: payment.id }, data: { providerSessionId: session.id, status: 'pending', version: { increment: 1 } } })
    })
    return { url: session.url!, sessionId: session.id }
  } catch (error) {
    if (error instanceof StripeRejected) {
      await runInTransaction(db, async uow => { await applyCardResult(uow, SYSTEM, { paymentId: payment.id, outcome: 'failed', message: error.message }) })
      throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'The card processor refused the request. Try again, or take another form of payment.')
    }
    // No clear answer: do not guess. The payment is parked as unknown and the resolver asks Stripe later.
    await runInTransaction(db, async uow => { await lockRow(uow.tx, 'Payment', payment.id); await uow.tx.payment.updateMany({ where: { id: payment.id, status: { in: ['initiated', 'pending'] } }, data: { status: 'unknown', version: { increment: 1 } } }) })
    throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'The card processor did not answer. Nothing was charged yet; this payment will be checked again.')
  }
}

/** Ask Stripe what happened to a card payment and record it. Safe to call as often as you like. */
export async function resolvePayment(db: Db, paymentId: string, actor: Actor = SYSTEM) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new DomainError(Codes.NOT_FOUND, 'Payment not found.')
  if (payment.provider !== 'stripe' || !['initiated', 'pending', 'unknown'].includes(payment.status)) return { id: payment.id, status: payment.status, changed: false }
  if (!payment.providerSessionId) {
    // Never reached Stripe, or the answer was lost before we stored it. Abandon it only after an hour.
    if (Date.now() - payment.createdAt.getTime() > 3_600_000) {
      await runInTransaction(db, async uow => { await applyCardResult(uow, actor, { paymentId, outcome: 'expired' }) })
      return { id: payment.id, status: 'failed', changed: true }
    }
    return { id: payment.id, status: payment.status, changed: false }
  }
  let session
  try { session = await stripeGateway().retrieveCheckoutSession(payment.providerSessionId) } catch {
    if (payment.status !== 'unknown') await runInTransaction(db, async uow => { await uow.tx.payment.updateMany({ where: { id: paymentId, status: { in: ['initiated', 'pending'] } }, data: { status: 'unknown', version: { increment: 1 } } }) })
    return { id: payment.id, status: 'unknown', changed: false }
  }
  if (session.paymentStatus === 'paid') {
    const result = await runInTransaction(db, async uow => {
      const r = await applyCardResult(uow, actor, { paymentId, outcome: 'paid', paymentIntentId: session.paymentIntentId, cardBrand: session.cardBrand, cardLast4: session.cardLast4 })
      const settled = await uow.tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { repairOrderId: true } })
      await closeIfSettled(uow, actor, settled.repairOrderId)
      return r
    })
    return { id: payment.id, status: result.status, changed: !result.already }
  }
  if (session.status === 'expired') {
    await runInTransaction(db, async uow => { await applyCardResult(uow, actor, { paymentId, outcome: 'expired' }) })
    return { id: payment.id, status: 'failed', changed: true }
  }
  return { id: payment.id, status: payment.status === 'unknown' ? 'pending' : payment.status, changed: false }
}

/** Send an opened refund to Stripe, then record the answer. The refund id is the idempotency key, so a retry cannot refund twice. */
export async function sendRefund(db: Db, actor: Actor, refundId: string) {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } })
  if (refund.status === 'succeeded' || refund.status === 'failed') return { status: refund.status }
  if (refund.provider !== 'stripe') {
    await runInTransaction(db, async uow => { await applyRefundResult(uow, actor, { refundId, outcome: 'succeeded' }) })
    return { status: 'succeeded' }
  }
  const intent = refund.payment!.providerPaymentId
  if (!intent) throw new DomainError(Codes.GUARD_FAILED, 'This card payment has no processor reference to refund against.')
  try {
    const result = await stripeGateway().createRefund({ paymentIntentId: intent, amountMinor: refund.amountMinor, idempotencyKey: `ar-refund-${refund.id}`, reason: refund.reason, metadata: { refundId: refund.id, paymentId: refund.paymentId! } })
    const outcome = result.status === 'succeeded' ? 'succeeded' : result.status === 'pending' || result.status === 'requires_action' ? 'pending' : 'failed'
    await runInTransaction(db, async uow => { await applyRefundResult(uow, actor, { refundId, outcome, providerRefundId: result.id, message: result.failureReason }) })
    return { status: outcome }
  } catch (error) {
    if (error instanceof StripeRejected) {
      await runInTransaction(db, async uow => { await applyRefundResult(uow, actor, { refundId, outcome: 'failed', message: error.message }) })
      return { status: 'failed' }
    }
    await runInTransaction(db, async uow => { await applyRefundResult(uow, actor, { refundId, outcome: 'unknown' }) })
    return { status: 'unknown' }
  }
}

/** Ask Stripe about a refund whose answer was lost. */
export async function resolveRefund(db: Db, refundId: string, actor: Actor = SYSTEM) {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId } })
  if (!['requested', 'pending', 'unknown'].includes(refund.status)) return { status: refund.status }
  if (!refund.providerRefundId) return sendRefund(db, actor, refundId)
  try {
    const r = await stripeGateway().retrieveRefund(refund.providerRefundId)
    const outcome = r.status === 'succeeded' ? 'succeeded' : r.status === 'pending' || r.status === 'requires_action' ? 'pending' : 'failed'
    await runInTransaction(db, async uow => { await applyRefundResult(uow, actor, { refundId, outcome, providerRefundId: r.id, message: r.failureReason }) })
    return { status: outcome }
  } catch { return { status: refund.status } }
}

/** Sweep: payments and refunds still unresolved. Called by the pay page, the dashboard and the outbox worker. */
export async function resolveOpen(db: Db, shopId?: string) {
  const payments = await db.payment.findMany({ where: { provider: 'stripe', status: { in: ['initiated', 'pending', 'unknown'] }, ...(shopId ? { shopId } : {}) }, select: { id: true }, take: 25, orderBy: { createdAt: 'asc' } })
  const refunds = await db.refund.findMany({ where: { provider: 'stripe', status: { in: ['requested', 'pending', 'unknown'] }, ...(shopId ? { payment: { shopId } } : {}) }, select: { id: true }, take: 25 })
  let changed = 0
  for (const p of payments) if ((await resolvePayment(db, p.id)).changed) changed += 1
  for (const r of refunds) { const before = r.id; const after = await resolveRefund(db, before); if (after.status === 'succeeded' || after.status === 'failed') changed += 1 }
  return { payments: payments.length, refunds: refunds.length, changed }
}
export { allocatePayment }
