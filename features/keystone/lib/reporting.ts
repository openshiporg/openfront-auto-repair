import type { Tx } from './db'
import { Codes, DomainError } from './errors'
import { sumMinor } from './money'
import { payMinor } from './flagging'
import { payloadHash } from './canonical'
import { actorUserId, type Actor } from './actor'
import { auditCreate } from './cas'
import type { UnitOfWork } from './unitOfWork'

/*
 * Shop reports (R§16, C27). Computed from the records when asked; nothing here is a scheduled job.
 * Every report prints its definition next to the number (C27), and a saved snapshot keeps both, so a
 * number can always be explained later. Money is bigint minor units, rendered as strings.
 */

export const REPORT_DEFINITIONS: Record<string, { label: string; definition: string }> = {
  car_count: { label: 'Car count', definition: 'Repair orders with at least one finalized invoice dated in the period. A repair order counts once however many invoices it has.' },
  aro: { label: 'Average repair order (ARO)', definition: 'Sales before tax on those invoices (labor + parts + fees + sublet − discounts) divided by car count. Tax is not sales.' },
  elr: { label: 'Effective labor rate (ELR)', definition: 'Labor sales divided by the labor hours billed on the same invoices. Billed hours are the hours printed on labor lines.' },
  gp_labor: { label: 'Gross profit, labor', definition: 'Labor sales minus labor cost. Labor cost is the hours flagged to technicians in the period times each technician\'s pay rate (flat rate, else hourly). Needs the pay-rate permission to be useful; shown as sales only without cost data.' },
  gp_parts: { label: 'Gross profit, parts', definition: 'Parts sales (parts, tires, cores, refrigerant) minus the cost of those lines (unit cost × quantity at the time of the sale).' },
  tech_productivity: { label: 'Technician productivity', definition: 'Per technician: productivity = flagged hours ÷ hours clocked in on shifts; efficiency = flagged hours ÷ hours on job clocks; proficiency = job-clock hours ÷ shift hours. Flagged hours are net of reversals.' },
  approval_rate: { label: 'Approval rate', definition: 'Jobs a customer approved in the period ÷ jobs a customer answered (approved + declined + deferred). Also shown by dollars.' },
  dvi_rate: { label: 'Inspection (DVI) rate', definition: 'Repair orders opened in the period (not draft or void) that have a completed inspection ÷ all such repair orders.' },
  comeback_rate: { label: 'Comeback rate', definition: 'Comeback cases opened in the period (not cancelled) ÷ car count.' },
  cycle_time: { label: 'Cycle time', definition: 'Average hours from a repair order being opened to the vehicle being released, for orders released in the period.' },
}

export const PART_KINDS = ['part', 'tire', 'core', 'refrigerant']
const DAY = 86_400_000

export function assertPeriod(from: unknown, to: unknown) {
  const re = /^\d{4}-\d{2}-\d{2}$/
  if (typeof from !== 'string' || typeof to !== 'string' || !re.test(from) || !re.test(to)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the first and last day, as YYYY-MM-DD.', { field: 'period' })
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!(b >= a)) throw new DomainError(Codes.INVALID_INPUT, 'The last day cannot be before the first day.', { field: 'period' })
  if ((b - a) / DAY > 800) throw new DomainError(Codes.INVALID_INPUT, 'Choose a period of two years or less.', { field: 'period' })
  return { start: new Date(a), end: new Date(b), endExclusive: new Date(b + DAY) }
}

const ratio = (num: bigint, den: bigint, scale = 100n) => (den === 0n ? null : (num * scale) / den)
const pctString = (n: number, d: number) => (d === 0 ? null : (Math.round((n / d) * 10000) / 100).toFixed(2))

export type KpiOptions = { includeCost: boolean }

