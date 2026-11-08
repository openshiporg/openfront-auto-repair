import { actorUserId, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import { consumeApproval, requestApproval } from './approval'
import { reverseJobFlags, shopDay, shopPolicy } from './flagging'
import { textOf } from './partsInput'
import { nextShopReference } from './sequence'
import type { UnitOfWork } from './unitOfWork'

/*
 * Comebacks and warranty claims (SCHEMA §9; STATE-MACHINES §12; DOMAIN I-W1, I-W2). A comeback points at a job that
 * was finished and billed. It is free for the customer when the warranty on that job still holds, or when the owner
 * approves goodwill. When the shop's own work was at fault the hours it paid are taken back (policy: reverse or keep).
 */

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
  const open = await tx.comebackCase.findFirst({ where: { originalJobId: job.id, status: { not: 'resolved' } } })
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
  if (row.status === 'resolved') throw new DomainError(Codes.GUARD_FAILED, 'This comeback is closed.')
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

export async function resolveComeback(uow: UnitOfWork, actor: Actor, input: { comebackId: string; resolution: string; comebackJobId?: string | null; expectedVersion?: number | null }) {
  const { tx } = uow
  const resolution = textOf(input.resolution, 'Resolution', 800, true)
  const row = await lockRow<any>(tx, 'ComebackCase', input.comebackId)
  if (row.status === 'open') throw new DomainError(Codes.GUARD_FAILED, 'Diagnose the comeback before resolving it.')
  let comebackJobId: string | null = null
  if (input.comebackJobId) {
    const j = await tx.job.findUnique({ where: { id: input.comebackJobId }, select: { id: true, repairOrder: { select: { shopId: true } } } })
    if (!j || j.repairOrder?.shopId !== row.shopId) throw new DomainError(Codes.NOT_FOUND, 'Job not found at this shop.', { field: 'comebackJobId' })
    if (j.id === row.originalJobId) throw new DomainError(Codes.INVALID_INPUT, 'The repeat repair is a new job, not the original one.', { field: 'comebackJobId' })
    comebackJobId = j.id
    if (row.noCharge) await tx.job.update({ where: { id: j.id }, data: { noChargeReason: `Comeback ${row.reference}: no charge` } })
  }
  await transition(uow, { model: 'ComebackCase', id: row.id, from: ['diagnosed'], to: 'resolved', expectedVersion: input.expectedVersion, actor, eventType: 'comeback.resolved', data: { resolution, resolvedAt: uow.now, comebackJobId } })
  return { id: row.id, status: 'resolved' }
}

/** A part that failed inside its warranty: ask the supplier for credit and the labor to replace it. */
export async function createPartWarrantyClaim(uow: UnitOfWork, actor: Actor, input: { comebackId: string; supplierId: string; jobLineId?: string | null; laborReimbursementMinor?: string | number | null }) {
  const { tx, now } = uow
  const row = await tx.comebackCase.findUnique({ where: { id: input.comebackId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Comeback not found.')
  if (row.cause !== 'part_failure') throw new DomainError(Codes.GUARD_FAILED, 'A supplier claim is for a part that failed. Diagnose the comeback as a part failure first.')
  const supplier = await tx.supplier.findUnique({ where: { id: String(input.supplierId) }, select: { id: true, name: true } })
  if (!supplier) throw new DomainError(Codes.NOT_FOUND, 'Supplier not found.', { field: 'supplierId' })
  const reimb = BigInt(String(input.laborReimbursementMinor ?? 0).replace(/[^0-9]/g, '') || '0')
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: row.shopId! }, select: { code: true } })
  const claimNumber = await nextShopReference(tx, 'WC', shop.code, now)
  const claim = await tx.partWarrantyClaim.create({ data: { shopId: row.shopId, comebackId: row.id, supplierId: supplier.id, jobLineId: input.jobLineId || null, claimNumber, laborReimbursementMinor: reimb, status: 'draft' } })
  auditCreate(uow, actor, 'PartWarrantyClaim', claim.id, 'warranty_claim.created', { claimNumber, supplier: supplier.name, comeback: row.reference })
  return { id: claim.id, claimNumber }
}
