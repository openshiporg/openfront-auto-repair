import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { consumeApproval, requestApproval } from './approval'
import { Decimal, dec } from './decimal'
import { nextShopReference } from './sequence'
import { allocateMinor, sumMinor } from './money'
import { asDate, postingDate, settleInvoice, whole } from './payments'
import type { Permission } from '../access'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/* Refunds, credit memos, day close and vehicle release: the [AP] money commands (SCHEMA §19). */

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const reasonOf = (value: unknown, what: string) => {
  const r = text(value, 300)
  if (r.length < 3) throw new DomainError(Codes.INVALID_INPUT, `Say why ${what}.`, { field: 'reason' })
  return r
}

export type Approvable = { action: string; targetList: string; targetId: string; payload: unknown; permission: Permission; summary: string; approvalRequestId?: string | null }
/** Either use the approval the caller brought, or open a request and tell the caller to wait for it. */
export async function needApproval(uow: UnitOfWork, actor: Actor, a: Approvable) {
  if (a.approvalRequestId) {
    await consumeApproval(uow, { requestId: a.approvalRequestId, action: a.action, targetList: a.targetList, targetId: a.targetId, payload: a.payload })
    return { approved: true as const, approvalRequestId: a.approvalRequestId }
  }
  const request = await requestApproval(uow, actor, { action: a.action, targetList: a.targetList, targetId: a.targetId, payload: a.payload, requiredPermission: a.permission, summary: a.summary })
  return { approved: false as const, approvalRequestId: request.id }
}
/** Minor units as dollars and cents, by string arithmetic. */
const cents = (minor: bigint) => { const t = (minor < 0n ? -minor : minor).toString().padStart(3, '0'); return `${t.slice(0, -2)}.${t.slice(-2)}` }
const waiting = (id: string) => ({ approvalRequired: true, approvalRequestId: id })

async function policyOf(tx: Tx, shopId: string) {
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { shopPolicyId: true } })
  return shop.shopPolicyId ? tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId }, select: { refundApprovalMinor: true, creditMemoApprovalMinor: true } }) : null
}

// ── Refunds ───────────────────────────────────────────────────────────────────

export type RefundInput = { paymentId: string; amountMinor: string; reason: string; approvalRequestId?: string | null }

/** Step 1 (in a transaction): check, get approval when the amount needs it, and open the refund. Cards are then sent to Stripe outside it. */
export async function openRefund(uow: UnitOfWork, actor: Actor, input: RefundInput) {
  const { tx } = uow
  const amount = whole(input.amountMinor, 'amountMinor')
  const reason = reasonOf(input.reason, 'the money is going back')
  const payment = await lockRow<Record<string, any>>(tx, 'Payment', input.paymentId)
  if (!['succeeded', 'partially_refunded'].includes(payment.status as string)) throw new DomainError(Codes.GUARD_FAILED, 'Only a payment that went through can be refunded.')
  const inFlight = await tx.refund.aggregate({ where: { paymentId: payment.id as string, status: { in: ['requested', 'pending', 'unknown'] } }, _sum: { amountMinor: true } })
  const left = BigInt(payment.amountMinor) - BigInt(payment.refundedMinor) - (inFlight._sum.amountMinor ?? 0n)
  if (amount > left) throw new DomainError(Codes.GUARD_FAILED, `Only ${cents(left)} of this payment is left to refund.`, { field: 'amountMinor' })
  const policy = await policyOf(tx, payment.shopId as string)
  const threshold = policy?.refundApprovalMinor ?? 0n
  let approvalId: string | null = null
  if (threshold > 0n && amount >= threshold) {
    const gate = await needApproval(uow, actor, {
      action: 'refund.issue', targetList: 'Payment', targetId: payment.id as string, permission: 'canApproveRefund', approvalRequestId: input.approvalRequestId,
      payload: { paymentId: payment.id, amountMinor: amount.toString(), reason }, summary: `Refund ${cents(amount)}: ${reason}`,
    })
    if (!gate.approved) return waiting(gate.approvalRequestId)
    approvalId = gate.approvalRequestId
  }
  const row = await tx.refund.create({
    data: { paymentId: payment.id as string, amountMinor: amount, reason, provider: payment.provider as string, approvalId, requestedById: actorUserId(actor), status: 'requested' },
  })
  auditCreate(uow, actor, 'Refund', row.id, 'refund.requested', { paymentId: payment.id, amountMinor: amount, provider: payment.provider, approvalId }, { reason })
  return { refundId: row.id, provider: payment.provider as string, tender: payment.tender as string, providerPaymentId: (payment.providerPaymentId as string) || '', amountMinor: amount.toString() }
}