export async function computeKpis(tx: Tx, shopId: string, from: string, to: string, options: KpiOptions = { includeCost: true }) {
  const { start, endExclusive } = assertPeriod(from, to)
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, name: true, timeZone: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const edge = { gte: start, lt: endExclusive }

  const invoices = await tx.invoice.findMany({
    where: { shopId, invoiceDate: edge, finalizedAt: { not: null }, status: { notIn: ['draft', 'void'] } },
    select: { id: true, repairOrderId: true, totalMinor: true, taxMinor: true, laborSubtotalMinor: true, partsSubtotalMinor: true, feesSubtotalMinor: true, subletSubtotalMinor: true, discountMinor: true },
  })
  const roIds = [...new Set(invoices.map(i => i.repairOrderId).filter((x): x is string => !!x))]
  const carCount = roIds.length
  const salesMinor = sumMinor(invoices.map(i => i.totalMinor - i.taxMinor))
  const laborSalesMinor = sumMinor(invoices.map(i => i.laborSubtotalMinor))
  const partsSalesMinor = sumMinor(invoices.map(i => i.partsSubtotalMinor))

  const lines = await tx.invoiceLine.findMany({ where: { invoiceId: { in: invoices.map(i => i.id) } }, select: { kind: true, centiHours: true, quantityMilli: true, sourceJobLineId: true, extendedMinor: true } })
  const billedCentiHours = lines.filter(l => l.kind === 'labor').reduce((n, l) => n + (l.centiHours ?? 0), 0)
  const partLines = lines.filter(l => PART_KINDS.includes(l.kind) && l.sourceJobLineId)
  const jobLines = await tx.jobLine.findMany({ where: { id: { in: partLines.map(l => l.sourceJobLineId!) } }, select: { id: true, unitCostMinor: true, quantityMilli: true } })
  const costById = new Map(jobLines.map(j => [j.id, (j.unitCostMinor * BigInt(j.quantityMilli)) / 1000n]))
  const partsCostMinor = sumMinor(partLines.map(l => costById.get(l.sourceJobLineId!) ?? 0n))
  const costKnown = partLines.every(l => costById.has(l.sourceJobLineId!))

  // Technicians
  const profiles = await tx.technicianProfile.findMany({ where: { shopId }, select: { id: true, displayName: true, flatRateMinor: true, hourlyRateMinor: true, payPlan: true } })
  const flagged = await tx.flaggedHoursEntry.findMany({ where: { shopId, flaggedAt: edge }, select: { technicianId: true, centiHours: true } })
  const shifts = await tx.shiftClock.findMany({ where: { shopId, clockInAt: edge }, select: { technicianId: true, clockInAt: true, clockOutAt: true, breaks: true } })
  const jobClocks = await tx.jobClock.findMany({ where: { shopId, startedAt: edge }, select: { technicianId: true, workedCentiHours: true } })
  const { shiftCentiHours } = await import('./labor')
  const now = new Date()
  const technicians = profiles.map(p => {
    const flaggedC = flagged.filter(f => f.technicianId === p.id).reduce((n, f) => n + f.centiHours, 0)
    const shiftC = shifts.filter(s => s.technicianId === p.id).reduce((n, s) => n + shiftCentiHours(s, s.clockOutAt ?? now), 0)
    const clockC = jobClocks.filter(j => j.technicianId === p.id).reduce((n, j) => n + j.workedCentiHours, 0)
    return {
      technicianId: p.id, name: p.displayName, flaggedCentiHours: flaggedC, shiftCentiHours: shiftC, jobClockCentiHours: clockC,
      productivityPct: pctString(flaggedC, shiftC), efficiencyPct: pctString(flaggedC, clockC), proficiencyPct: pctString(clockC, shiftC),
    }
  })
  let laborCostMinor = 0n
  for (const f of flagged) {
    const p = profiles.find(x => x.id === f.technicianId)
    if (p) laborCostMinor += payMinor(f.centiHours, p.payPlan === 'hourly' ? p.hourlyRateMinor : p.flatRateMinor || p.hourlyRateMinor)
  }

  // Approvals
  const roScope = { repairOrder: { shopId } }
  const approvedAuth = await tx.authorization.findMany({ where: { authorizedAt: edge, job: roScope }, select: { jobId: true, amountMinor: true } })
  const approvedJobs = new Set(approvedAuth.map(a => a.jobId))
  const answered = await tx.jobDecision.findMany({ where: { at: edge, job: roScope, decision: { in: ['declined', 'deferred'] } }, select: { jobId: true, decision: true, job: { select: { totalMinor: true } } } })
  const approvedMinor = sumMinor(approvedAuth.map(a => a.amountMinor))
  const declinedMinor = sumMinor(answered.map(a => a.job?.totalMinor ?? 0n))
  const approvalCount = approvedJobs.size

  // Inspections
  const ros = await tx.repairOrder.findMany({ where: { shopId, createdAt: edge, status: { notIn: ['draft', 'void'] } }, select: { id: true } })
  const inspected = ros.length ? await tx.inspection.findMany({ where: { repairOrderId: { in: ros.map(r => r.id) }, completedAt: { not: null } }, select: { repairOrderId: true } }) : []
  const inspectedRos = new Set(inspected.map(i => i.repairOrderId)).size

  const comebacks = await tx.comebackCase.count({ where: { shopId, createdAt: edge, status: { not: 'cancelled' } } })
  const released = await tx.repairOrder.findMany({ where: { shopId, releasedAt: edge }, select: { openedAt: true, createdAt: true, releasedAt: true } })
  const spans = released.map(r => (r.releasedAt!.getTime() - (r.openedAt ?? r.createdAt).getTime()) / 3_600_000).filter(h => h >= 0)

  const values = {
    car_count: { carCount },
    aro: { salesMinor: salesMinor.toString(), carCount, aroMinor: carCount ? (salesMinor / BigInt(carCount)).toString() : null },
    elr: { laborSalesMinor: laborSalesMinor.toString(), billedCentiHours, elrMinor: billedCentiHours ? ((laborSalesMinor * 100n) / BigInt(billedCentiHours)).toString() : null },
    gp_labor: options.includeCost
      ? { laborSalesMinor: laborSalesMinor.toString(), laborCostMinor: laborCostMinor.toString(), gpMinor: (laborSalesMinor - laborCostMinor).toString(), gpPct: ratio(laborSalesMinor - laborCostMinor, laborSalesMinor, 10000n)?.toString() ?? null, gpPctScale: 100 }
      : { laborSalesMinor: laborSalesMinor.toString(), hidden: true },
    gp_parts: options.includeCost
      ? { partsSalesMinor: partsSalesMinor.toString(), partsCostMinor: partsCostMinor.toString(), gpMinor: (partsSalesMinor - partsCostMinor).toString(), gpPct: ratio(partsSalesMinor - partsCostMinor, partsSalesMinor, 10000n)?.toString() ?? null, gpPctScale: 100, costComplete: costKnown }
      : { partsSalesMinor: partsSalesMinor.toString(), hidden: true },
    tech_productivity: { technicians },
    approval_rate: { approvedJobs: approvalCount, declined: answered.filter(a => a.decision === 'declined').length, deferred: answered.filter(a => a.decision === 'deferred').length, ratePct: pctString(approvalCount, approvalCount + answered.length), approvedMinor: approvedMinor.toString(), declinedMinor: declinedMinor.toString(), dollarRatePct: pctString(Number(approvedMinor), Number(approvedMinor + declinedMinor)) },
    dvi_rate: { repairOrders: ros.length, inspected: inspectedRos, ratePct: pctString(inspectedRos, ros.length) },
    comeback_rate: { comebacks, carCount, ratePct: pctString(comebacks, carCount) },
    cycle_time: { released: spans.length, averageHours: spans.length ? (Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10).toFixed(1) : null },
  }
  return { shopId, shopName: shop.name, from, to, values, definitions: Object.fromEntries(Object.entries(REPORT_DEFINITIONS).map(([k, v]) => [k, v.definition])) }
}

