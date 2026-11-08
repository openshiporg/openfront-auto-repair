import { actorFromSession, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { requireShop } from './phase1'
import { finalizeInvoices, invoicePayLink, buildInvoicePlan, type FinalizeInput } from '../lib/invoicing'
import { createPayment, type PaymentInput } from '../lib/payments'
import { closeDay, closeIfSettled, dayTotals, issueCreditMemo, openRefund, releaseVehicle, reopenDay, type CreditMemoInput, type RefundInput } from '../lib/settlement'
import { openCardPage, resolveOpen, resolvePayment, sendRefund } from '../lib/cardFlow'
import { cardPaymentsConfigured } from '../lib/stripeGateway'

type Ctx = { session: any; prisma: any }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

async function shopOf(context: Ctx, model: 'repairOrder' | 'invoice' | 'payment' | 'refund' | 'businessDayClose', id: unknown) {
  if (typeof id !== 'string' || !id) throw new DomainError(Codes.INVALID_INPUT, 'Choose a record.')
  const row = await context.prisma[model].findUnique({ where: { id }, select: model === 'refund' ? { payment: { select: { shopId: true } } } : { shopId: true } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  return requireShop(context, model === 'refund' ? row.payment?.shopId : row.shopId)
}

/** What invoicing would do for a repair order, and what stops it. Read-only. */
export async function previewShopInvoice(_root: unknown, args: { repairOrderId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canFinalizeInvoices', 'canReadFinancials')
  await shopOf(context, 'repairOrder', args.repairOrderId)
  const built = await buildInvoicePlan(context.prisma, args.repairOrderId, new Date())
  return {
    repairOrderId: args.repairOrderId, roNumber: built.ro.roNumber, problems: built.problems, status: built.ro.status,
    invoices: built.plans.map(p => ({
      payerKind: p.payer.kind, payerName: p.payer.payorName, lines: p.lines.length,
      totals: Object.fromEntries(Object.entries(p.totals).map(([k, v]) => [k, v.toString()])),
    })),
  }
}

export async function finalizeShopInvoice(_root: unknown, args: { input: FinalizeInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canFinalizeInvoices')
  requireHuman(actor, 'finalize an invoice')
  await shopOf(context, 'repairOrder', args.input?.repairOrderId)
  return run(context, actor, 'invoice.finalize', args.idempotencyKey, args.input, uow => finalizeInvoices(uow, actor, args.input))
}

export async function createInvoicePayLink(_root: unknown, args: { invoiceId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canTakePayments')
  requireHuman(actor, 'send a payment link')
  await shopOf(context, 'invoice', args.invoiceId)
  return run(context, actor, 'invoice.pay_link', args.idempotencyKey, args, uow => invoicePayLink(uow, actor, { invoiceId: args.invoiceId }))
}

/** Record money taken at the counter, or start a card payment and return its Stripe page. */
export async function takeShopPayment(_root: unknown, args: { input: PaymentInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canTakePayments')
  requireHuman(actor, 'take a payment')
  const input = args.input ?? ({} as PaymentInput)
  if (input.purpose === 'deposit') await shopOf(context, 'repairOrder', input.repairOrderId)
  else await shopOf(context, 'invoice', input.invoiceIds?.[0])
  if (input.tender === 'card_link' && !cardPaymentsConfigured()) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'Card payments are not set up on this server yet. Take cash, a check or a card on the terminal.')
  const made = await run(context, actor, 'payment.take', args.idempotencyKey, input, async uow => {
    const created = await createPayment(uow, actor, input, args.idempotencyKey)
    if (input.tender !== 'card_link' && input.purpose !== 'deposit') {
      const row = await uow.tx.payment.findUniqueOrThrow({ where: { id: created.id }, select: { repairOrderId: true } })
      await closeIfSettled(uow, actor, row.repairOrderId)
    }
    return created
  })
  if (input.tender !== 'card_link') return made
  const ro = made.id ? await context.prisma.payment.findUnique({ where: { id: made.id }, select: { repairOrderId: true, customer: { select: { displayName: true } } } }) : null
  const page = await openCardPage(context.prisma, made.id, { description: `Repair order payment${ro?.customer?.displayName ? ` for ${ro.customer.displayName}` : ''}`, returnPath: `/dashboard/platform/repair-orders/${ro?.repairOrderId ?? ''}` })
  return { ...made, status: 'pending', checkoutUrl: page.url }
}

/** Ask the processor where a card payment stands (the dashboard calls this while it is open). */
export async function checkShopPayment(_root: unknown, args: { paymentId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canTakePayments', 'canReadFinancials')
  await shopOf(context, 'payment', args.paymentId)
  const result = await resolvePayment(context.prisma, args.paymentId, actor)
  return result
}

export async function resolveShopPayments(_root: unknown, args: { shopId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canTakePayments', 'canReadFinancials')
  const shopId = requireShop(context, args.shopId)
  return resolveOpen(context.prisma, shopId)
}

export async function refundShopPayment(_root: unknown, args: { input: RefundInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canIssueRefunds')
  requireHuman(actor, 'issue a refund')
  await shopOf(context, 'payment', args.input?.paymentId)
  const opened = await run<any>(context, actor, 'refund.open', args.idempotencyKey, args.input, uow => openRefund(uow, actor, args.input))
  if (opened.approvalRequired || !opened.refundId) return opened
  // The money moves after the transaction commits, and only once: the refund id is the processor's idempotency key.
  const sent = await sendRefund(context.prisma, actor, opened.refundId)
  return { replay: opened.replay, refundId: opened.refundId, status: sent.status, amountMinor: opened.amountMinor }
}

export async function issueShopCreditMemo(_root: unknown, args: { input: CreditMemoInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canFinalizeInvoices', 'canApproveCreditMemo')
  requireHuman(actor, 'issue a credit memo')
  await shopOf(context, 'invoice', args.input?.invoiceId)
  return run(context, actor, 'credit_memo.issue', args.idempotencyKey, args.input, uow => issueCreditMemo(uow, actor, args.input))
}

export async function closeShopDay(_root: unknown, args: { shopId: string; businessDate: string; drawerCountMinor: string; varianceReason?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canCloseDay')
  requireHuman(actor, 'close the day')
  const shopId = requireShop(context, args.shopId)
  return run(context, actor, 'day.close', args.idempotencyKey, args, uow => closeDay(uow, actor, { shopId, businessDate: args.businessDate, drawerCountMinor: args.drawerCountMinor, varianceReason: args.varianceReason }))
}

export async function reopenShopDay(_root: unknown, args: { dayCloseId: string; reason: string; approvalRequestId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canCloseDay')
  requireHuman(actor, 'reopen a closed day')
  await shopOf(context, 'businessDayClose', args.dayCloseId)
  return run(context, actor, 'day.reopen', args.idempotencyKey, args, uow => reopenDay(uow, actor, args))
}

export async function releaseShopVehicle(_root: unknown, args: { repairOrderId: string; reason?: string | null; approvalRequestId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canFinalizeInvoices', 'canTakePayments')
  requireHuman(actor, 'release a vehicle')
  await shopOf(context, 'repairOrder', args.repairOrderId)
  return run(context, actor, 'vehicle.release', args.idempotencyKey, args, uow => releaseVehicle(uow, actor, args))
}

/** What the day looks like before closing: the dashboard shows it next to the drawer count. */
export async function shopDaySummary(_root: unknown, args: { shopId: string; businessDate: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canCloseDay', 'canReadFinancials')
  const shopId = requireShop(context, args.shopId)
  const d = await dayTotals(context.prisma, shopId, args.businessDate)
  return { tenders: Object.fromEntries(Object.entries(d.totals).map(([k, v]) => [k, v.toString()])), expectedCashMinor: d.expectedCashMinor.toString(), unresolvedPayments: d.unresolvedPayments }
}
export { closeIfSettled }
