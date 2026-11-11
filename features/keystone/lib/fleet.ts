import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, systemActor, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { nextReference } from './sequence'
import { needApproval } from './settlement'
import { createAccessToken, revokeTokensFor } from './publicTokens'
import { zonedDate } from '../../../lib/zonedTime'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Fleet and business accounts (STATE-MACHINES §15; SCHEMA §3.5 to §3.8, §11.8).
 * Nothing here runs on a timer. Credit standing and certificate expiry are computed from the
 * rows whenever something touches the account (opening a repair order, invoicing, the Refresh
 * button), and are written back then, idempotently.
 * Statements are never sent: staff (or the account's own portal link) export them.
 */

const DAY = 86_400_000
export const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)
const DAY_TEXT = /^\d{4}-\d{2}-\d{2}$/
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)
const waiting = (id: string) => ({ approvalRequired: true, approvalRequestId: id })

export const usd = (minor: bigint | string | number) => {
  const v = BigInt(minor)
  const t = (v < 0n ? -v : v).toString().padStart(3, '0')
  const whole = t.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${v < 0n ? '-' : ''}$${whole}.${t.slice(-2)}`
}

export async function orgToday(tx: Tx, now: Date) {
  const org = await tx.organizationSettings.findUnique({ where: { id: 1 }, select: { defaultTimeZone: true } })
  return zonedDate(org?.defaultTimeZone || 'America/Los_Angeles', now)
}
async function orgZone(tx: Tx) {
  return (await tx.organizationSettings.findUnique({ where: { id: 1 }, select: { defaultTimeZone: true } }))?.defaultTimeZone || 'America/Los_Angeles'
}

// ── Exemption certificates ────────────────────────────────────────────────────

/** The certificate that exempts new invoices today: active, started, and not yet at its expiry date. */
export async function activeCertificate(tx: Tx, accountId: string, today: string) {
  const rows = await tx.exemptionCertificate.findMany({ where: { businessAccountId: accountId, status: 'active' }, orderBy: { createdAt: 'desc' } })
  return rows.find(c => (!c.effectiveFrom || iso(c.effectiveFrom)! <= today) && (!c.expiresAt || iso(c.expiresAt)! > today)) ?? null
}

/** Mark certificates past their expiry as expired and keep the account's taxExempt flag true to what is on file. Idempotent. */
export async function syncCertificates(uow: UnitOfWork, accountId: string, actor: Actor = systemActor('fleet-standing')) {
  const { tx, now } = uow
  const today = await orgToday(tx, now)
  const lapsed = await tx.exemptionCertificate.findMany({ where: { businessAccountId: accountId, status: 'active', expiresAt: { lte: dateOnly(today) } }, select: { id: true } })
  for (const c of lapsed) await transition(uow, { model: 'ExemptionCertificate', id: c.id, from: ['active'], to: 'expired', actor, eventType: 'certificate.expired', metadata: { today } })
  const active = await activeCertificate(tx, accountId, today)
  const account = await tx.businessAccount.findUniqueOrThrow({ where: { id: accountId }, select: { taxExempt: true } })
  if (account.taxExempt !== (active !== null)) {
    await tx.businessAccount.update({ where: { id: accountId }, data: { taxExempt: active !== null, version: { increment: 1 } } })
    uow.audit({ eventType: 'account.tax_exempt_changed', entityType: 'BusinessAccount', entityId: accountId, after: { taxExempt: active !== null, certificateId: active?.id ?? null } })
  }
  return active
}

// ── Credit standing ───────────────────────────────────────────────────────────

export const AGING = ['current', 'days1to30', 'days31to60', 'days61to90', 'days90plus'] as const
const bucketOf = (daysLate: number) => (daysLate <= 0 ? 'current' : daysLate <= 30 ? 'days1to30' : daysLate <= 60 ? 'days31to60' : daysLate <= 90 ? 'days61to90' : 'days90plus') as typeof AGING[number]

/** What an account owes, how late it is, and whether new non-cash work may be taken. Writes nothing. */
export async function standingOf(tx: Tx, accountId: string, now: Date) {
  const account = await tx.businessAccount.findUnique({ where: { id: accountId } })
  if (!account) throw new DomainError(Codes.NOT_FOUND, 'Account not found.')
  const today = await orgToday(tx, now)
  const open = await tx.invoice.findMany({ where: { businessAccountId: accountId, balanceMinor: { gt: 0n } }, select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, balanceMinor: true } })
  const aging: Record<typeof AGING[number], bigint> = { current: 0n, days1to30: 0n, days31to60: 0n, days61to90: 0n, days90plus: 0n }
  let worst: { invoiceNumber: string; days: number } | null = null
  for (const inv of open) {
    const due = iso(inv.dueDate) ?? iso(inv.invoiceDate) ?? today
    const late = daysBetween(due, today)
    aging[bucketOf(late)] += inv.balanceMinor
    if (late > 0 && (!worst || late > worst.days)) worst = { invoiceNumber: inv.invoiceNumber, days: late }
  }
  const limit = account.creditLimitMinor
  const openBalance = account.openBalanceMinor
  const overLimit = limit > 0n && openBalance > limit
  const overdue = account.holdAfterOverdueDays !== null && worst !== null && worst.days > account.holdAfterOverdueDays
  const waived = account.holdWaivedUntil !== null && account.holdWaivedUntil.getTime() > now.getTime()
  const reasons: string[] = []
  if (overLimit) reasons.push(`the open balance ${usd(openBalance)} is over the ${usd(limit)} credit limit`)
  if (overdue) reasons.push(`invoice ${worst!.invoiceNumber} is ${worst!.days} days overdue (the account is held after ${account.holdAfterOverdueDays})`)
  const shouldHold = (overLimit || overdue) && !waived
  const held = account.status === 'credit_hold' || account.status === 'on_hold'
  const reason = held ? (account.holdReason || (reasons.length ? `${reasons.join(' and ')}.` : 'A manager placed it on hold.')) : shouldHold ? `${reasons.join(' and ')}.` : ''
  const blocked = held || shouldHold || account.status === 'closed'
  return {
    accountId, name: account.name, status: account.status, creditLimitMinor: limit, openBalanceMinor: openBalance,
    availableMinor: limit > 0n ? limit - openBalance : null, overLimit, overdue, waived, shouldHold, blocked,
    reason: account.status === 'closed' ? 'The account is closed.' : reason, maxDaysOverdue: worst?.days ?? 0, aging, today,
  }
}

export const readableBlock = (s: Awaited<ReturnType<typeof standingOf>>) =>
  s.status === 'closed' ? `${s.name} is closed. Reopen the account or bill the customer directly.` : `${s.name} is on credit hold: ${s.reason} A manager with credit approval must release it before new work is billed to the account, or take payment in cash.`

/** Write the computed standing back: certificates, and the hold when the account has earned one. Idempotent. */
export async function refreshStanding(uow: UnitOfWork, actor: Actor, accountId: string) {
  await lockRow(uow.tx, 'BusinessAccount', accountId)
  await syncCertificates(uow, accountId, actor)
  const s = await standingOf(uow.tx, accountId, uow.now)
  if (s.status === 'active' && s.shouldHold) {
    await transition(uow, { model: 'BusinessAccount', id: accountId, from: ['active'], to: 'credit_hold', actor, eventType: 'account.credit_hold_set', reason: s.reason, data: { holdReason: s.reason, holdSince: uow.now }, metadata: { automatic: true } })
    return { ...(await standingOf(uow.tx, accountId, uow.now)), changed: true }
  }
  return { ...s, changed: false }
}

export async function refreshAllStandings(uow: UnitOfWork, actor: Actor) {
  const accounts = await uow.tx.businessAccount.findMany({ where: { status: { in: ['active', 'credit_hold'] } }, select: { id: true }, orderBy: { name: 'asc' } })
  let held = 0
  for (const a of accounts) if ((await refreshStanding(uow, actor, a.id)).changed) held += 1
  return { checked: accounts.length, newlyHeld: held }
}

export async function placeCreditHold(uow: UnitOfWork, actor: Actor, input: { businessAccountId: string; reason: string }) {
  const reason = clean(input.reason, 300)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the account is going on hold.', { field: 'reason' })
  const row = await transition(uow, { model: 'BusinessAccount', id: input.businessAccountId, from: ['active'], to: 'credit_hold', actor, eventType: 'account.credit_hold_set', reason, data: { holdReason: reason, holdSince: uow.now, holdWaivedUntil: null } })
  return { id: row.id, status: 'credit_hold' }
}

const WAIVER_DAYS = 7
/** [AP] A manager with credit approval releases a hold. The hold is not re-applied automatically for a week. */
export async function releaseCreditHold(uow: UnitOfWork, actor: Actor, input: { businessAccountId: string; reason: string; approvalRequestId?: string | null }) {
  const reason = clean(input.reason, 300)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the hold is being released.', { field: 'reason' })
  const account = await lockRow<any>(uow.tx, 'BusinessAccount', input.businessAccountId)
  if (account.status !== 'credit_hold' && account.status !== 'on_hold') throw new DomainError(Codes.GUARD_FAILED, `${account.name} is not on credit hold.`)
  const gate = await needApproval(uow, actor, {
    action: 'account.credit_hold_release', targetList: 'BusinessAccount', targetId: account.id, permission: 'canApproveCredit', approvalRequestId: input.approvalRequestId,
    payload: { businessAccountId: account.id, reason }, summary: `Release ${account.name} from credit hold: ${reason}`,
  })
  if (!gate.approved) return waiting(gate.approvalRequestId)
  await transition(uow, { model: 'BusinessAccount', id: account.id, from: ['credit_hold', 'on_hold'], to: 'active', actor, eventType: 'account.credit_hold_released', reason, data: { holdReason: '', holdSince: null, holdWaivedUntil: new Date(uow.now.getTime() + WAIVER_DAYS * DAY) }, metadata: { approvalRequestId: gate.approvalRequestId } })
  return { id: account.id, status: 'active', waivedDays: WAIVER_DAYS }
}

// ── Terms ─────────────────────────────────────────────────────────────────────

export type TermsInput = { businessAccountId: string; name?: string; termsDays?: number; poRequired?: boolean; billingMode?: string; holdAfterOverdueDays?: number | null; creditLimitMinor?: string; status?: 'active' | 'closed'; approvalRequestId?: string | null }

export async function updateAccountTerms(uow: UnitOfWork, actor: Actor, input: TermsInput) {
  const account = await lockRow<any>(uow.tx, 'BusinessAccount', input.businessAccountId)
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) { const name = clean(input.name, 200); if (!name) throw new DomainError(Codes.INVALID_INPUT, 'Enter the account name.', { field: 'name' }); data.name = name }
  if (input.termsDays !== undefined) {
    if (!Number.isInteger(input.termsDays) || input.termsDays < 0 || input.termsDays > 120) throw new DomainError(Codes.INVALID_INPUT, 'Terms must be 0 to 120 days.', { field: 'termsDays' })
    data.termsDays = input.termsDays
  }
  if (input.poRequired !== undefined) data.poRequired = input.poRequired === true
  if (input.billingMode !== undefined) {
    if (!['per_invoice', 'statement_monthly'].includes(input.billingMode)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how the account is billed.', { field: 'billingMode' })
    data.billingMode = input.billingMode
  }
  if (input.holdAfterOverdueDays !== undefined) {
    if (input.holdAfterOverdueDays !== null && (!Number.isInteger(input.holdAfterOverdueDays) || input.holdAfterOverdueDays < 1 || input.holdAfterOverdueDays > 365)) throw new DomainError(Codes.INVALID_INPUT, 'Hold after 1 to 365 days overdue, or leave it blank for never.', { field: 'holdAfterOverdueDays' })
    data.holdAfterOverdueDays = input.holdAfterOverdueDays
  }
  let approvalRequestId: string | null = null
  if (input.creditLimitMinor !== undefined) {
    if (!/^\d{1,12}$/.test(String(input.creditLimitMinor))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the credit limit in dollars.', { field: 'creditLimitMinor' })
    const limit = BigInt(input.creditLimitMinor)
    if (limit > account.creditLimitMinor) {
      const gate = await needApproval(uow, actor, {
        action: 'account.credit_hold_release', targetList: 'BusinessAccount', targetId: account.id, permission: 'canApproveCredit', approvalRequestId: input.approvalRequestId,
        payload: { businessAccountId: account.id, creditLimitMinor: limit.toString() }, summary: `Raise ${account.name}'s credit limit from ${usd(account.creditLimitMinor)} to ${usd(limit)}`,
      })
      if (!gate.approved) return waiting(gate.approvalRequestId)
      approvalRequestId = gate.approvalRequestId
    }
    if (limit !== account.creditLimitMinor) data.creditLimitMinor = limit
    // Tightening the limit ends any waiver from a hold release: the new limit applies to the next invoice.
    if (limit < account.creditLimitMinor && account.holdWaivedUntil) data.holdWaivedUntil = null
  }
  if (input.status !== undefined && input.status !== account.status) {
    if (input.status === 'closed') {
      if (account.openBalanceMinor !== 0n) throw new DomainError(Codes.GUARD_FAILED, `${account.name} still owes ${usd(account.openBalanceMinor)}. Collect it before closing the account.`)
      data.status = 'closed'
    } else if (input.status === 'active' && (account.status === 'prospect' || account.status === 'closed')) data.status = 'active'
    else throw new DomainError(Codes.INVALID_TRANSITION, `${account.name} can't move from ${account.status.replaceAll('_', ' ')} to ${input.status}.`)
  }
  if (!Object.keys(data).length) return { id: account.id, changed: false }
  await uow.tx.businessAccount.update({ where: { id: account.id }, data: { ...data, version: { increment: 1 } } })
  uow.audit({ eventType: 'account.terms_changed', entityType: 'BusinessAccount', entityId: account.id, actorUserId: actorUserId(actor), before: Object.fromEntries(Object.keys(data).map(k => [k, account[k]])), after: data, metadata: approvalRequestId ? { approvalRequestId } : {} })
  return { id: account.id, changed: true }
}