/** Step 2: the money has gone back (or definitely did not). Takes it off the payment and the invoices once. */
export async function applyRefundResult(uow: UnitOfWork, actor: Actor, input: { refundId: string; outcome: 'succeeded' | 'failed' | 'pending' | 'unknown'; providerRefundId?: string; message?: string }) {
  const { tx, now } = uow
  const refund = await lockRow<Record<string, any>>(tx, 'Refund', input.refundId)
  if (['succeeded', 'failed'].includes(refund.status as string)) return { status: refund.status as string, already: true }
  if (input.outcome === 'pending' || input.outcome === 'unknown') {
    if (refund.status !== input.outcome) await transition(uow, { model: 'Refund', id: refund.id as string, from: ['requested', 'pending', 'unknown'], to: input.outcome, actor, eventType: `refund.${input.outcome}`, data: { providerRefundId: input.providerRefundId ?? refund.providerRefundId } })
    return { status: input.outcome, already: false }
  }
  if (input.outcome === 'failed') {
    await transition(uow, { model: 'Refund', id: refund.id as string, from: ['requested', 'pending', 'unknown'], to: 'failed', actor, eventType: 'refund.failed', data: { failureMessage: text(input.message || 'The refund did not go through.', 300) } })
    return { status: 'failed', already: false }
  }
  const payment = await lockRow<Record<string, any>>(tx, 'Payment', refund.paymentId as string)
  const amount = BigInt(refund.amountMinor)
  const unallocated = BigInt(payment.amountMinor) - BigInt(payment.refundedMinor) - BigInt(payment.allocatedMinor)
  const fromFree = unallocated > 0n ? (amount < unallocated ? amount : unallocated) : 0n
  let fromInvoices = amount - fromFree
  if (fromInvoices > 0n) {
    const rows = await tx.paymentAllocation.groupBy({ by: ['invoiceId'], where: { paymentId: payment.id as string }, _sum: { amountMinor: true } })
    const net = rows.map(r => ({ invoiceId: r.invoiceId as string, net: r._sum.amountMinor ?? 0n })).filter(r => r.net > 0n).sort((a, b) => a.invoiceId.localeCompare(b.invoiceId))
    const available = sumMinor(net.map(n => n.net))
    if (fromInvoices > available) fromInvoices = available
    const shares = net.length ? allocateMinor(fromInvoices, net.map(n => n.net.toString())) : []
    for (let i = 0; i < net.length; i += 1) {
      const take = shares[i] > net[i].net ? net[i].net : shares[i]
      if (take <= 0n) continue
      const invoice = await lockRow<Record<string, any>>(tx, 'Invoice', net[i].invoiceId)
      await tx.paymentAllocation.create({ data: { paymentId: payment.id as string, invoiceId: invoice.id as string, refundId: refund.id as string, amountMinor: -take, at: now } })
      await settleInvoice(uow, actor, invoice, -take, 0n)
    }
  }
  const refunded = BigInt(payment.refundedMinor) + amount
  await tx.payment.update({ where: { id: payment.id as string }, data: { refundedMinor: refunded, allocatedMinor: { decrement: fromInvoices }, status: refunded >= BigInt(payment.amountMinor) ? 'refunded' : 'partially_refunded', version: { increment: 1 } } })
  const businessDate = asDate(await postingDate(tx, payment.shopId as string, now))
  await transition(uow, { model: 'Refund', id: refund.id as string, from: ['requested', 'pending', 'unknown'], to: 'succeeded', actor, eventType: 'refund.succeeded', data: { providerRefundId: input.providerRefundId ?? refund.providerRefundId, settledAt: now, businessDate, failureMessage: '' } })
  return { status: 'succeeded', already: false, amountMinor: amount.toString() }
}

