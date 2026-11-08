import { actorUserId, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import { consumeApproval, requestApproval } from './approval'
import { reverseJobFlags, shopDay, shopPolicy } from './flagging'
import { centsOf, textOf } from './partsInput'
import { nextShopReference } from './sequence'
import type { UnitOfWork } from './unitOfWork'

/*
 * Comebacks and warranty claims (SCHEMA §9; STATE-MACHINES §12; DOMAIN I-W1, I-W2). A comeback points at a job that
 * was finished and billed. It is free for the customer when the warranty on that job still holds, or when the owner
 * approves goodwill. When the shop's own work was at fault the hours it paid are taken back (policy: reverse or keep).
 */

export const CLOSED_CASE = ['resolved', 'cancelled'] as const
const CAUSES = ['workmanship', 'part_failure', 'new_issue', 'customer_caused']

/** Is the job's warranty still good on this day and odometer? */
export function coverageHolds(c: { status: string; endsOn: Date | null; endsAtMiles: number | null }, day: Date, miles: number | null) {
  if (c.status !== 'active') return false
  if (c.endsOn && c.endsOn.getTime() < day.getTime()) return false
  if (c.endsAtMiles !== null && miles !== null && miles > c.endsAtMiles) return false
  return true
}

export async function openComeback(uow: UnitOfWork, actor: Actor, input: { originalJobId: string; concern: string; odometer?: number | null }) {
  const { tx, now } = uow
  const concern = textOf(input.concern, 'What the customer reports', 600, true)
  const job = await tx.job.findUnique({ where: { id: input.originalJobId }, select: { id: true, number: true, title: true, status: true, repairOrder: { select: { id: true, shopId: true, roNumber: true, vehicleId: true } } } })
  if (!job?.repairOrder?.shopId) throw new DomainError(Codes.NOT_FOUND, 'Job not found.', { field: 'originalJobId' })
  const billed = await tx.invoiceLine.count({ where: { sourceJobLine: { jobId: job.id }, invoice: { status: { notIn: ['void'] } } } })
  if (job.status !== 'completed' || !billed) throw new DomainError(Codes.GUARD_FAILED, 'A comeback points at work that was finished and billed. Finish and invoice this job first.')
  // One open comeback per job (H2): take the job's row lock so two at once line up, and the partial unique index backs it up.
  await lockRow(tx, 'Job', job.id)
  const open = await tx.comebackCase.findFirst({ where: { originalJobId: job.id, status: { notIn: [...CLOSED_CASE] } } })
  if (open) throw new DomainError(Codes.GUARD_FAILED, `${open.reference} is already open for this job.`)
  const shopId = job.repairOrder.shopId
  const coverage = await tx.warrantyCoverage.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: 'desc' } })
  let miles: number | null = input.odometer ?? null
  if (miles === null && job.repairOrder.vehicleId) {
    const reading = await tx.odometerReading.findFirst({ where: { vehicleId: job.repairOrder.vehicleId, accepted: true }, orderBy: { at: 'desc' }, select: { value: true } })
    miles = reading?.value ?? null
  }
  const policy = await shopPolicy(tx, shopId)
  const holds = coverage ? coverageHolds(coverage, shopDay(now, policy.timeZone), miles) : false
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { code: true } })
  const reference = await nextShopReference(tx, 'CB', shop.code, now)
  const row = await tx.comebackCase.create({
    data: { shopId, reference, originalJobId: job.id, concern, coverageId: coverage?.id ?? null, coverageValid: holds, noCharge: holds, cause: 'undetermined', openedById: actorUserId(actor), status: 'open' },
  })
  if (coverage && holds) await tx.warrantyCoverage.update({ where: { id: coverage.id }, data: { version: { increment: 1 } } })
  auditCreate(uow, actor, 'ComebackCase', row.id, 'comeback.opened', { reference, job: `${job.repairOrder.roNumber} job ${job.number}`, coverageValid: holds })
  return { id: row.id, reference, coverageValid: holds, noCharge: holds }
}