// ── Contacts, approvers, units, certificates ─────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES = ['billing', 'approver', 'driver']

export async function addFleetContact(uow: UnitOfWork, actor: Actor, input: { businessAccountId: string; name: string; email?: string; phone?: string; roles?: string[] }) {
  const { tx } = uow
  await lockRow(tx, 'BusinessAccount', input.businessAccountId)
  const name = clean(input.name, 120)
  if (!name) throw new DomainError(Codes.INVALID_INPUT, 'Enter the contact name.', { field: 'name' })
  const email = clean(input.email, 160).toLowerCase()
  if (email && !EMAIL.test(email)) throw new DomainError(Codes.INVALID_INPUT, 'That email address does not look right.', { field: 'email' })
  const roles = [...new Set((input.roles ?? ['billing']).filter(r => ROLES.includes(r)))]
  const dup = await tx.businessAccountContact.findFirst({ where: { businessAccountId: input.businessAccountId, active: true, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })
  if (dup) throw new DomainError(Codes.DUPLICATE, `${name} is already a contact on this account.`, { existingId: dup.id })
  const row = await tx.businessAccountContact.create({ data: { businessAccountId: input.businessAccountId, name, email, phone: clean(input.phone, 40), roles: roles as never } })
  auditCreate(uow, actor, 'BusinessAccountContact', row.id, 'account_contact.added', { businessAccountId: input.businessAccountId, name, roles })
  return { id: row.id }
}

export async function addFleetApprover(uow: UnitOfWork, actor: Actor, input: { businessAccountId: string; contactId: string; limitMinor: string }) {
  const { tx } = uow
  await lockRow(tx, 'BusinessAccount', input.businessAccountId)
  const contact = await tx.businessAccountContact.findUnique({ where: { id: String(input.contactId ?? '') } })
  if (!contact || contact.businessAccountId !== input.businessAccountId || !contact.active) throw new DomainError(Codes.INVALID_INPUT, 'Choose a contact on this account.', { field: 'contactId' })
  if (!/^\d{1,12}$/.test(String(input.limitMinor ?? ''))) throw new DomainError(Codes.INVALID_INPUT, 'Enter the most this person can approve, in dollars.', { field: 'limitMinor' })
  if (await tx.fleetApprover.findFirst({ where: { businessAccountId: input.businessAccountId, contactId: contact.id, active: true } })) throw new DomainError(Codes.DUPLICATE, `${contact.name} is already an approver.`)
  const last = await tx.fleetApprover.aggregate({ where: { businessAccountId: input.businessAccountId, active: true }, _max: { order: true } })
  const row = await tx.fleetApprover.create({ data: { businessAccountId: input.businessAccountId, contactId: contact.id, limitMinor: BigInt(input.limitMinor), order: (last._max.order ?? 0) + 1 } })
  const roles = Array.isArray(contact.roles) ? (contact.roles as string[]) : []
  if (!roles.includes('approver')) await tx.businessAccountContact.update({ where: { id: contact.id }, data: { roles: [...roles, 'approver'] as never } })
  auditCreate(uow, actor, 'FleetApprover', row.id, 'fleet_approver.added', { businessAccountId: input.businessAccountId, contact: contact.name, limitMinor: input.limitMinor, order: row.order })
  return { id: row.id, order: row.order }
}

export async function removeFleetApprover(uow: UnitOfWork, actor: Actor, input: { approverId: string }) {
  const row = await lockRow<any>(uow.tx, 'FleetApprover', input.approverId)
  if (!row.active) return { id: row.id, already: true }
  await uow.tx.fleetApprover.update({ where: { id: row.id }, data: { active: false } })
  uow.audit({ eventType: 'fleet_approver.removed', entityType: 'FleetApprover', entityId: row.id, actorUserId: actorUserId(actor), before: { active: true }, after: { active: false } })
  return { id: row.id }
}

export const CERT_KINDS = ['resale', 'government', 'nonprofit', 'other'] as const
export async function addExemptionCertificate(uow: UnitOfWork, actor: Actor, input: { businessAccountId: string; kind: string; number: string; issuingState?: string; effectiveFrom?: string | null; expiresAt?: string | null }) {
  const { tx, now } = uow
  await lockRow(tx, 'BusinessAccount', input.businessAccountId)
  if (!(CERT_KINDS as readonly string[]).includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the kind of certificate.', { field: 'kind' })
  const number = clean(input.number, 60)
  if (!number) throw new DomainError(Codes.INVALID_INPUT, 'Enter the certificate number.', { field: 'number' })
  const from = input.effectiveFrom ? String(input.effectiveFrom) : null
  const to = input.expiresAt ? String(input.expiresAt) : null
  if ((from && !DAY_TEXT.test(from)) || (to && !DAY_TEXT.test(to))) throw new DomainError(Codes.INVALID_INPUT, 'Use a date like 2027-12-31.', { field: 'expiresAt' })
  if (from && to && to < from) throw new DomainError(Codes.INVALID_INPUT, 'The certificate cannot expire before it starts.', { field: 'expiresAt' })
  if (await tx.exemptionCertificate.findFirst({ where: { businessAccountId: input.businessAccountId, number, status: { not: 'revoked' } } })) throw new DomainError(Codes.DUPLICATE, `Certificate ${number} is already on file.`)
  const row = await tx.exemptionCertificate.create({ data: { businessAccountId: input.businessAccountId, kind: input.kind, number, issuingState: clean(input.issuingState, 40), effectiveFrom: from ? dateOnly(from) : null, expiresAt: to ? dateOnly(to) : null, status: 'active' } })
  auditCreate(uow, actor, 'ExemptionCertificate', row.id, 'certificate.added', { businessAccountId: input.businessAccountId, kind: input.kind, number, expiresAt: to })
  await syncCertificates(uow, input.businessAccountId, actor)
  const status = (await tx.exemptionCertificate.findUniqueOrThrow({ where: { id: row.id } })).status
  void now
  return { id: row.id, status }
}

export async function revokeExemptionCertificate(uow: UnitOfWork, actor: Actor, input: { certificateId: string; reason: string }) {
  const reason = clean(input.reason, 300)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the certificate is being revoked.', { field: 'reason' })
  const row = await transition(uow, { model: 'ExemptionCertificate', id: input.certificateId, from: ['active', 'expired'], to: 'revoked', actor, eventType: 'certificate.revoked', reason })
  await syncCertificates(uow, row.businessAccountId as string, actor)
  return { id: row.id }
}

export async function saveFleetUnit(uow: UnitOfWork, actor: Actor, input: { businessAccountId: string; vehicleId: string; unitNumber: string; driverName?: string; costCenter?: string }) {
  const { tx } = uow
  await lockRow(tx, 'BusinessAccount', input.businessAccountId)
  const unitNumber = clean(input.unitNumber, 30)
  if (!unitNumber) throw new DomainError(Codes.INVALID_INPUT, 'Enter the unit number.', { field: 'unitNumber' })
  const vehicle = await tx.vehicle.findUnique({ where: { id: String(input.vehicleId ?? '') }, select: { id: true } })
  if (!vehicle) throw new DomainError(Codes.INVALID_INPUT, 'Choose a vehicle.', { field: 'vehicleId' })
  const owned = await tx.vehicleOwnership.findFirst({ where: { vehicleId: vehicle.id, businessAccountId: input.businessAccountId, endedAt: null } })
  if (!owned) throw new DomainError(Codes.GUARD_FAILED, 'That vehicle is not owned by this account. Link it to the account under Vehicles first.')
  const patch = { vehicleId: vehicle.id, driverName: clean(input.driverName, 120), costCenter: clean(input.costCenter, 60) }
  const same = await tx.fleetUnit.findFirst({ where: { businessAccountId: input.businessAccountId, unitNumber } })
  const taken = await tx.fleetUnit.findFirst({ where: { businessAccountId: input.businessAccountId, vehicleId: vehicle.id, NOT: { unitNumber } } })
  if (taken) throw new DomainError(Codes.DUPLICATE, `That vehicle is already unit ${taken.unitNumber}.`)
  if (same) {
    await tx.fleetUnit.update({ where: { id: same.id }, data: patch })
    uow.audit({ eventType: 'fleet_unit.updated', entityType: 'FleetUnit', entityId: same.id, actorUserId: actorUserId(actor), before: { driverName: same.driverName, costCenter: same.costCenter, vehicleId: same.vehicleId }, after: patch })
    return { id: same.id, created: false }
  }
  const row = await tx.fleetUnit.create({ data: { businessAccountId: input.businessAccountId, unitNumber, ...patch } })
  auditCreate(uow, actor, 'FleetUnit', row.id, 'fleet_unit.added', { businessAccountId: input.businessAccountId, unitNumber, vehicleId: vehicle.id })
  return { id: row.id, created: true }
}

/** A link for one contact to see units, approve work within their limit, read statements and pay. Shown once; shown again by making a new one. */
export async function createFleetLink(uow: UnitOfWork, actor: Actor, input: { contactId: string }) {
  const { tx } = uow
  const contact = await lockRow<any>(tx, 'BusinessAccountContact', input.contactId)
  if (!contact.active) throw new DomainError(Codes.GUARD_FAILED, `${contact.name} is no longer an active contact.`)
  await revokeTokensFor(tx, 'BusinessAccountContact', contact.id, uow.now)
  const made = await createAccessToken(uow, { purpose: 'fleet_magic_link', subjectType: 'BusinessAccountContact', subjectId: contact.id, shopId: null, ttlHours: 720, maxUses: 2000 })
  auditCreate(uow, actor, 'BusinessAccountContact', contact.id, 'fleet_link.created', { expiresAt: made.expiresAt.toISOString() })
  return { apiPath: `/api/public/fleet/${made.token}`, expiresAt: made.expiresAt.toISOString() }
}

// ── Opening work for an account ──────────────────────────────────────────────

/** Which account (if any) a new repair order is billed to, refusing it when the account is on hold. Cash customers are never blocked. */
export async function accountForNewOrder(tx: Tx, input: { customerId: string | null; vehicleId: string | null; kind: string; businessAccountId?: string | null; billTo?: string | null }, now: Date) {
  if (input.billTo === 'customer' || input.kind === 'comeback' || input.kind === 'internal') return { businessAccountId: null as string | null, fleetUnitId: null as string | null, kind: input.kind }
  const customer = input.customerId ? await tx.customer.findUnique({ where: { id: input.customerId }, select: { businessAccountId: true } }) : null
  // The vehicle counts too: a unit on an account's fleet is the account's work unless the driver pays (billTo customer).
  const fleetVehicle = !input.businessAccountId && !customer?.businessAccountId && input.vehicleId ? await tx.fleetUnit.findFirst({ where: { vehicleId: input.vehicleId, businessAccount: { status: { not: 'closed' } } }, select: { businessAccountId: true } }) : null
  const accountId = input.businessAccountId || customer?.businessAccountId || fleetVehicle?.businessAccountId || null
  if (!accountId) {
    if (input.kind === 'fleet') throw new DomainError(Codes.INVALID_INPUT, 'Choose the fleet account this work is billed to.', { field: 'businessAccountId' })
    return { businessAccountId: null, fleetUnitId: null, kind: input.kind }
  }
  const standing = await standingOf(tx, accountId, now)
  if (standing.blocked) throw new DomainError(Codes.CREDIT_HOLD, readableBlock(standing), { businessAccountId: accountId, reason: standing.reason })
  const unit = input.vehicleId ? await tx.fleetUnit.findFirst({ where: { businessAccountId: accountId, vehicleId: input.vehicleId }, select: { id: true } }) : null
  return { businessAccountId: accountId, fleetUnitId: unit?.id ?? null, kind: 'fleet' }
}

// ── Approver chain ────────────────────────────────────────────────────────────

/**
 * A fleet authorization: the account's PO rule, who authorized, and whether the job amounts are within that person's limit.
 * Over the limit escalates to the next approver in order whose limit covers it (STATE-MACHINES §15).
 */
export async function checkFleetAuthorization(tx: Tx, ro: { id: string; businessAccountId: string | null }, input: { approverId?: string | null; poNumber?: string | null; jobIds: string[] }) {
  if (!ro.businessAccountId) throw new DomainError(Codes.GUARD_FAILED, 'This repair order is not on a fleet account.')
  const account = await tx.businessAccount.findUniqueOrThrow({ where: { id: ro.businessAccountId } })
  if (account.poRequired && !clean(input.poNumber, 60)) throw new DomainError(Codes.PO_REQUIRED, `${account.name} requires a purchase order number. Enter it before approving.`, { field: 'poNumber' })
  const chain = await tx.fleetApprover.findMany({ where: { businessAccountId: account.id, active: true }, orderBy: { order: 'asc' }, include: { contact: { select: { name: true } } } })
  if (!chain.length) return { approverId: null as string | null, approverName: '' }
  const approver = chain.find(a => a.id === input.approverId)
  if (!approver) throw new DomainError(Codes.INVALID_INPUT, 'Choose which approver on the account authorized this.', { field: 'fleetApproverId' })
  const jobs = await tx.job.findMany({ where: { id: { in: input.jobIds }, repairOrderId: ro.id }, select: { number: true, title: true, totalMinor: true } })
  const over = jobs.filter(j => j.totalMinor > approver.limitMinor)
  if (over.length) {
    const biggest = over.reduce((a, j) => (j.totalMinor > a.totalMinor ? j : a))
    const next = chain.find(a => a.order > approver.order && a.limitMinor >= biggest.totalMinor)
    const who = approver.contact?.name ?? 'This approver'
    const message = next
      ? `Job ${biggest.number}, ${biggest.title}, is ${usd(biggest.totalMinor)}, above ${who}'s ${usd(approver.limitMinor)} limit. It goes to ${next.contact?.name} (limit ${usd(next.limitMinor)}).`
      : `Job ${biggest.number}, ${biggest.title}, is ${usd(biggest.totalMinor)}, above every approver's limit on ${account.name}. The account owner must authorize it with the shop.`
    throw new DomainError(Codes.GUARD_FAILED, message, { jobNumber: biggest.number, amountMinor: biggest.totalMinor.toString(), limitMinor: approver.limitMinor.toString(), escalateTo: next ? { approverId: next.id, name: next.contact?.name ?? '', limitMinor: next.limitMinor.toString() } : null })
  }
  return { approverId: approver.id, approverName: approver.contact?.name ?? '' }
}

// ── Statements ────────────────────────────────────────────────────────────────

const csvCell = (value: unknown) => {
  const s = String(value ?? '')
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',')
const dollars = (minor: bigint) => `${minor < 0n ? '-' : ''}${(minor < 0n ? -minor : minor) / 100n}.${((minor < 0n ? -minor : minor) % 100n).toString().padStart(2, '0')}`

export type StatementInput = { businessAccountId: string; periodStart: string; periodEnd: string }

/** The last full calendar month before `today`. */
export function lastFullMonth(today: string) {
  const [y, m] = today.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 2, 1))
  const last = new Date(Date.UTC(y, m - 1, 0))
  return { periodStart: first.toISOString().slice(0, 10), periodEnd: last.toISOString().slice(0, 10) }
}