// ── Credit memos ──────────────────────────────────────────────────────────────

export type CreditMemoInput = { invoiceId: string; reason: string; lines: { invoiceLineId: string; amountMinor: string }[]; approvalRequestId?: string | null }

/** A credit memo lowers what is owed on an unpaid invoice; money already paid is refunded instead. */
export async function issueCreditMemo(uow: UnitOfWork, actor: Actor, input: CreditMemoInput) {
  const { tx, now } = uow
  const reason = reasonOf(input.reason, 'the invoice is being credited')
  const invoice = await lockRow<Record<string, any>>(tx, 'Invoice', input.invoiceId)
  if (!Array.isArray(input.lines) || !input.lines.length) throw new DomainError(Codes.INVALID_INPUT, 'Choose what to credit.', { field: 'lines' })
  const prior = await tx.creditMemoLine.findMany({ where: { creditMemo: { invoiceId: invoice.id as string, status: 'issued' } }, select: { invoiceLineId: true, amountMinor: true } })
  const lines: { invoiceLineId: string; description: string; amountMinor: bigint; taxMinor: bigint }[] = []
  for (const l of input.lines) {
    const source = await tx.invoiceLine.findUnique({ where: { id: String(l.invoiceLineId) } })
    if (!source || source.invoiceId !== invoice.id) throw new DomainError(Codes.INVALID_INPUT, 'That line is not on this invoice.', { field: 'lines' })
    const amount = whole(l.amountMinor, 'amountMinor')
    const credited = sumMinor(prior.filter(p => p.invoiceLineId === source.id).map(p => p.amountMinor))
    if (amount > source.extendedMinor - credited) throw new DomainError(Codes.GUARD_FAILED, `${source.description}: only ${cents(source.extendedMinor - credited)} is left to credit.`, { field: 'amountMinor' })
    const taxMinor = source.extendedMinor > 0n ? BigInt(dec(source.taxMinor).times(dec(amount)).div(dec(source.extendedMinor)).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toString()) : 0n
    lines.push({ invoiceLineId: source.id, description: source.description, amountMinor: amount, taxMinor })
  }
  const subtotal = sumMinor(lines.map(l => l.amountMinor))
  const tax = sumMinor(lines.map(l => l.taxMinor))
  const total = subtotal + tax
  if (total > BigInt(invoice.balanceMinor)) throw new DomainError(Codes.GUARD_FAILED, 'A credit cannot be more than what is still owed. Refund the payment for money already received.', { field: 'lines' })
  const policy = await policyOf(tx, invoice.shopId as string)
  const threshold = policy?.creditMemoApprovalMinor ?? 0n
  let approvalId: string | null = null
  if (threshold > 0n && total >= threshold) {
    const gate = await needApproval(uow, actor, {
      action: 'credit_memo.issue', targetList: 'Invoice', targetId: invoice.id as string, permission: 'canApproveCreditMemo', approvalRequestId: input.approvalRequestId,
      payload: { invoiceId: invoice.id, reason, lines: lines.map(l => ({ invoiceLineId: l.invoiceLineId, amountMinor: l.amountMinor.toString() })) }, summary: `Credit ${cents(total)} on ${invoice.invoiceNumber}: ${reason}`,
    })
    if (!gate.approved) return waiting(gate.approvalRequestId)
    approvalId = gate.approvalRequestId
  }
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: invoice.shopId as string }, select: { code: true } })
  const reference = await nextShopReference(tx, 'CRM', shop.code, now)
  const memo = await tx.creditMemo.create({ data: { shopId: invoice.shopId as string, reference, invoiceId: invoice.id as string, reason, subtotalMinor: subtotal, taxMinor: tax, totalMinor: total, approvalId, createdById: actorUserId(actor), issuedById: actorUserId(actor), issuedAt: now, status: 'issued' } })
  await tx.creditMemoLine.createMany({ data: lines.map(l => ({ creditMemoId: memo.id, invoiceLineId: l.invoiceLineId, description: l.description, amountMinor: l.amountMinor, taxMinor: l.taxMinor })) })
  await settleInvoice(uow, actor, invoice, 0n, total)
  auditCreate(uow, actor, 'CreditMemo', memo.id, 'credit_memo.issued', { reference, invoice: invoice.invoiceNumber, totalMinor: total, approvalId }, { reason })
  return { id: memo.id, reference, totalMinor: total.toString() }
}

