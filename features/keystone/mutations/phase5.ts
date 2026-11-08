import { actorFromSession, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { Codes, DomainError } from '../lib/errors'
import { requireShop } from './phase1'
import {
  adjustFlaggedHours, assignJobTechnicians, clockIn, clockOut, closePayPeriod, endBreak, exportPayPeriod, logWaiting, recordCredential, requestClockCorrection, startBreak, startJobClock, stopJobClock,
  type CorrectionInput, type CredentialInput,
} from '../lib/labor'
import { createPartWarrantyClaim, diagnoseComeback, openComeback, requestGoodwill, resolveComeback } from '../lib/comebacks'

type Ctx = { session: any; prisma: any }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

async function shopOf(context: Ctx, model: 'jobClock' | 'payPeriod' | 'comebackCase' | 'technicianProfile' | 'job' | 'clockCorrection', id: unknown) {
  if (typeof id !== 'string' || !id) throw new DomainError(Codes.INVALID_INPUT, 'Choose a record.')
  const shopId = model === 'job'
    ? (await context.prisma.job.findUnique({ where: { id }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId
    : (await context.prisma[model].findUnique({ where: { id }, select: { shopId: true } }))?.shopId
  if (!shopId) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  return requireShop(context, shopId)
}

// ── Clocks ────────────────────────────────────────────────────────────────────

export async function clockInShift(_root: unknown, args: { shopId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'clock in')
  requireShop(context, args.shopId)
  return run(context, actor, 'shift.clock_in', args.idempotencyKey, args, uow => clockIn(uow, actor, args.shopId))
}

export async function clockOutShift(_root: unknown, args: { shopId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'clock out')
  requireShop(context, args.shopId)
  return run(context, actor, 'shift.clock_out', args.idempotencyKey, args, uow => clockOut(uow, actor, args.shopId))
}

export async function startShiftBreak(_root: unknown, args: { shopId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'start a break')
  requireShop(context, args.shopId)
  return run(context, actor, 'shift.break_start', args.idempotencyKey, args, uow => startBreak(uow, actor, args.shopId))
}

export async function endShiftBreak(_root: unknown, args: { shopId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'end a break')
  requireShop(context, args.shopId)
  return run(context, actor, 'shift.break_end', args.idempotencyKey, args, uow => endBreak(uow, actor, args.shopId))
}

export async function startTechJobClock(_root: unknown, args: { jobId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'start a job clock')
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'job_clock.start', args.idempotencyKey, args, uow => startJobClock(uow, actor, args.jobId))
}

export async function stopTechJobClock(_root: unknown, args: { jobClockId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'stop a job clock')
  await shopOf(context, 'jobClock', args.jobClockId)
  return run(context, actor, 'job_clock.stop', args.idempotencyKey, args, uow => stopJobClock(uow, actor, args.jobClockId))
}

export async function logJobWaiting(_root: unknown, args: { jobClockId: string; reason?: string; resume?: boolean; note?: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf')
  requireHuman(actor, 'log waiting time')
  await shopOf(context, 'jobClock', args.jobClockId)
  return run(context, actor, 'job_clock.waiting', args.idempotencyKey, args, uow => logWaiting(uow, actor, { jobClockId: args.jobClockId, reason: args.reason, resume: args.resume, note: args.note }))
}

export async function requestTimeCorrection(_root: unknown, args: { input: CorrectionInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClockSelf', 'canManageTime')
  requireHuman(actor, 'ask for a time correction')
  const input = args.input ?? ({} as CorrectionInput)
  if (input.targetKind !== 'shift' && input.targetKind !== 'job_clock') throw new DomainError(Codes.INVALID_INPUT, 'Choose a shift or a job clock.', { field: 'targetKind' })
  const target = await context.prisma[input.targetKind === 'shift' ? 'shiftClock' : 'jobClock'].findUnique({ where: { id: String(input.targetId) }, select: { shopId: true } })
  if (!target?.shopId) throw new DomainError(Codes.NOT_FOUND, 'Time entry not found.')
  requireShop(context, target.shopId)
  return run(context, actor, 'clock_correction.request', args.idempotencyKey, args.input, uow => requestClockCorrection(uow, actor, input))
}

// ── Credentials and crews ────────────────────────────────────────────────────

export async function saveTechCredential(_root: unknown, args: { input: CredentialInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTime')
  requireHuman(actor, 'record a certificate')
  const input = args.input ?? ({} as CredentialInput)
  await shopOf(context, 'technicianProfile', input.technicianId)
  return run(context, actor, 'credential.record', args.idempotencyKey, input, uow => recordCredential(uow, actor, input))
}

export async function assignShopJobTechnicians(_root: unknown, args: { jobId: string; shares: { userId: string; sharePct?: string }[]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTime', 'canWriteRepairOrders')
  await shopOf(context, 'job', args.jobId)
  return run(context, actor, 'job.assign_technicians', args.idempotencyKey, args, uow => assignJobTechnicians(uow, actor, { jobId: args.jobId, shares: args.shares }))
}

export async function adjustTechFlaggedHours(_root: unknown, args: { technicianId: string; jobId: string; centiHours: number; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTime')
  requireHuman(actor, 'adjust flagged hours')
  await shopOf(context, 'technicianProfile', args.technicianId)
  return run(context, actor, 'flagged_hours.adjust', args.idempotencyKey, args, uow => adjustFlaggedHours(uow, actor, args))
}

// ── Pay periods ──────────────────────────────────────────────────────────────

export async function closeShopPayPeriod(_root: unknown, args: { payPeriodId: string; approvalRequestId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageTime', 'canClosePayPeriod')
  requireHuman(actor, 'close a pay period')
  await shopOf(context, 'payPeriod', args.payPeriodId)
  return run(context, actor, 'pay_period.close', args.idempotencyKey, args, uow => closePayPeriod(uow, actor, args))
}

export async function exportShopPayPeriod(_root: unknown, args: { payPeriodId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canClosePayPeriod', 'canReadTechPay')
  requireHuman(actor, 'export a pay period')
  await shopOf(context, 'payPeriod', args.payPeriodId)
  return run(context, actor, 'pay_period.export', args.idempotencyKey, args, uow => exportPayPeriod(uow, actor, args.payPeriodId))
}

// ── Comebacks and warranty ───────────────────────────────────────────────────

export async function openShopComeback(_root: unknown, args: { originalJobId: string; concern: string; odometer?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageComebacks')
  await shopOf(context, 'job', args.originalJobId)
  return run(context, actor, 'comeback.open', args.idempotencyKey, args, uow => openComeback(uow, actor, args))
}

export async function diagnoseShopComeback(_root: unknown, args: { comebackId: string; cause: string; diagnosis: string; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageComebacks')
  await shopOf(context, 'comebackCase', args.comebackId)
  return run(context, actor, 'comeback.diagnose', args.idempotencyKey, args, uow => diagnoseComeback(uow, actor, args))
}

export async function requestComebackGoodwill(_root: unknown, args: { comebackId: string; reason: string; approvalRequestId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageComebacks', 'canApproveGoodwill')
  requireHuman(actor, 'make a repair free')
  await shopOf(context, 'comebackCase', args.comebackId)
  return run(context, actor, 'comeback.goodwill', args.idempotencyKey, args, uow => requestGoodwill(uow, actor, args))
}

export async function resolveShopComeback(_root: unknown, args: { comebackId: string; resolution: string; comebackJobId?: string | null; expectedVersion?: number | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageComebacks')
  await shopOf(context, 'comebackCase', args.comebackId)
  return run(context, actor, 'comeback.resolve', args.idempotencyKey, args, uow => resolveComeback(uow, actor, args))
}

export async function createShopPartWarrantyClaim(_root: unknown, args: { comebackId: string; supplierId: string; jobLineId?: string | null; laborReimbursementMinor?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageComebacks')
  await shopOf(context, 'comebackCase', args.comebackId)
  return run(context, actor, 'warranty_claim.create', args.idempotencyKey, args, uow => createPartWarrantyClaim(uow, actor, args))
}
