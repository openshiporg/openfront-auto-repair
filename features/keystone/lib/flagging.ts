import { actorUserId, type Actor } from './actor'
import { auditCreate } from './cas'
import { allocateMinor } from './money'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Flagged hours (SCHEMA §9; DOMAIN I-L1, I-L2). The hours a job sold are paid to the technicians who did it,
 * split in whole hundredths of an hour by largest remainder so the parts always add up to the hours sold.
 * Each flag, reversal or adjustment is a new ledger row; a closed pay period takes no more rows, so a late one
 * lands in the next open period with the reference of what it corrects.
 */

const DAY = 86_400_000
/** Pay periods are two weeks, Monday to Sunday, counted from this Monday. */
const ANCHOR = Date.UTC(2026, 0, 5)
export const PERIOD_DAYS = 14

/** The calendar date at the shop, as a UTC midnight date. */
export function shopDay(at: Date, timeZone = 'America/Los_Angeles') {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function periodWindow(day: Date) {
  const index = Math.floor((day.getTime() - ANCHOR) / (PERIOD_DAYS * DAY))
  const startsOn = new Date(ANCHOR + index * PERIOD_DAYS * DAY)
  return { startsOn, endsOn: new Date(startsOn.getTime() + (PERIOD_DAYS - 1) * DAY) }
}

/** The open pay period that takes an entry made on `day`: that day's period, or the next open one when it has closed. */
export async function openPeriodFor(tx: Tx, shopId: string, day: Date) {
  let window = periodWindow(day)
  for (let guard = 0; guard < 60; guard += 1) {
    const found = await tx.payPeriod.findFirst({ where: { shopId, startsOn: window.startsOn } })
    if (!found) return tx.payPeriod.create({ data: { shopId, startsOn: window.startsOn, endsOn: window.endsOn, status: 'open' } })
    if (found.status === 'open') return found
    window = periodWindow(new Date(window.endsOn.getTime() + DAY))
  }
  throw new Error('No open pay period found')
}

export async function shopPolicy(tx: Tx, shopId: string) {
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { timeZone: true, shopPolicyId: true } })
  const policy = shop.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId }, select: { flagHoursAt: true, comebackPayRule: true, allowConcurrentJobClocks: true } }) : null
  return {
    timeZone: shop.timeZone || 'America/Los_Angeles',
    flagHoursAt: policy?.flagHoursAt ?? 'job_completed',
    comebackPayRule: policy?.comebackPayRule ?? 'reverse',
    allowConcurrentJobClocks: policy?.allowConcurrentJobClocks ?? false,
  }
}

/** Hours sold on a job: its labor lines (sublet and parts earn nothing for a technician). */
export async function soldCentiHours(tx: Tx, jobId: string) {
  const lines = await tx.jobLine.findMany({ where: { jobId, kind: 'labor' }, select: { soldCentiHours: true } })
  return lines.reduce((n, l) => n + l.soldCentiHours, 0)
}

/**
 * Who shares the job, as weights: the shares recorded on the job, else the technicians who clocked on it
 * (by time worked), else the person completing it when they are a technician.
 */
async function shares(tx: Tx, jobId: string, shopId: string, actor: Actor) {
  const recorded = await tx.jobTechShare.findMany({ where: { jobId }, select: { technicianId: true, sharePct: true } })
  if (recorded.length) {
    const out: { technicianId: string; weight: string }[] = []
    for (const r of recorded) {
      const profile = r.technicianId ? await tx.technicianProfile.findFirst({ where: { userId: r.technicianId, shopId, active: true }, select: { id: true } }) : null
      if (profile) out.push({ technicianId: profile.id, weight: r.sharePct.toString() })
    }
    if (out.length) return out
  }
  const clocks = await tx.jobClock.findMany({ where: { jobId }, select: { technicianId: true, workedCentiHours: true } })
  if (clocks.length) {
    const byTech = new Map<string, number>()
    for (const c of clocks) if (c.technicianId) byTech.set(c.technicianId, (byTech.get(c.technicianId) ?? 0) + Math.max(1, c.workedCentiHours))
    return [...byTech].map(([technicianId, weight]) => ({ technicianId, weight: String(weight) }))
  }
  const self = actorUserId(actor) ? await tx.technicianProfile.findFirst({ where: { userId: actorUserId(actor)!, shopId, active: true }, select: { id: true } }) : null
  return self ? [{ technicianId: self.id, weight: '1' }] : []
}