/** Close a period for an account: opening, charges, payments, credits, closing and the ageing at the end. One statement per account and start date. */
export async function generateStatement(uow: UnitOfWork, actor: Actor, input: StatementInput, options: { skipEmpty?: boolean } = {}) {
  const { tx, now } = uow
  const start = String(input.periodStart ?? ''), end = String(input.periodEnd ?? '')
  if (!DAY_TEXT.test(start) || !DAY_TEXT.test(end)) throw new DomainError(Codes.INVALID_INPUT, 'Use dates like 2026-10-31.', { field: 'periodStart' })
  if (end < start) throw new DomainError(Codes.INVALID_INPUT, 'The period cannot end before it starts.', { field: 'periodEnd' })
  const today = await orgToday(tx, now)
  if (end > today) throw new DomainError(Codes.GUARD_FAILED, 'The period has not ended yet. Pick an end date up to today.', { field: 'periodEnd' })
  const account = await lockRow<any>(tx, 'BusinessAccount', input.businessAccountId)
  const same = await tx.statement.findFirst({ where: { businessAccountId: account.id, periodStart: dateOnly(start) } })
  if (same) return { id: same.id, reference: same.reference, closingMinor: same.closingMinor.toString(), already: true, empty: false }
  const clash = await tx.statement.findFirst({ where: { businessAccountId: account.id, periodStart: { lte: dateOnly(end) }, periodEnd: { gte: dateOnly(start) } } })
  if (clash) throw new DomainError(Codes.GUARD_FAILED, `${clash.reference} already covers part of that period.`, { existingId: clash.id })

  const zone = await orgZone(tx)
  const invoices = await tx.invoice.findMany({ where: { businessAccountId: account.id }, select: { id: true, invoiceDate: true, dueDate: true, totalMinor: true } })
  const allocations = await tx.paymentAllocation.findMany({ where: { invoice: { businessAccountId: account.id } }, select: { invoiceId: true, amountMinor: true, at: true } })
  const credits = await tx.creditMemo.findMany({ where: { invoice: { businessAccountId: account.id }, status: 'issued' }, select: { invoiceId: true, totalMinor: true, issuedAt: true } })
  const day = (d: Date | null) => (d ? zonedDate(zone, d) : '0000-00-00')
  const invDay = (d: Date | null) => iso(d) ?? '9999-12-31'
  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n)
  const before = (d: string) => d < start
  const within = (d: string) => d >= start && d <= end
  const opening = sum(invoices.filter(i => before(invDay(i.invoiceDate))).map(i => i.totalMinor)) - sum(allocations.filter(a => before(day(a.at))).map(a => a.amountMinor)) - sum(credits.filter(c => before(day(c.issuedAt))).map(c => c.totalMinor))
  const inPeriod = invoices.filter(i => within(invDay(i.invoiceDate)))
  const charges = sum(inPeriod.map(i => i.totalMinor))
  const payments = sum(allocations.filter(a => within(day(a.at))).map(a => a.amountMinor))
  const creditsTotal = sum(credits.filter(c => within(day(c.issuedAt))).map(c => c.totalMinor))
  if (options.skipEmpty && opening === 0n && charges === 0n && payments === 0n && creditsTotal === 0n) return { id: null, reference: '', closingMinor: '0', already: false, empty: true }
  const aging: Record<string, bigint> = Object.fromEntries(AGING.map(k => [k, 0n]))
  for (const inv of invoices.filter(i => invDay(i.invoiceDate) <= end)) {
    const paid = sum(allocations.filter(a => a.invoiceId === inv.id && day(a.at) <= end).map(a => a.amountMinor))
    const credited = sum(credits.filter(c => c.invoiceId === inv.id && day(c.issuedAt) <= end).map(c => c.totalMinor))
    const balance = inv.totalMinor - paid - credited
    if (balance > 0n) aging[bucketOf(daysBetween(iso(inv.dueDate) ?? invDay(inv.invoiceDate), end))] += balance
  }
  const reference = await nextReference(tx, 'STM', now, 5)
  const row = await tx.statement.create({
    data: {
      businessAccountId: account.id, periodStart: dateOnly(start), periodEnd: dateOnly(end), reference, openingMinor: opening, chargesMinor: charges, paymentsMinor: payments, creditsMinor: creditsTotal,
      closingMinor: opening + charges - payments - creditsTotal, aging: Object.fromEntries(Object.entries(aging).map(([k, v]) => [k, v.toString()])) as never,
    },
  })
  await tx.invoice.updateMany({ where: { id: { in: inPeriod.map(i => i.id) }, statementId: null }, data: { statementId: row.id } })
  auditCreate(uow, actor, 'Statement', row.id, 'statement.generated', { reference, businessAccountId: account.id, periodStart: start, periodEnd: end, openingMinor: opening, chargesMinor: charges, paymentsMinor: payments, creditsMinor: creditsTotal, closingMinor: row.closingMinor, invoices: inPeriod.length })
  return { id: row.id, reference, closingMinor: row.closingMinor.toString(), already: false, empty: false }
}

