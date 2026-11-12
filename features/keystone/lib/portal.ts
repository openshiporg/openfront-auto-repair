import { auditCreate, lockRow } from './cas'
import type { Actor } from './actor'
import { DomainError, Codes } from './errors'
import { createAccessToken, resolveAccessToken, revokeTokensFor } from './publicTokens'
import type { UnitOfWork } from './unitOfWork'
import type { Tx } from './db'

/*
 * Customer portal data (SCHEMA §17: /api/public/portal/*). Data only: a link a staff member copies and hands over; there is
 * no portal screen and nothing is emailed. A person sees a vehicle's history only for the time they owned it: a repair order
 * counts when it was opened between the day they became the owner and the day that ownership ended. The same rule applies to
 * the list, one item, the counts and the related records, so a new owner never sees the previous owner's service history.
 */

export async function createPortalLink(uow: UnitOfWork, actor: Actor, input: { customerId: string }) {
  const { tx } = uow
  const customer = await lockRow<any>(tx, 'Customer', input.customerId)
  if (customer.status && customer.status !== 'active') throw new DomainError(Codes.GUARD_FAILED, 'This customer is no longer active.')
  await revokeTokensFor(tx, 'Customer', customer.id, uow.now)
  const made = await createAccessToken(uow, { purpose: 'portal_magic_link', subjectType: 'Customer', subjectId: customer.id, shopId: null, ttlHours: 720, maxUses: 2000 })
  auditCreate(uow, actor, 'Customer', customer.id, 'portal_link.created', { expiresAt: made.expiresAt.toISOString() })
  return { apiPath: `/api/public/portal/${made.token}`, expiresAt: made.expiresAt.toISOString() }
}

export async function portalCustomer(tx: Tx, token: string, now: Date, consume: boolean) {
  const access = await resolveAccessToken(tx, 'portal_magic_link', token, now, { consume })
  const customer = await tx.customer.findUnique({ where: { id: access.subjectId }, select: { id: true, displayName: true, status: true } })
  if (!customer || customer.status !== 'active') throw new DomainError(Codes.TOKEN_INVALID, 'This link is not valid.')
  return customer
}

/**
 * One ownership period. `from`/`to` are the outer calendar-day bounds (the start day and the end day count, because the
 * ownership columns are days). `innerFrom`/`innerTo` are the bounds with no doubt: the exact moment of a sale when the rows
 * record it, otherwise the boundary days are left out. A sale closes one ownership and opens the next on the same day, so on a
 * boundary day a record is shown only when it is plainly this customer's: a repair order whose customer is them, or anything
 * inside the exact bounds. It fails closed: a new owner never sees the previous owner's visit from the day of the sale.
 */
export type Window = { vehicleId: string; from: Date; to: Date | null; innerFrom: Date; innerTo: Date | null }

const DAY = 86_400_000
const dayOf = (d: Date) => d.toISOString().slice(0, 10)

/** The periods this customer owned each vehicle. */
export async function ownershipWindows(tx: Tx, customerId: string): Promise<Window[]> {
  const rows = await tx.vehicleOwnership.findMany({ where: { customerId, role: 'owner', vehicleId: { not: null } }, select: { id: true, vehicleId: true, startedAt: true, endedAt: true, createdAt: true } })
  if (!rows.length) return []
  // Every owner row on these vehicles, to find the moment the next owner took over.
  const all = await tx.vehicleOwnership.findMany({ where: { vehicleId: { in: rows.map(r => r.vehicleId!) }, role: 'owner' }, select: { id: true, vehicleId: true, startedAt: true, createdAt: true } })
  return rows.map(r => {
    const from = r.startedAt ?? new Date(0)
    const to = r.endedAt ? new Date(r.endedAt.getTime() + DAY) : null
    // linkOwner creates the row at the moment of the sale, on the start day: that moment is the exact start.
    const innerFrom = r.startedAt ? (dayOf(r.createdAt) === dayOf(r.startedAt) ? r.createdAt : new Date(r.startedAt.getTime() + DAY)) : new Date(0)
    let innerTo: Date | null = null
    if (r.endedAt) {
      const end = r.endedAt
      const successor = all
        .filter(o => o.id !== r.id && o.vehicleId === r.vehicleId && o.startedAt && dayOf(o.startedAt) === dayOf(end) && dayOf(o.createdAt) === dayOf(end) && o.createdAt > r.createdAt)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
      innerTo = successor ? successor.createdAt : end
    }
    return { vehicleId: r.vehicleId!, from, to, innerFrom, innerTo }
  })
}