// ── Day close ─────────────────────────────────────────────────────────────────

/** What each tender took and gave back on a business date, and what the drawer should hold in cash. */
export async function dayTotals(tx: Tx, shopId: string, date: string) {
  const businessDate = asDate(date)
  const payments = await tx.payment.findMany({ where: { shopId, businessDate, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } }, select: { tender: true, amountMinor: true } })
  const refunds = await tx.refund.findMany({ where: { businessDate, status: 'succeeded', payment: { shopId } }, select: { amountMinor: true, payment: { select: { tender: true } } } })
  const totals: Record<string, bigint> = {}
  for (const p of payments) totals[p.tender] = (totals[p.tender] ?? 0n) + p.amountMinor
  for (const r of refunds) totals[r.payment!.tender] = (totals[r.payment!.tender] ?? 0n) - r.amountMinor
  const open = await tx.payment.count({ where: { shopId, status: { in: ['initiated', 'pending', 'unknown'] }, createdAt: { gte: new Date(businessDate.getTime() - 86_400_000), lt: new Date(businessDate.getTime() + 2 * 86_400_000) } } })
  return { totals, expectedCashMinor: totals.cash ?? 0n, unresolvedPayments: open }
}

export async function closeDay(uow: UnitOfWork, actor: Actor, input: { shopId: string; businessDate: string; drawerCountMinor: string; varianceReason?: string | null }) {
  const { tx, now } = uow
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the day to close.', { field: 'businessDate' })
  const count = whole(input.drawerCountMinor, 'drawerCountMinor', { positive: false })
  const { totals, expectedCashMinor, unresolvedPayments } = await dayTotals(tx, input.shopId, input.businessDate)
  if (unresolvedPayments > 0) throw new DomainError(Codes.GUARD_FAILED, `${unresolvedPayments} card payment${unresolvedPayments === 1 ? ' is' : 's are'} still waiting on the card processor. Check ${unresolvedPayments === 1 ? 'it' : 'them'} before closing the day.`)
  const variance = count - expectedCashMinor
  const reason = text(input.varianceReason, 300)
  if (variance !== 0n && reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, `The drawer is ${variance > 0n ? 'over' : 'short'} by ${cents(variance < 0n ? -variance : variance)}. Say why.`, { field: 'varianceReason' })
  const businessDate = asDate(input.businessDate)
  const existing = await tx.businessDayClose.findUnique({ where: { shopId_businessDate: { shopId: input.shopId, businessDate } } })
  const data = { tenderTotals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toString()])) as never, expectedCashMinor, drawerCountMinor: count, varianceMinor: variance, varianceReason: reason, closedById: actorUserId(actor), closedAt: now, status: 'closed' }
  if (existing?.status === 'closed') throw new DomainError(Codes.GUARD_FAILED, 'This day is already closed.')
  let id: string
  if (existing) {
    await tx.businessDayClose.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
    id = existing.id
  } else {
    id = (await tx.businessDayClose.create({ data: { shopId: input.shopId, businessDate, ...data } })).id
  }
  auditCreate(uow, actor, 'BusinessDayClose', id, 'day.closed', { shopId: input.shopId, date: input.businessDate, expectedCashMinor, drawerCountMinor: count, varianceMinor: variance, tenders: data.tenderTotals }, { reason })
  return { id, businessDate: input.businessDate, expectedCashMinor: expectedCashMinor.toString(), varianceMinor: variance.toString() }
}