const AGING_LABEL: Record<string, string> = { current: 'Current', days1to30: '1 to 30 days late', days31to60: '31 to 60 days late', days61to90: '61 to 90 days late', days90plus: 'Over 90 days late' }

async function statementCsvLines(tx: Tx, statementId: string) {
  const s = await tx.statement.findUniqueOrThrow({ where: { id: statementId }, include: { businessAccount: { select: { name: true, accountNumber: true, termsDays: true } } } })
  const invoices = await tx.invoice.findMany({ where: { statementId }, orderBy: { invoiceDate: 'asc' }, select: { invoiceNumber: true, invoiceDate: true, dueDate: true, poNumber: true, totalMinor: true, paidMinor: true, creditedMinor: true, balanceMinor: true, repairOrder: { select: { roNumber: true } } } })
  const aging = (s.aging ?? {}) as Record<string, string>
  const lines = [
    csvRow(['Statement', s.reference]), csvRow(['Account', `${s.businessAccount?.name ?? ''} (${s.businessAccount?.accountNumber ?? ''})`]),
    csvRow(['Period', `${iso(s.periodStart)} to ${iso(s.periodEnd)}`]), csvRow(['Terms', s.businessAccount?.termsDays ? `Net ${s.businessAccount.termsDays}` : 'Due on receipt']),
    csvRow(['Opening balance', dollars(s.openingMinor)]), csvRow(['Charges', dollars(s.chargesMinor)]), csvRow(['Payments', dollars(-s.paymentsMinor)]),
    csvRow(['Credits', dollars(-s.creditsMinor)]), csvRow(['Closing balance', dollars(s.closingMinor)]), '',
    csvRow(['Owed at period end']), ...AGING.map(k => csvRow([AGING_LABEL[k], dollars(BigInt(aging[k] ?? '0'))])), '',
    csvRow(['Invoice', 'Repair order', 'Invoice date', 'Due', 'PO', 'Total', 'Paid', 'Credited', 'Balance today']),
    ...invoices.map(i => csvRow([i.invoiceNumber, i.repairOrder?.roNumber ?? '', iso(i.invoiceDate), iso(i.dueDate), i.poNumber, dollars(i.totalMinor), dollars(i.paidMinor), dollars(i.creditedMinor), dollars(i.balanceMinor)])),
  ]
  return { lines, reference: s.reference }
}