/** Flag a completed job's sold hours to its technicians. Safe to call again: a second call finds the rows and adds none. */
export async function flagJob(uow: UnitOfWork, actor: Actor, jobId: string, sourceEvent: string) {
  const { tx, now } = uow
  const job = await tx.job.findUniqueOrThrow({ where: { id: jobId }, select: { id: true, number: true, repairOrder: { select: { shopId: true, roNumber: true } } } })
  const shopId = job.repairOrder?.shopId
  if (!shopId) return { flagged: 0, technicians: 0 }
  const sold = await soldCentiHours(tx, jobId)
  if (sold <= 0) return { flagged: 0, technicians: 0 }
  const already = await tx.flaggedHoursEntry.count({ where: { jobId, kind: 'flag' } })
  if (already) return { flagged: 0, technicians: 0 }
  const who = await shares(tx, jobId, shopId, actor)
  if (!who.length) {
    auditCreate(uow, actor, 'Job', jobId, 'flagged_hours.no_technician', { sold }, { reason: 'No technician is recorded on this job, so no hours were flagged.' })
    return { flagged: 0, technicians: 0 }
  }
  const policy = await shopPolicy(tx, shopId)
  const period = await openPeriodFor(tx, shopId, shopDay(now, policy.timeZone))
  const parts = allocateMinor(BigInt(sold), who.map(w => w.weight))
  let flagged = 0
  for (const [i, w] of who.entries()) {
    const centi = Number(parts[i])
    if (centi === 0) continue
    const row = await tx.flaggedHoursEntry.create({
      data: { shopId, technicianId: w.technicianId, jobId, centiHours: centi, kind: 'flag', reason: `Job ${job.number} on ${job.repairOrder?.roNumber ?? 'repair order'}`, sourceEvent, payPeriodId: period.id, flaggedAt: now },
    })
    auditCreate(uow, actor, 'FlaggedHoursEntry', row.id, 'flagged_hours.flagged', { jobId, technicianId: w.technicianId, centiHours: centi, sold })
    flagged += centi
  }
  return { flagged, technicians: who.length }
}

/** Take back the hours a job paid, in the period that is open now (the comeback rule, I-L2). One reversal per technician and event. */
export async function reverseJobFlags(uow: UnitOfWork, actor: Actor, jobId: string, sourceEvent: string, reason: string) {
  const { tx, now } = uow
  const job = await tx.job.findUniqueOrThrow({ where: { id: jobId }, select: { repairOrder: { select: { shopId: true } } } })
  const shopId = job.repairOrder!.shopId!
  const rows = await tx.flaggedHoursEntry.findMany({ where: { jobId }, select: { technicianId: true, centiHours: true } })
  const net = new Map<string, number>()
  for (const r of rows) if (r.technicianId) net.set(r.technicianId, (net.get(r.technicianId) ?? 0) + r.centiHours)
  const policy = await shopPolicy(tx, shopId)
  const period = await openPeriodFor(tx, shopId, shopDay(now, policy.timeZone))
  let reversed = 0
  for (const [technicianId, centi] of net) {
    if (centi <= 0) continue
    const exists = await tx.flaggedHoursEntry.findFirst({ where: { jobId, technicianId, kind: 'reversal', sourceEvent }, select: { id: true } })
    if (exists) continue
    const row = await tx.flaggedHoursEntry.create({ data: { shopId, technicianId, jobId, centiHours: -centi, kind: 'reversal', reason, sourceEvent, payPeriodId: period.id, flaggedAt: now } })
    auditCreate(uow, actor, 'FlaggedHoursEntry', row.id, 'flagged_hours.reversed', { jobId, technicianId, centiHours: -centi }, { reason })
    reversed += centi
  }
  return { reversed }
}

/** Pay in minor units for hundredths of an hour at an hourly rate, rounded half-even once. */
export function payMinor(centiHours: number, rateMinor: bigint) {
  const product = BigInt(centiHours) * rateMinor
  const sign = product < 0n ? -1n : 1n
  const abs = product < 0n ? -product : product
  const whole = abs / 100n
  const rest = abs % 100n
  const rounded = rest > 50n || (rest === 50n && whole % 2n === 1n) ? whole + 1n : whole
  return sign * rounded
}