export async function diagnoseComeback(uow: UnitOfWork, actor: Actor, input: { comebackId: string; cause: string; diagnosis: string; expectedVersion?: number | null }) {
  const { tx } = uow
  if (!CAUSES.includes(input.cause)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the cause.', { field: 'cause' })
  const diagnosis = textOf(input.diagnosis, 'Diagnosis', 800, true)
  const row = await lockRow<any>(tx, 'ComebackCase', input.comebackId)
  // Our own mistake or a part that failed is covered even when the warranty term has run out? No: the term decides; goodwill covers the rest.
  const noCharge = row.coverageValid || row.noCharge
  await transition(uow, { model: 'ComebackCase', id: row.id, from: ['open'], to: 'diagnosed', expectedVersion: input.expectedVersion, actor, eventType: 'comeback.diagnosed', data: { cause: input.cause, diagnosis, noCharge } })
  let reversed = 0
  if (input.cause === 'workmanship') {
    const policy = await shopPolicy(tx, row.shopId)
    if (policy.comebackPayRule === 'reverse') reversed = (await reverseJobFlags(uow, actor, row.originalJobId, `comeback:${row.id}`, `Comeback ${row.reference}: the work did not hold`)).reversed
  }
  return { id: row.id, status: 'diagnosed', noCharge, hoursReversed: reversed }
}

/** Outside the warranty, the owner can still make the repair free. Needs another person's approval. */
export async function requestGoodwill(uow: UnitOfWork, actor: Actor, input: { comebackId: string; reason: string; approvalRequestId?: string | null }) {
  const { tx } = uow
  const reason = textOf(input.reason, 'Reason', 300)
  if (reason.length < 5) throw new DomainError(Codes.INVALID_INPUT, 'Say why the shop is making this free.', { field: 'reason' })
  const row = await lockRow<any>(tx, 'ComebackCase', input.comebackId)
  if ((CLOSED_CASE as readonly string[]).includes(row.status)) throw new DomainError(Codes.GUARD_FAILED, 'This comeback is closed.')
  if (row.noCharge) throw new DomainError(Codes.GUARD_FAILED, 'This repair is already free for the customer.')
  const payload = { comebackId: row.id, reason }
  if (input.approvalRequestId) {
    const { approverId } = await consumeApproval(uow, { requestId: input.approvalRequestId, action: 'goodwill.approve', targetList: 'ComebackCase', targetId: row.id, payload })
    await tx.comebackCase.update({ where: { id: row.id }, data: { noCharge: true, goodwillApprovalId: input.approvalRequestId, version: { increment: 1 } } })
    auditCreate(uow, actor, 'ComebackCase', row.id, 'comeback.goodwill_applied', { reference: row.reference }, { reason })
    return { id: row.id, noCharge: true, approverId }
  }
  const request = await requestApproval(uow, actor, { action: 'goodwill.approve', targetList: 'ComebackCase', targetId: row.id, payload, requiredPermission: 'canApproveGoodwill', summary: `Make comeback ${row.reference} free for the customer: ${reason}` })
  return { approvalRequired: true, approvalRequestId: request.id }
}

/** Is this job one the customer would be billed for? Any live invoice line from it means yes. */
async function billedAlready(tx: UnitOfWork['tx'], jobId: string) {
  return (await tx.invoiceLine.count({ where: { sourceJobLine: { jobId }, invoice: { status: { notIn: ['void'] } } } })) > 0
}

/**
 * The repeat repair has to be on the same customer and vehicle as the original, and must not be billed yet.
 * When the repair is free (I-W2, SM§13.2) it must sit on a repair order of kind comeback; the job is paid by the
 * shop's warranty, so the customer is billed $0 and needs no authorization.
 */
async function linkComebackJob(uow: UnitOfWork, actor: Actor, row: Record<string, any>, comebackJobId: string) {
  const { tx } = uow
  const j = await lockRow<Record<string, any>>(tx, 'Job', comebackJobId)
  const jobRo = await tx.repairOrder.findUnique({ where: { id: j.repairOrderId }, select: { id: true, shopId: true, customerId: true, vehicleId: true, kind: true, roNumber: true } })
  if (!jobRo || jobRo.shopId !== row.shopId) throw new DomainError(Codes.NOT_FOUND, 'Job not found at this shop.', { field: 'comebackJobId' })
  if (j.id === row.originalJobId) throw new DomainError(Codes.INVALID_INPUT, 'The repeat repair is a new job, not the original one.', { field: 'comebackJobId' })
  const original = await tx.job.findUniqueOrThrow({ where: { id: row.originalJobId }, select: { repairOrder: { select: { customerId: true, vehicleId: true } } } })
  if (jobRo.customerId !== original.repairOrder?.customerId || jobRo.vehicleId !== original.repairOrder?.vehicleId) {
    throw new DomainError(Codes.GUARD_FAILED, `That job is on ${jobRo.roNumber}, which is for a different customer or vehicle than the job that came back.`, { field: 'comebackJobId' })
  }
  if (['voided', 'declined', 'deferred'].includes(j.status)) throw new DomainError(Codes.GUARD_FAILED, 'That job was removed or declined, so it cannot be the repeat repair.', { field: 'comebackJobId' })
  if (await billedAlready(tx, j.id)) throw new DomainError(Codes.GUARD_FAILED, 'That job is already on an invoice. The repeat repair has to be one that has not been billed.', { field: 'comebackJobId' })
  const taken = await tx.comebackCase.findFirst({ where: { comebackJobId: j.id, id: { not: row.id }, status: { not: 'cancelled' } }, select: { reference: true } })
  if (taken) throw new DomainError(Codes.GUARD_FAILED, `That job is already the repeat repair for ${taken.reference}.`, { field: 'comebackJobId' })
  if (row.noCharge) {
    if (jobRo.kind !== 'comeback') throw new DomainError(Codes.GUARD_FAILED, `A free repair goes on a repair order opened as a comeback. ${jobRo.roNumber} is a ${jobRo.kind} order.`, { field: 'comebackJobId' })
    const reason = `Comeback ${row.reference}: no charge, covered by the shop`
    await tx.payerSplit.deleteMany({ where: { jobId: j.id } })
    await tx.payerSplit.create({ data: { jobId: j.id, payerKind: 'shop_warranty', percent: '1.000000', payorName: 'Shop warranty', claimNumber: row.reference } })
    // Nothing for the customer to authorize: the job is covered, so it goes straight to authorized at $0 and may start.
    if (['draft', 'priced', 'offered'].includes(j.status)) {
      await transition(uow, { model: 'Job', id: j.id, from: [j.status], to: 'authorized', actor, eventType: 'job.covered_by_warranty', reason, data: { noChargeReason: reason, authorizedAmountMinor: 0n, authorizedSubtotalMinor: 0n, chargeCeilingMinor: 0n, authorizedContentHash: j.contentHash } })
    } else {
      await tx.job.update({ where: { id: j.id }, data: { noChargeReason: reason, version: { increment: 1 } } })
    }
    auditCreate(uow, actor, 'Job', j.id, 'job.payer_set_shop_warranty', { comeback: row.reference })
  }
  return j.id as string
}

export async function resolveComeback(uow: UnitOfWork, actor: Actor, input: { comebackId: string; resolution: string; comebackJobId?: string | null; expectedVersion?: number | null }) {
  const { tx } = uow
  const resolution = textOf(input.resolution, 'Resolution', 800, true)
  const row = await lockRow<any>(tx, 'ComebackCase', input.comebackId)
  if (row.status === 'open') throw new DomainError(Codes.GUARD_FAILED, 'Diagnose the comeback before resolving it.')
  const comebackJobId = input.comebackJobId ? await linkComebackJob(uow, actor, row, String(input.comebackJobId)) : row.comebackJobId ?? null
  await transition(uow, { model: 'ComebackCase', id: row.id, from: ['diagnosed'], to: 'resolved', expectedVersion: input.expectedVersion, actor, eventType: 'comeback.resolved', data: { resolution, resolvedAt: uow.now, comebackJobId } })
  return { id: row.id, status: 'resolved' }
}

/** Point the case at the repeat-repair job early, so a free repair can start without the customer's authorization. */
export async function attachComebackJob(uow: UnitOfWork, actor: Actor, input: { comebackId: string; comebackJobId: string }) {
  const row = await lockRow<any>(uow.tx, 'ComebackCase', input.comebackId)
  if ((CLOSED_CASE as readonly string[]).includes(row.status)) throw new DomainError(Codes.GUARD_FAILED, 'This comeback is closed.')
  const jobId = await linkComebackJob(uow, actor, row, String(input.comebackJobId))
  await uow.tx.comebackCase.update({ where: { id: row.id }, data: { comebackJobId: jobId, version: { increment: 1 } } })
  auditCreate(uow, actor, 'ComebackCase', row.id, 'comeback.job_attached', { reference: row.reference, jobId })
  return { id: row.id, comebackJobId: jobId, noCharge: row.noCharge }
}

/** Drop a comeback that was opened by mistake or that the customer withdrew. Kept, with the reason. */
export async function cancelComeback(uow: UnitOfWork, actor: Actor, input: { comebackId: string; reason: string; expectedVersion?: number | null }) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  if (reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why the comeback is cancelled.', { field: 'reason' })
  await transition(uow, { model: 'ComebackCase', id: input.comebackId, from: ['open', 'diagnosed'], to: 'cancelled', expectedVersion: input.expectedVersion, actor, eventType: 'comeback.cancelled', reason, data: { resolution: `Cancelled: ${reason}` } })
  return { id: input.comebackId, status: 'cancelled' }
}

/** A part that failed inside its warranty: ask the supplier for credit and the labor to replace it. One claim per comeback per part line. */
export async function createPartWarrantyClaim(uow: UnitOfWork, actor: Actor, input: { comebackId: string; supplierId: string; jobLineId?: string | null; laborReimbursementMinor?: string | number | null }) {
  const { tx, now } = uow
  const row = await lockRow<any>(tx, 'ComebackCase', input.comebackId)
  if (row.cause !== 'part_failure') throw new DomainError(Codes.GUARD_FAILED, 'A supplier claim is for a part that failed. Diagnose the comeback as a part failure first.')
  if (row.status === 'cancelled') throw new DomainError(Codes.GUARD_FAILED, 'This comeback was cancelled.')
  const supplier = await tx.supplier.findUnique({ where: { id: String(input.supplierId) }, select: { id: true, name: true } })
  if (!supplier) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found.', { field: 'supplierId' })
  const jobLineId = input.jobLineId ? String(input.jobLineId) : null
  if (jobLineId) {
    const line = await tx.jobLine.findUnique({ where: { id: jobLineId }, select: { jobId: true, kind: true } })
    if (!line || ![row.originalJobId, row.comebackJobId].includes(line.jobId)) throw new DomainError(Codes.INVALID_INPUT, 'That part line is not on the job that came back.', { field: 'jobLineId' })
  }
  const reimb = centsOf(input.laborReimbursementMinor ?? 0, 'Labor reimbursement', false)
  const dupe = await tx.partWarrantyClaim.findFirst({ where: { comebackId: row.id, jobLineId, status: { notIn: ['denied', 'withdrawn'] } }, select: { claimNumber: true } })
  if (dupe) throw new DomainError(Codes.DUPLICATE, `${dupe.claimNumber} already claims this part for ${row.reference}. Withdraw it first if it was raised by mistake.`)
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: row.shopId! }, select: { code: true } })
  const claimNumber = await nextShopReference(tx, 'WC', shop.code, now)
  const claim = await tx.partWarrantyClaim.create({ data: { shopId: row.shopId, comebackId: row.id, supplierId: supplier.id, jobLineId, claimNumber, laborReimbursementMinor: reimb, status: 'draft' } })
  auditCreate(uow, actor, 'PartWarrantyClaim', claim.id, 'warranty_claim.created', { claimNumber, supplier: supplier.name, comeback: row.reference })
  return { id: claim.id, claimNumber }
}

/** Take back a claim raised by mistake. The row stays, with the reason; it no longer counts. */
export async function withdrawPartWarrantyClaim(uow: UnitOfWork, actor: Actor, input: { claimId: string; reason: string; expectedVersion?: number | null }) {
  const reason = textOf(input.reason, 'Reason', 300, true)
  if (reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why the claim is withdrawn.', { field: 'reason' })
  await transition(uow, { model: 'PartWarrantyClaim', id: input.claimId, from: ['draft', 'submitted'], to: 'withdrawn', expectedVersion: input.expectedVersion, actor, eventType: 'warranty_claim.withdrawn', reason, data: { voidReason: reason, voidedAt: uow.now } })
  return { id: input.claimId, status: 'withdrawn' }
}