const between = (gte: Date, lt: Date | null) => ({ gte, ...(lt ? { lt } : {}) })

/** A Prisma filter for repair orders that fall inside any ownership window. */
export function withinOwnership(windows: Window[], customerId: string) {
  return {
    OR: windows.map(w => ({
      vehicleId: w.vehicleId,
      openedAt: between(w.from, w.to),
      OR: [{ customerId }, { openedAt: between(w.innerFrom, w.innerTo) }],
    })),
  }
}

const roSelect = { id: true, roNumber: true, status: true, openedAt: true, vehicleId: true, vehicle: { select: { id: true, year: true, make: true, model: true } }, shop: { select: { name: true } } } as const

export async function portalOverview(tx: Tx, customerId: string) {
  const windows = await ownershipWindows(tx, customerId)
  if (!windows.length) return { vehicles: [], repairOrders: [], count: 0 }
  const where = withinOwnership(windows, customerId)
  const [repairOrders, count, vehicles] = await Promise.all([
    tx.repairOrder.findMany({ where: { ...where, status: { not: 'draft' } }, orderBy: { openedAt: 'desc' }, take: 100, select: roSelect }),
    tx.repairOrder.count({ where: { ...where, status: { not: 'draft' } } }),
    tx.vehicle.findMany({ where: { id: { in: windows.map(w => w.vehicleId) } }, select: { id: true, year: true, make: true, model: true } }),
  ])
  return {
    count,
    vehicles,
    repairOrders: repairOrders.map(r => ({ id: r.id, number: r.roNumber, status: r.status, openedAt: r.openedAt, shop: r.shop?.name ?? '', vehicle: r.vehicle })),
  }
}

/** One repair order, only when it is inside an ownership window. Anything else looks like it does not exist. */
export async function portalRepairOrder(tx: Tx, customerId: string, repairOrderId: string) {
  const windows = await ownershipWindows(tx, customerId)
  if (!windows.length) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const ro = await tx.repairOrder.findFirst({
    where: { id: repairOrderId, status: { not: 'draft' }, ...withinOwnership(windows, customerId) },
    select: { ...roSelect, jobs: { where: { status: { notIn: ['draft', 'voided'] } }, orderBy: { number: 'asc' }, select: { id: true, number: true, title: true, status: true, totalMinor: true } } },
  })
  if (!ro) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const invoices = await tx.invoice.findMany({ where: { repairOrderId: ro.id }, orderBy: { invoiceDate: 'asc' }, select: { id: true, invoiceNumber: true, totalMinor: true, balanceMinor: true, status: true } })
  return { id: ro.id, number: ro.roNumber, status: ro.status, openedAt: ro.openedAt, shop: ro.shop?.name ?? '', vehicle: ro.vehicle, jobs: ro.jobs, invoices }
}

/** Records tied to a vehicle (odometer readings, plates), limited to the ownership window too. */
export async function portalVehicle(tx: Tx, customerId: string, vehicleId: string) {
  const windows = (await ownershipWindows(tx, customerId)).filter(w => w.vehicleId === vehicleId)
  if (!windows.length) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  // A reading has no customer, so only the exact bounds count for it.
  const readingWhere = { OR: windows.map(w => ({ at: between(w.innerFrom, w.innerTo) })) }
  const roWhere = { status: { not: 'draft' }, ...withinOwnership(windows, customerId) }
  const [vehicle, readings, repairOrders, count] = await Promise.all([
    tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId }, select: { id: true, year: true, make: true, model: true } }),
    tx.odometerReading.findMany({ where: { vehicleId, accepted: true, ...readingWhere }, orderBy: { at: 'desc' }, take: 50, select: { value: true, unit: true, at: true } }),
    tx.repairOrder.findMany({ where: roWhere, orderBy: { openedAt: 'desc' }, take: 100, select: roSelect }),
    tx.repairOrder.count({ where: roWhere }),
  ])
  return { vehicle, count, odometer: readings, repairOrders: repairOrders.map(r => ({ id: r.id, number: r.roNumber, status: r.status, openedAt: r.openedAt, shop: r.shop?.name ?? '' })) }
}
