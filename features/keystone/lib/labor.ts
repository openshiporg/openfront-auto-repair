import { actorUserId, can, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import { registerApplier } from './approvalAppliers'
import { consumeApproval, requestApproval } from './approval'
import { flagJob, openPeriodFor, payMinor, periodWindow, shopDay, shopPolicy } from './flagging'
import { textOf } from './partsInput'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Shifts, job clocks, waiting time, clock corrections, credentials and pay periods (SCHEMA §9; STATE-MACHINES §10).
 * Time is stored as timestamps; the hours a clock reports are whole hundredths of an hour.
 */

const MIN = 60_000
const centiOf = (ms: number) => Math.max(0, Math.round(ms / 36_000))

type Break = { startedAt: string; endedAt: string | null }

// ── Who is clocking ───────────────────────────────────────────────────────────

/** The caller's technician profile at this shop. */
export async function ownProfile(tx: Tx, actor: Actor, shopId: string) {
  const userId = actorUserId(actor)
  const profile = userId ? await tx.technicianProfile.findFirst({ where: { userId, shopId, active: true } }) : null
  if (!profile) throw new DomainError(Codes.NOT_AUTHORIZED, 'You are not set up as a technician at this shop.')
  return profile
}

async function profileById(tx: Tx, id: unknown) {
  const profile = typeof id === 'string' && id ? await tx.technicianProfile.findUnique({ where: { id } }) : null
  if (!profile) throw new DomainError(Codes.NOT_FOUND, 'Technician not found.', { field: 'technicianId' })
  return profile
}

// ── Credentials ───────────────────────────────────────────────────────────────

const AC_WORK = /\b(a\/c|air conditioning|air-conditioning|refrigerant|recharge|evacuate)\b/i

/** Work on a car's air conditioning needs the EPA Section 609 certificate (I-R11). */
export async function jobNeedsRefrigerantCredential(tx: Tx, jobId: string) {
  const lines = await tx.jobLine.findMany({ where: { jobId }, select: { kind: true, description: true, partCategory: true } })
  return lines.some(l => l.kind === 'refrigerant' || l.partCategory === 'refrigerant' || (l.kind === 'labor' && AC_WORK.test(l.description)))
}

export function credentialIsCurrent(c: { status: string; expiresAt: Date | null }, today: Date) {
  return c.status === 'active' && (!c.expiresAt || c.expiresAt.getTime() >= today.getTime())
}

/** Refuse to put a technician on refrigerant work without a current 609 certificate. */
export async function assertCredentialForJob(tx: Tx, technicianId: string, jobId: string, now: Date) {
  if (!(await jobNeedsRefrigerantCredential(tx, jobId))) return
  const profile = await tx.technicianProfile.findUniqueOrThrow({ where: { id: technicianId }, select: { displayName: true, shopId: true } })
  const day = shopDay(now, (await shopPolicy(tx, profile.shopId!)).timeZone)
  const creds = await tx.technicianCredential.findMany({ where: { technicianId, kind: 'epa_609' } })
  if (creds.some(c => credentialIsCurrent(c, day))) return
  const latest = creds.filter(c => c.expiresAt).sort((a, b) => b.expiresAt!.getTime() - a.expiresAt!.getTime())[0]
  const why = !creds.length ? 'has no EPA Section 609 certificate on file' : latest?.expiresAt && latest.expiresAt.getTime() < day.getTime() ? `has an EPA Section 609 certificate that expired ${latest.expiresAt.toISOString().slice(0, 10)}` : 'has no current EPA Section 609 certificate'
  throw new DomainError(Codes.CREDENTIAL_REQUIRED, `${profile.displayName} ${why}. Refrigerant work needs a current certificate; give the job to a certified technician.`)
}

export type CredentialInput = { technicianId: string; kind: string; identifier?: string; issuedAt?: string | null; expiresAt?: string | null }
const KINDS = ['epa_609', 'ase', 'state_license', 'manufacturer', 'other']
const dayOf = (value: unknown, field: string) => {
  if (value === null || value === undefined || value === '') return null
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Enter a valid date.', { field })
  return d
}

export async function recordCredential(uow: UnitOfWork, actor: Actor, input: CredentialInput) {
  const profile = await profileById(uow.tx, input.technicianId)
  if (!KINDS.includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the kind of certificate.', { field: 'kind' })
  const issuedAt = dayOf(input.issuedAt, 'issuedAt')
  const expiresAt = dayOf(input.expiresAt, 'expiresAt')
  if (issuedAt && expiresAt && expiresAt < issuedAt) throw new DomainError(Codes.INVALID_INPUT, 'The certificate cannot expire before it was issued.', { field: 'expiresAt' })
  const day = shopDay(uow.now, (await shopPolicy(uow.tx, profile.shopId!)).timeZone)
  const row = await uow.tx.technicianCredential.create({
    data: { technicianId: profile.id, kind: input.kind, identifier: textOf(input.identifier, 'Certificate number', 60), issuedAt, expiresAt, verifiedById: actorUserId(actor), status: expiresAt && expiresAt < day ? 'expired' : 'active' },
  })
  auditCreate(uow, actor, 'TechnicianCredential', row.id, 'credential.recorded', { technician: profile.displayName, kind: input.kind, expiresAt })
  return { id: row.id, status: row.status }
}

// ── Shifts ────────────────────────────────────────────────────────────────────

export async function clockIn(uow: UnitOfWork, actor: Actor, shopId: string) {
  const { tx, now } = uow
  const profile = await ownProfile(tx, actor, shopId)
  const open = await tx.shiftClock.findFirst({ where: { technicianId: profile.id, status: { not: 'clocked_out' } } })
  if (open) throw new DomainError(Codes.GUARD_FAILED, 'You are already clocked in.')
  const row = await tx.shiftClock.create({ data: { shopId, technicianId: profile.id, clockInAt: now, breaks: [], status: 'clocked_in' } })
  auditCreate(uow, actor, 'ShiftClock', row.id, 'shift.clocked_in', { technician: profile.displayName, at: now })
  return { id: row.id, status: 'clocked_in' }
}

async function openShift(tx: Tx, technicianId: string) {
  const shift = await tx.shiftClock.findFirst({ where: { technicianId, status: { not: 'clocked_out' } } })
  if (!shift) throw new DomainError(Codes.GUARD_FAILED, 'You are not clocked in.')
  return shift
}

export async function startBreak(uow: UnitOfWork, actor: Actor, shopId: string) {
  const profile = await ownProfile(uow.tx, actor, shopId)
  const shift = await openShift(uow.tx, profile.id)
  if (shift.status !== 'clocked_in') throw new DomainError(Codes.GUARD_FAILED, 'You are already on a break.')
  const breaks = ((shift.breaks as Break[] | null) ?? []).concat({ startedAt: uow.now.toISOString(), endedAt: null })
  // A running job clock stops for the break so the break is not job time.
  await stopRunningJobClocks(uow, actor, profile.id, 'break')
  await transition(uow, { model: 'ShiftClock', id: shift.id, from: ['clocked_in'], to: 'on_break', actor, eventType: 'shift.break_started', data: { breaks } })
  return { id: shift.id, status: 'on_break' }
}

export async function endBreak(uow: UnitOfWork, actor: Actor, shopId: string) {
  const profile = await ownProfile(uow.tx, actor, shopId)
  const shift = await openShift(uow.tx, profile.id)
  if (shift.status !== 'on_break') throw new DomainError(Codes.GUARD_FAILED, 'You are not on a break.')
  const breaks = ((shift.breaks as Break[] | null) ?? []).map(b => (b.endedAt ? b : { ...b, endedAt: uow.now.toISOString() }))
  await transition(uow, { model: 'ShiftClock', id: shift.id, from: ['on_break'], to: 'clocked_in', actor, eventType: 'shift.break_ended', data: { breaks } })
  return { id: shift.id, status: 'clocked_in' }
}

export async function clockOut(uow: UnitOfWork, actor: Actor, shopId: string) {
  const profile = await ownProfile(uow.tx, actor, shopId)
  const shift = await openShift(uow.tx, profile.id)
  const stopped = await stopRunningJobClocks(uow, actor, profile.id, 'clock_out')
  const breaks = ((shift.breaks as Break[] | null) ?? []).map(b => (b.endedAt ? b : { ...b, endedAt: uow.now.toISOString() }))
  await transition(uow, { model: 'ShiftClock', id: shift.id, from: ['clocked_in', 'on_break'], to: 'clocked_out', actor, eventType: 'shift.clocked_out', data: { clockOutAt: uow.now, breaks } })
  return { id: shift.id, status: 'clocked_out', jobClocksStopped: stopped }
}

/** Hundredths of an hour on the clock for a shift: the span minus the breaks. */
export function shiftCentiHours(shift: { clockInAt: Date | null; clockOutAt: Date | null; breaks: unknown }, until: Date) {
  if (!shift.clockInAt) return 0
  const end = shift.clockOutAt ?? until
  let ms = end.getTime() - shift.clockInAt.getTime()
  for (const b of ((shift.breaks as Break[] | null) ?? [])) {
    const from = new Date(b.startedAt).getTime()
    const to = b.endedAt ? new Date(b.endedAt).getTime() : end.getTime()
    ms -= Math.max(0, Math.min(to, end.getTime()) - Math.max(from, shift.clockInAt.getTime()))
  }
  return centiOf(ms)
}

// ── Job clocks and waiting ────────────────────────────────────────────────────

async function closeWaiting(tx: Tx, jobClockId: string, at: Date) {
  await tx.waitingInterval.updateMany({ where: { jobClockId, endedAt: null }, data: { endedAt: at } })
}

/** Hundredths of an hour of hands-on time: the clock's span minus its waiting intervals. */
async function workedCentiHours(tx: Tx, clock: { id: string; startedAt: Date | null }, stoppedAt: Date) {
  if (!clock.startedAt) return 0
  let ms = stoppedAt.getTime() - clock.startedAt.getTime()
  const waits = await tx.waitingInterval.findMany({ where: { jobClockId: clock.id } })
  for (const w of waits) if (w.startedAt) ms -= Math.max(0, (w.endedAt ?? stoppedAt).getTime() - w.startedAt.getTime())
  return centiOf(ms)
}

async function stopRunningJobClocks(uow: UnitOfWork, actor: Actor, technicianId: string, why: string) {
  const running = await uow.tx.jobClock.findMany({ where: { technicianId, status: 'running' } })
  for (const clock of running) {
    await closeWaiting(uow.tx, clock.id, uow.now)
    const worked = await workedCentiHours(uow.tx, clock, uow.now)
    await transition(uow, { model: 'JobClock', id: clock.id, from: ['running'], to: 'stopped', actor, eventType: 'job_clock.stopped', data: { stoppedAt: uow.now, workedCentiHours: worked }, metadata: { why } })
  }
  return running.length
}

export async function startJobClock(uow: UnitOfWork, actor: Actor, jobId: string) {
  const { tx, now } = uow
  const job = await tx.job.findUniqueOrThrow({ where: { id: jobId }, select: { id: true, number: true, title: true, status: true, repairOrder: { select: { shopId: true, status: true } } } })
  const shopId = job.repairOrder?.shopId
  if (!shopId) throw new DomainError(Codes.NOT_FOUND, 'Job not found.')
  const profile = await ownProfile(tx, actor, shopId)
  if (job.status !== 'in_progress') throw new DomainError(Codes.GUARD_FAILED, job.status === 'authorized' ? 'Start the job first, then start its clock.' : `Job ${job.number} is ${job.status.replaceAll('_', ' ')}; its clock cannot start.`)
  await assertCredentialForJob(tx, profile.id, jobId, now)
  const shift = await tx.shiftClock.findFirst({ where: { technicianId: profile.id, status: { not: 'clocked_out' } } })
  if (!shift) throw new DomainError(Codes.GUARD_FAILED, 'Clock in to your shift before starting a job clock.')
  if (shift.status === 'on_break') throw new DomainError(Codes.GUARD_FAILED, 'End your break before starting a job clock.')
  const policy = await shopPolicy(tx, shopId)
  const running = await tx.jobClock.findMany({ where: { technicianId: profile.id, status: 'running' } })
  if (running.some(r => r.jobId === jobId)) throw new DomainError(Codes.GUARD_FAILED, 'You already have a clock running on this job.')
  if (running.length && !policy.allowConcurrentJobClocks) throw new DomainError(Codes.GUARD_FAILED, 'You have a clock running on another job. Stop it before starting this one.')
  const row = await tx.jobClock.create({ data: { shopId, technicianId: profile.id, jobId, shiftClockId: shift.id, startedAt: now, status: 'running' } })
  auditCreate(uow, actor, 'JobClock', row.id, 'job_clock.started', { job: job.number, technician: profile.displayName })
  return { id: row.id, status: 'running' }
}

export async function stopJobClock(uow: UnitOfWork, actor: Actor, jobClockId: string) {
  const { tx, now } = uow
  const clock = await lockRow<any>(tx, 'JobClock', jobClockId)
  const profile = await ownProfile(tx, actor, clock.shopId)
  if (clock.technicianId !== profile.id) throw new DomainError(Codes.NOT_AUTHORIZED, 'That clock belongs to someone else.')
  await closeWaiting(tx, clock.id, now)
  const worked = await workedCentiHours(tx, clock, now)
  await transition(uow, { model: 'JobClock', id: clock.id, from: ['running'], to: 'stopped', actor, eventType: 'job_clock.stopped', data: { stoppedAt: now, workedCentiHours: worked } })
  return { id: clock.id, status: 'stopped', workedCentiHours: worked }
}

const REASONS = ['parts', 'authorization', 'bay', 'tool', 'info', 'other']
/** Say why the job is waiting (parts, a customer answer, a bay). The wait is taken out of the worked time. */
export async function logWaiting(uow: UnitOfWork, actor: Actor, input: { jobClockId: string; reason?: string; resume?: boolean; note?: string }) {
  const { tx, now } = uow
  const clock = await lockRow<any>(tx, 'JobClock', input.jobClockId)
  const profile = await ownProfile(tx, actor, clock.shopId)
  if (clock.technicianId !== profile.id) throw new DomainError(Codes.NOT_AUTHORIZED, 'That clock belongs to someone else.')
  if (clock.status !== 'running') throw new DomainError(Codes.GUARD_FAILED, 'This clock is stopped.')
  const open = await tx.waitingInterval.findFirst({ where: { jobClockId: clock.id, endedAt: null } })
  if (input.resume) {
    if (!open) throw new DomainError(Codes.GUARD_FAILED, 'The job is not waiting.')
    await tx.waitingInterval.update({ where: { id: open.id }, data: { endedAt: now } })
    return { id: open.id, waiting: false }
  }
  if (open) throw new DomainError(Codes.GUARD_FAILED, 'The job is already waiting.')
  if (!REASONS.includes(String(input.reason))) throw new DomainError(Codes.INVALID_INPUT, 'Say what the job is waiting for.', { field: 'reason' })
  const row = await tx.waitingInterval.create({ data: { jobClockId: clock.id, reason: input.reason!, startedAt: now, note: textOf(input.note, 'Note', 200) } })
  auditCreate(uow, actor, 'WaitingInterval', row.id, 'job_clock.waiting', { reason: input.reason })
  return { id: row.id, waiting: true }
}

// ── Corrections: a second person approves ────────────────────────────────────

export type CorrectionInput = { targetKind: 'shift' | 'job_clock'; targetId: string; after: { start?: string; end?: string }; reason: string }

export async function requestClockCorrection(uow: UnitOfWork, actor: Actor, input: CorrectionInput) {
  const { tx } = uow
  const reason = textOf(input.reason, 'Reason', 300)
  if (reason.length < 5) throw new DomainError(Codes.INVALID_INPUT, 'Say what was wrong with the time.', { field: 'reason' })
  if (!['shift', 'job_clock'].includes(input.targetKind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a shift or a job clock.', { field: 'targetKind' })
  const row = input.targetKind === 'shift' ? await tx.shiftClock.findUnique({ where: { id: input.targetId } }) : await tx.jobClock.findUnique({ where: { id: input.targetId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Time entry not found.')
  const start = input.targetKind === 'shift' ? (row as any).clockInAt : (row as any).startedAt
  const end = input.targetKind === 'shift' ? (row as any).clockOutAt : (row as any).stoppedAt
  if (!end) throw new DomainError(Codes.GUARD_FAILED, 'Correct a time entry after it has ended.')
  const newStart = input.after.start ? new Date(input.after.start) : start
  const newEnd = input.after.end ? new Date(input.after.end) : end
  if (Number.isNaN(newStart.getTime()) || Number.isNaN(newEnd.getTime())) throw new DomainError(Codes.INVALID_INPUT, 'Enter valid times.', { field: 'after' })
  if (newEnd <= newStart) throw new DomainError(Codes.INVALID_INPUT, 'The end must come after the start.', { field: 'after' })
  if (newEnd.getTime() - newStart.getTime() > 16 * 60 * MIN) throw new DomainError(Codes.INVALID_INPUT, 'A single entry cannot run longer than sixteen hours.', { field: 'after' })
  const profile = await tx.technicianProfile.findUniqueOrThrow({ where: { id: (row as any).technicianId } })
  const own = profile.userId === actorUserId(actor)
  if (!own && !can(actor, 'canManageTime')) throw new DomainError(Codes.NOT_AUTHORIZED, 'You can only ask for a correction to your own time.')
  const pending = await tx.clockCorrection.findFirst({ where: { targetId: input.targetId, status: 'pending' } })
  if (pending) throw new DomainError(Codes.GUARD_FAILED, 'A correction to this entry is already waiting for approval.')
  const before = { start, end }
  const after = { start: newStart, end: newEnd }
  const correction = await tx.clockCorrection.create({
    data: { shopId: profile.shopId, technicianId: profile.id, targetKind: input.targetKind, targetId: input.targetId, before: JSON.parse(JSON.stringify(before)), after: JSON.parse(JSON.stringify(after)), reason, requestedById: actorUserId(actor), status: 'pending' },
  })
  const hours = (a: Date, b: Date) => (c => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')}`)(centiOf(b.getTime() - a.getTime()))
  const request = await requestApproval(uow, actor, {
    action: 'time.correction', targetList: 'ClockCorrection', targetId: correction.id, payload: { correctionId: correction.id, after }, requiredPermission: 'canApproveTime',
    summary: `Correct ${profile.displayName}'s time from ${hours(start, end)} h to ${hours(newStart, newEnd)} h: ${reason}`,
  })
  await tx.clockCorrection.update({ where: { id: correction.id }, data: { approvalId: request.id } })
  auditCreate(uow, actor, 'ClockCorrection', correction.id, 'clock_correction.requested', { technician: profile.displayName, before, after }, { reason })
  return { id: correction.id, approvalRequired: true, approvalRequestId: request.id }
}

registerApplier('time.correction', async (uow, actor, request) => {
  const { tx } = uow
  const correction = await lockRow<any>(tx, 'ClockCorrection', request.targetId)
  if (correction.status !== 'pending') return { status: correction.status }
  const after = correction.after as { start: string; end: string }
  const start = new Date(after.start)
  const end = new Date(after.end)
  if (correction.targetKind === 'shift') {
    await tx.shiftClock.update({ where: { id: correction.targetId }, data: { clockInAt: start, clockOutAt: end, version: { increment: 1 } } })
  } else {
    const clock = await tx.jobClock.findUniqueOrThrow({ where: { id: correction.targetId } })
    const worked = await workedCentiHours(tx, { id: clock.id, startedAt: start }, end)
    await tx.jobClock.update({ where: { id: clock.id }, data: { startedAt: start, stoppedAt: end, workedCentiHours: worked, version: { increment: 1 } } })
  }
  await transition(uow, { model: 'ClockCorrection', id: correction.id, from: ['pending'], to: 'applied', actor, eventType: 'clock_correction.applied', approverId: actorUserId(actor), data: { appliedAt: uow.now } })
  return { status: 'applied' }
})

// ── Pay periods ───────────────────────────────────────────────────────────────

const dateText = (d: Date) => d.toISOString().slice(0, 10)

export async function payPeriodSummary(tx: Tx, periodId: string) {
  const period = await tx.payPeriod.findUniqueOrThrow({ where: { id: periodId } })
  const techs = await tx.technicianProfile.findMany({ where: { shopId: period.shopId! }, orderBy: { displayName: 'asc' } })
  const entries = await tx.flaggedHoursEntry.findMany({ where: { payPeriodId: periodId } })
  const policy = await shopPolicy(tx, period.shopId!)
  const from = new Date(period.startsOn!.getTime())
  const until = new Date(period.endsOn!.getTime() + 86_400_000)
  const shifts = await tx.shiftClock.findMany({ where: { shopId: period.shopId!, clockInAt: { gte: new Date(from.getTime() - 14 * 3600_000), lt: new Date(until.getTime() + 14 * 3600_000) }, status: 'clocked_out' } })
  const inPeriod = shifts.filter(s => s.clockInAt && shopDay(s.clockInAt, policy.timeZone).getTime() >= from.getTime() && shopDay(s.clockInAt, policy.timeZone).getTime() < until.getTime())
  return {
    period,
    rows: techs.map(t => {
      const mine = entries.filter(e => e.technicianId === t.id)
      const flagged = mine.reduce((n, e) => n + e.centiHours, 0)
      const clocked = inPeriod.filter(s => s.technicianId === t.id).reduce((n, s) => n + shiftCentiHours(s, s.clockOutAt!), 0)
      const gross = t.payPlan === 'hourly' ? payMinor(clocked, t.hourlyRateMinor) : payMinor(flagged, t.flatRateMinor)
      return { technicianId: t.id, name: t.displayName, payPlan: t.payPlan, rateMinor: t.payPlan === 'hourly' ? t.hourlyRateMinor : t.flatRateMinor, flaggedCentiHours: flagged, clockedCentiHours: clocked, grossMinor: gross, entries: mine.length }
    }),
  }
}

/** Close a period that has ended. A second person approves it; once closed it takes no more entries and never reopens. */
export async function closePayPeriod(uow: UnitOfWork, actor: Actor, input: { payPeriodId: string; approvalRequestId?: string | null }) {
  const { tx, now } = uow
  const period = await lockRow<any>(tx, 'PayPeriod', input.payPeriodId)
  if (period.status !== 'open') throw new DomainError(Codes.GUARD_FAILED, 'This pay period is already closed.')
  const policy = await shopPolicy(tx, period.shopId)
  if (shopDay(now, policy.timeZone).getTime() <= new Date(period.endsOn).getTime()) throw new DomainError(Codes.GUARD_FAILED, `This pay period runs until ${dateText(new Date(period.endsOn))}. Close it after it ends.`)
  const open = await tx.shiftClock.count({ where: { shopId: period.shopId, status: { not: 'clocked_out' } } })
  if (open) throw new DomainError(Codes.GUARD_FAILED, `${open} technician${open === 1 ? ' is' : 's are'} still clocked in. Clock them out before closing the period.`)
  const payload = { payPeriodId: period.id, startsOn: dateText(new Date(period.startsOn)), endsOn: dateText(new Date(period.endsOn)) }
  let approverId: string | null = null
  if (input.approvalRequestId) {
    approverId = (await consumeApproval(uow, { requestId: input.approvalRequestId, action: 'pay_period.close', targetList: 'PayPeriod', targetId: period.id, payload })).approverId
  } else {
    const request = await requestApproval(uow, actor, { action: 'pay_period.close', targetList: 'PayPeriod', targetId: period.id, payload, requiredPermission: 'canClosePayPeriod', summary: `Close the pay period ${payload.startsOn} to ${payload.endsOn}` })
    return { approvalRequired: true, approvalRequestId: request.id }
  }
  await transition(uow, { model: 'PayPeriod', id: period.id, from: ['open'], to: 'closed', actor, eventType: 'pay_period.closed', approverId, data: { closedAt: now, closedById: actorUserId(actor), approvedById: approverId } })
  const next = await openPeriodFor(tx, period.shopId, new Date(new Date(period.endsOn).getTime() + 86_400_000))
  return { id: period.id, status: 'closed', nextPeriodId: next.id }
}

const csvCell = (value: unknown) => {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const dollars = (minor: bigint) => `${minor < 0n ? '-' : ''}${((minor < 0n ? -minor : minor) / 100n).toString()}.${((minor < 0n ? -minor : minor) % 100n).toString().padStart(2, '0')}`
const hoursText = (centi: number) => `${centi < 0 ? '-' : ''}${Math.floor(Math.abs(centi) / 100)}.${String(Math.abs(centi) % 100).padStart(2, '0')}`

/** The payroll file for a closed period: one row for each technician. */
export async function exportPayPeriod(uow: UnitOfWork, actor: Actor, payPeriodId: string) {
  const { tx, now } = uow
  const locked = await lockRow<any>(tx, 'PayPeriod', payPeriodId)
  if (locked.status === 'open') throw new DomainError(Codes.GUARD_FAILED, 'Close the pay period before exporting it.')
  if (locked.status === 'exported') return { id: payPeriodId, status: 'exported', csv: locked.exportCsv as string, already: true }
  const { rows, period } = await payPeriodSummary(tx, payPeriodId)
  const head = ['Technician', 'Pay plan', 'Period start', 'Period end', 'Flagged hours', 'Hours on the clock', 'Rate', 'Gross pay']
  const lines = [head.join(',')]
  for (const r of rows.filter(x => x.entries || x.clockedCentiHours)) {
    lines.push([r.name, r.payPlan.replaceAll('_', ' '), dateText(period.startsOn!), dateText(period.endsOn!), hoursText(r.flaggedCentiHours), hoursText(r.clockedCentiHours), dollars(r.rateMinor), dollars(r.grossMinor)].map(csvCell).join(','))
  }
  const csv = `${lines.join('\n')}\n`
  await transition(uow, { model: 'PayPeriod', id: payPeriodId, from: ['closed'], to: 'exported', actor, eventType: 'pay_period.exported', data: { exportedAt: now, exportCsv: csv }, metadata: { technicians: rows.filter(x => x.entries).length } })
  return { id: payPeriodId, status: 'exported', csv }
}

/** A manager records late or corrected hours. They land in the open period with the reason; a closed period is never touched. */
export async function adjustFlaggedHours(uow: UnitOfWork, actor: Actor, input: { technicianId: string; jobId: string; centiHours: number; reason: string }) {
  const { tx, now } = uow
  const reason = textOf(input.reason, 'Reason', 300)
  if (reason.length < 5) throw new DomainError(Codes.INVALID_INPUT, 'Say why the hours change.', { field: 'reason' })
  if (!Number.isSafeInteger(input.centiHours) || input.centiHours === 0 || Math.abs(input.centiHours) > 10_000) throw new DomainError(Codes.INVALID_INPUT, 'Enter the hours to add or take off, in hundredths of an hour.', { field: 'centiHours' })
  const profile = await profileById(tx, input.technicianId)
  const job = await tx.job.findUnique({ where: { id: input.jobId }, select: { id: true, number: true, repairOrder: { select: { shopId: true, roNumber: true } } } })
  if (!job || job.repairOrder?.shopId !== profile.shopId) throw new DomainError(Codes.NOT_FOUND, 'Job not found at this shop.', { field: 'jobId' })
  const policy = await shopPolicy(tx, profile.shopId!)
  const period = await openPeriodFor(tx, profile.shopId!, shopDay(now, policy.timeZone))
  const earlier = await tx.flaggedHoursEntry.findFirst({ where: { jobId: job.id, technicianId: profile.id }, orderBy: { flaggedAt: 'asc' }, include: { payPeriod: { select: { startsOn: true, endsOn: true, status: true } } } })
  const refersTo = earlier?.payPeriod?.status !== 'open' && earlier?.payPeriod ? ` (corrects the period ${dateText(earlier.payPeriod.startsOn!)} to ${dateText(earlier.payPeriod.endsOn!)})` : ''
  const row = await tx.flaggedHoursEntry.create({
    data: { shopId: profile.shopId, technicianId: profile.id, jobId: job.id, centiHours: input.centiHours, kind: 'adjustment', reason: `${reason}${refersTo}`, sourceEvent: `adjustment:${actorUserId(actor)}:${now.getTime()}`, payPeriodId: period.id, flaggedAt: now },
  })
  auditCreate(uow, actor, 'FlaggedHoursEntry', row.id, 'flagged_hours.adjusted', { technician: profile.displayName, job: job.number, centiHours: input.centiHours }, { reason })
  return { id: row.id, payPeriodId: period.id }
}

export { flagJob, periodWindow }

/** Who works on a job: replaces the job's technician shares. Before the hours are flagged only. */
export async function assignJobTechnicians(uow: UnitOfWork, actor: Actor, input: { jobId: string; shares: { userId: string; sharePct?: string }[] }) {
  const { tx } = uow
  const job = await tx.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { id: true, number: true, repairOrder: { select: { shopId: true } } } })
  if (await tx.flaggedHoursEntry.count({ where: { jobId: job.id, kind: 'flag' } })) throw new DomainError(Codes.GUARD_FAILED, 'This job is already flagged; record any change as an adjustment.')
  const list = Array.isArray(input.shares) ? input.shares : []
  if (!list.length || list.length > 6) throw new DomainError(Codes.INVALID_INPUT, 'Choose one to six technicians.', { field: 'shares' })
  const seen = new Set<string>()
  const rows: { technicianId: string; sharePct: string }[] = []
  for (const s of list) {
    if (seen.has(s.userId)) throw new DomainError(Codes.INVALID_INPUT, 'A technician is listed twice.', { field: 'shares' })
    seen.add(s.userId)
    const profile = await tx.technicianProfile.findFirst({ where: { userId: s.userId, shopId: job.repairOrder!.shopId!, active: true } })
    if (!profile) throw new DomainError(Codes.INVALID_INPUT, 'That person is not a technician at this shop.', { field: 'shares' })
    const pct = String(s.sharePct ?? '1')
    if (!/^(0(\.\d{1,6})?|1(\.0{1,6})?)$/.test(pct) || Number(pct) <= 0) throw new DomainError(Codes.INVALID_INPUT, 'A share is above 0 and at most 1.', { field: 'shares' })
    await assertCredentialForJob(tx, profile.id, job.id, uow.now)
    rows.push({ technicianId: s.userId, sharePct: pct })
  }
  await tx.jobTechShare.deleteMany({ where: { jobId: job.id } })
  for (const r of rows) await tx.jobTechShare.create({ data: { jobId: job.id, technicianId: r.technicianId, sharePct: r.sharePct } })
  auditCreate(uow, actor, 'Job', job.id, 'job.technicians_assigned', { job: job.number, shares: rows })
  return { id: job.id, technicians: rows.length }
}