/** The statement as a file. Exporting stamps who and when the first time; exporting again gives the same file. */
export async function exportStatement(uow: UnitOfWork, actor: Actor, input: { statementId: string }) {
  const { tx, now } = uow
  const s = await lockRow<any>(tx, 'Statement', input.statementId)
  const { lines, reference } = await statementCsvLines(tx, s.id)
  if (!s.exportedAt) {
    await tx.statement.update({ where: { id: s.id }, data: { exportedAt: now, exportedById: actorUserId(actor) } })
    uow.audit({ eventType: 'statement.exported', entityType: 'Statement', entityId: s.id, actorUserId: actorUserId(actor), after: { reference } })
  }
  return { id: s.id, filename: `statement-${reference}.csv`, csv: `${lines.join('\n')}\n` }
}

/** Every monthly-billed account's statement for a period: made if missing, then one combined file. Nothing is emailed. */
export async function exportAllStatements(uow: UnitOfWork, actor: Actor, input: { periodStart: string; periodEnd: string }) {
  const accounts = await uow.tx.businessAccount.findMany({ where: { billingMode: 'statement_monthly', status: { in: ['active', 'credit_hold'] } }, select: { id: true }, orderBy: { name: 'asc' } })
  const blocks: string[] = []
  let made = 0
  for (const a of accounts) {
    const gen = await generateStatement(uow, actor, { businessAccountId: a.id, periodStart: input.periodStart, periodEnd: input.periodEnd }, { skipEmpty: true })
    if (gen.empty || !gen.id) continue
    if (!gen.already) made += 1
    blocks.push((await exportStatement(uow, actor, { statementId: gen.id })).csv)
  }
  if (!blocks.length) throw new DomainError(Codes.GUARD_FAILED, 'No monthly account has activity in that period.')
  return { filename: `statements-${input.periodStart}-to-${input.periodEnd}.csv`, csv: blocks.join('\n'), statements: blocks.length, created: made }
}