export async function reopenDay(uow: UnitOfWork, actor: Actor, input: { dayCloseId: string; reason: string; approvalRequestId?: string | null }) {
  const reason = reasonOf(input.reason, 'the day is being reopened')
  const day = await lockRow<Record<string, any>>(uow.tx, 'BusinessDayClose', input.dayCloseId)
  if (day.status !== 'closed') throw new DomainError(Codes.GUARD_FAILED, 'Only a closed day can be reopened.')
  const gate = await needApproval(uow, actor, { action: 'day.reopen', targetList: 'BusinessDayClose', targetId: day.id as string, permission: 'canApproveReopen', approvalRequestId: input.approvalRequestId, payload: { dayCloseId: day.id, reason }, summary: `Reopen the day ${new Date(day.businessDate as Date).toISOString().slice(0, 10)}: ${reason}` })
  if (!gate.approved) return waiting(gate.approvalRequestId)
  await uow.tx.businessDayClose.update({ where: { id: day.id as string }, data: { status: 'reopened', reopenApprovalId: gate.approvalRequestId, version: { increment: 1 } } })
  uow.audit({ eventType: 'day.reopened', entityType: 'BusinessDayClose', entityId: day.id as string, actorUserId: actorUserId(actor), approverId: null, reason, after: { status: 'reopened' } })
  return { id: day.id as string, status: 'reopened' }
}

// ── Vehicle release ───────────────────────────────────────────────────────────

/** The customer takes the vehicle. With money still owed, a second person approves. When nothing is owed, the order closes. */
export async function releaseVehicle(uow: UnitOfWork, actor: Actor, input: { repairOrderId: string; approvalRequestId?: string | null; reason?: string | null }) {
  const { tx, now } = uow
  const ro = await lockRow<Record<string, any>>(tx, 'RepairOrder', input.repairOrderId)
  if (ro.status !== 'invoiced') throw new DomainError(Codes.GUARD_FAILED, `${ro.roNumber} has to be invoiced before the vehicle is released.`)
  if (ro.releasedAt) throw new DomainError(Codes.GUARD_FAILED, 'This vehicle was already released.')
  const invoices = await tx.invoice.findMany({ where: { repairOrderId: ro.id as string }, select: { balanceMinor: true } })
  const owed = sumMinor(invoices.map(i => i.balanceMinor))
  let approvalId: string | null = null
  if (owed > 0n) {
    const reason = reasonOf(input.reason, 'the vehicle is leaving with a balance')
    const gate = await needApproval(uow, actor, { action: 'vehicle.release_with_balance', targetList: 'RepairOrder', targetId: ro.id as string, permission: 'canApproveRelease', approvalRequestId: input.approvalRequestId, payload: { repairOrderId: ro.id, owedMinor: owed.toString(), reason }, summary: `Release ${ro.roNumber} owing ${cents(owed)}: ${reason}` })
    if (!gate.approved) return waiting(gate.approvalRequestId)
    approvalId = gate.approvalRequestId
  }
  await tx.repairOrder.update({ where: { id: ro.id as string }, data: { releasedAt: now, releasedById: actorUserId(actor), version: { increment: 1 } } })
  auditCreate(uow, actor, 'RepairOrder', ro.id as string, 'vehicle.released', { owedMinor: owed, approvalId })
  const closed = owed === 0n
  if (closed) await transition(uow, { model: 'RepairOrder', id: ro.id as string, from: ['invoiced'], to: 'closed', actor, eventType: 'repair_order.closed' })
  return { repairOrderId: ro.id as string, released: true, closed, owedMinor: owed.toString() }
}

/** After money lands: a released order with nothing owed closes itself. */
export async function closeIfSettled(uow: UnitOfWork, actor: Actor, repairOrderId: string | null) {
  if (!repairOrderId) return
  const ro = await uow.tx.repairOrder.findUnique({ where: { id: repairOrderId }, select: { status: true, releasedAt: true } })
  if (!ro || ro.status !== 'invoiced' || !ro.releasedAt) return
  const owing = await uow.tx.invoice.count({ where: { repairOrderId, balanceMinor: { gt: 0n } } })
  if (!owing) await transition(uow, { model: 'RepairOrder', id: repairOrderId, from: ['invoiced'], to: 'closed', actor, eventType: 'repair_order.closed' })
}