export type KpiReport = Awaited<ReturnType<typeof computeKpis>>

/** Keep what the report said, with its definitions. The same inputs give the same snapshot (idempotent by hash). */
export async function saveKpiSnapshot(uow: UnitOfWork, actor: Actor, input: { shopId: string; from: string; to: string; includeCost: boolean }) {
  const report = await computeKpis(uow.tx, input.shopId, input.from, input.to, { includeCost: input.includeCost })
  const inputHash = payloadHash({ values: report.values, definitions: report.definitions })
  const where = { shopId_reportKey_periodStart_periodEnd_inputHash: { shopId: input.shopId, reportKey: 'all', periodStart: new Date(`${input.from}T00:00:00Z`), periodEnd: new Date(`${input.to}T00:00:00Z`), inputHash } }
  const existing = await uow.tx.kpiSnapshot.findUnique({ where })
  if (existing) return { id: existing.id, existing: true }
  const row = await uow.tx.kpiSnapshot.create({
    data: { shopId: input.shopId, reportKey: 'all', periodStart: where.shopId_reportKey_periodStart_periodEnd_inputHash.periodStart, periodEnd: where.shopId_reportKey_periodStart_periodEnd_inputHash.periodEnd, values: report.values as never, definitions: report.definitions as never, inputHash, computedAt: uow.now, computedById: actorUserId(actor) ?? '' },
  })
  auditCreate(uow, actor, 'KpiSnapshot', row.id, 'kpi.snapshot_saved', { shopId: input.shopId, from: input.from, to: input.to })
  return { id: row.id, existing: false }
}
