import { advisoryLock } from './db'
import { canonicalJson, sha256 } from './canonical'
import { auditCreate, transition } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { nextShopReference } from './sequence'
import { shopLaw } from './policy'
import { recordOdometer } from './vehicles'
import type { UnitOfWork } from './unitOfWork'

/*
 * Check-in (DOMAIN §4.1, SCHEMA §4.6). At the counter or on the staff tablet:
 * - odometer in (when the jurisdiction requires it; CA 16 CCR §3356 puts it on the invoice);
 * - the customer's concerns in their own words;
 * - the signed work order, with the jurisdiction's required wording (CA: written estimate and
 *   authorization notice, the replaced-parts offer);
 * - a promised time;
 * - and a warning for any open recall, in red when NHTSA says do not drive or park outside.
 * The repair order opens from the check-in in Phase 2.
 */

export type SignatureInput = { method: 'in_person' | 'electronic_link'; signerName: string; strokes?: number[][][] | null; typedAcknowledgement?: boolean }

export type CheckInInput = {
  shopId: string
  appointmentId?: string | null
  customerId: string
  vehicleId: string
  odometer?: { value: number; unit?: 'mi' | 'km'; overrideReason?: string | null } | null
  concerns: string[]
  promisedAt?: Date | null
  waiter?: boolean
  keyTag?: string | null
  contactPreference?: 'sms' | 'email' | 'phone'
  transportationNeed?: 'none' | 'shuttle' | 'loaner' | 'rideshare'
  valuablesNote?: string | null
  signature?: SignatureInput | null
}

/** The work-order wording the customer signs: the shop's details, the concerns, and the jurisdiction's notices for the work order. */
export function workOrderText(input: { shopName: string; legalName: string; registrations: Record<string, unknown>; concerns: string[]; notices: { key: string; text: string; where: string }[]; replacedPartsOfferText?: string | null; promisedAt?: Date | null; odometer?: number | null; timeZone: string }) {
  const lines = [
    `${input.legalName} (${input.shopName})`,
    input.registrations?.barArd ? `Automotive Repair Dealer registration ${String(input.registrations.barArd)}` : null,
    '',
    'You asked us to look at:',
    ...input.concerns.map((c, i) => `${i + 1}. ${c}`),
    '',
    input.odometer !== null && input.odometer !== undefined ? `Odometer in: ${input.odometer.toLocaleString('en-US')}` : null,
    input.promisedAt ? `Promised: ${input.promisedAt.toLocaleString('en-US', { timeZone: input.timeZone, dateStyle: 'medium', timeStyle: 'short' })}` : null,
    '',
    ...input.notices.filter(n => n.where === 'work_order').map(n => n.text),
    input.replacedPartsOfferText ?? null,
  ]
  return lines.filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const MAX_STROKES = 400

export function checkSignature(signature: SignatureInput | null | undefined) {
  if (!signature) return null
  const signerName = String(signature.signerName ?? '').trim()
  if (!signerName || signerName.length > 120) throw new DomainError(Codes.SIGNATURE_REQUIRED, 'Enter the name of the person signing.', { field: 'signerName' })
  const strokes = Array.isArray(signature.strokes) ? signature.strokes : []
  if (strokes.length > MAX_STROKES || strokes.some(s => !Array.isArray(s) || s.length > 2000 || s.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))) {
    throw new DomainError(Codes.INVALID_INPUT, 'The signature could not be read. Clear it and sign again.', { field: 'signature' })
  }
  const points = strokes.reduce((n, s) => n + s.length, 0)
  if (points < 8 && !signature.typedAcknowledgement) throw new DomainError(Codes.SIGNATURE_REQUIRED, 'Ask the customer to sign in the box.', { field: 'signature' })
  if (!['in_person', 'electronic_link'].includes(signature.method)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how the work order was signed.')
  return { method: signature.method, signerName, strokes: strokes.map(s => s.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])), typedAcknowledgement: Boolean(signature.typedAcknowledgement) }
}

export async function checkInVehicle(uow: UnitOfWork, actor: Actor, input: CheckInInput) {
  const { tx, now } = uow
  const { shop, law, shopPolicy } = await shopLaw(tx, input.shopId)
  const full = await tx.shop.findUniqueOrThrow({ where: { id: input.shopId }, select: { code: true, name: true, legalName: true, registrations: true, timeZone: true } })
  const concerns = (input.concerns ?? []).map(c => String(c).trim()).filter(Boolean).map(c => c.slice(0, 500))
  if (!concerns.length) throw new DomainError(Codes.INVALID_INPUT, "Write down at least one concern in the customer's words.", { field: 'concerns' })
  if (concerns.length > 20) throw new DomainError(Codes.INVALID_INPUT, 'Twenty concerns at most. Group related ones.', { field: 'concerns' })
  if (law.requireOdometerIn && !input.odometer) throw new DomainError(Codes.ODOMETER_REQUIRED, 'Record the odometer reading. This state requires it on the invoice.', { field: 'odometer' })
  const promisedRequired = shopPolicy?.promisedTimeRequired ?? true
  if (promisedRequired && !input.promisedAt) throw new DomainError(Codes.INVALID_INPUT, 'Give the customer a promised time.', { field: 'promisedAt' })
  if (input.promisedAt && input.promisedAt.getTime() <= now.getTime()) throw new DomainError(Codes.INVALID_INPUT, 'The promised time must be later than now.', { field: 'promisedAt' })
  const signature = checkSignature(input.signature)
  if (law.requireSignedWorkOrder && !signature) throw new DomainError(Codes.SIGNATURE_REQUIRED, 'The customer must sign the work order before work starts.', { field: 'signature' })

  const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, status: true } })
  if (!customer || customer.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'Customer not found.')
  const vehicle = await tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { id: true, status: true } })
  if (!vehicle || vehicle.status !== 'active') throw new DomainError(Codes.NOT_FOUND, 'Vehicle not found.')
  await advisoryLock(tx, `checkin:${input.vehicleId}`)
  const open = await tx.checkIn.findFirst({ where: { vehicleId: input.vehicleId, shopId: input.shopId, at: { gt: new Date(now.getTime() - 12 * 3_600_000) } }, select: { reference: true } })
  if (open) throw new DomainError(Codes.DUPLICATE, `This vehicle was checked in ${open.reference} in the last 12 hours.`)

  const reference = await nextShopReference(tx, 'CI', shop.code, now)
  const notices = Array.isArray(law.requiredNotices) ? (law.requiredNotices as { key: string; text: string; where: string }[]) : []
  const text = workOrderText({
    shopName: full.name, legalName: full.legalName, registrations: (full.registrations ?? {}) as Record<string, unknown>, concerns, notices,
    replacedPartsOfferText: law.replacedPartsOfferRequired ? law.replacedPartsOfferText : null, promisedAt: input.promisedAt ?? null, odometer: input.odometer?.value ?? null, timeZone: full.timeZone,
  })

  const latestRecall = await tx.recallCheck.findFirst({ where: { vehicleId: input.vehicleId }, orderBy: { checkedAt: 'desc' }, select: { id: true, campaignCount: true, parkItAny: true, checkedAt: true, campaigns: true } })
  const recallWarning = latestRecall && latestRecall.campaignCount! > 0
    ? { recallCheckId: latestRecall.id, count: latestRecall.campaignCount, doNotDrive: latestRecall.parkItAny, checkedAt: latestRecall.checkedAt, campaigns: ((latestRecall.campaigns ?? []) as any[]).slice(0, 10).map(c => ({ number: c.nhtsaCampaignNumber, component: c.component, parkIt: c.parkIt, parkOutSide: c.parkOutSide })) }
    : null

  const row = await tx.checkIn.create({
    data: {
      shopId: input.shopId, reference, ...(input.appointmentId ? { appointment: { connect: { id: input.appointmentId } } } : {}), customerId: input.customerId, vehicleId: input.vehicleId,
      concerns: concerns as never, keyTag: input.keyTag?.trim().slice(0, 20) ?? '', waiter: input.waiter ?? false, promisedAt: input.promisedAt ?? null,
      contactPreference: input.contactPreference ?? 'sms', transportationNeed: input.transportationNeed ?? 'none',
      signatureMethod: signature?.method ?? 'in_person', signerName: signature?.signerName ?? '', signature: (signature ?? undefined) as never,
      signatureHash: signature ? sha256(canonicalJson(signature)) : '', workOrderText: text, workOrderHash: sha256(text), signedAt: signature ? now : null,
      valuablesNote: input.valuablesNote?.trim().slice(0, 500) ?? '', recallWarning: (recallWarning ?? undefined) as never, jurisdictionPolicyVersionId: law.id, at: now, byId: actorUserId(actor),
    },
  })
  let odometer: Awaited<ReturnType<typeof recordOdometer>> | null = null
  if (input.odometer) {
    odometer = await recordOdometer(uow, actor, { vehicleId: input.vehicleId, value: input.odometer.value, unit: input.odometer.unit, source: 'ro_in', overrideReason: input.odometer.overrideReason, checkInId: row.id })
    await tx.checkIn.update({ where: { id: row.id }, data: { odometerInId: odometer.id } })
  }
  if (input.appointmentId) {
    await transition(uow, {
      model: 'Appointment', id: input.appointmentId, from: ['requested', 'confirmed'], to: 'arrived', actor, eventType: 'appointment.arrived',
      guard: (a: Record<string, any>) => {
        if (a.shopId !== input.shopId) throw new DomainError(Codes.INVALID_INPUT, 'The appointment is at another shop.')
        if (a.vehicleId && a.vehicleId !== input.vehicleId) throw new DomainError(Codes.INVALID_INPUT, 'The appointment is for another vehicle.')
      },
      data: { customerId: input.customerId, vehicleId: input.vehicleId },
    })
  }
  auditCreate(uow, actor, 'CheckIn', row.id, 'vehicle.checked_in', { reference, shopId: input.shopId, vehicleId: input.vehicleId, appointmentId: input.appointmentId ?? null, workOrderHash: sha256(text), signed: Boolean(signature), odometerAnomaly: odometer?.anomaly ?? null, recallWarning: Boolean(recallWarning), lawVersion: law.id })
  uow.emit({ topic: 'vehicle.checked_in', aggregateType: 'CheckIn', aggregateId: row.id, payload: { reference, shopId: input.shopId }, dedupeKey: `checkin:${row.id}` })
  return { id: row.id, reference, recallWarning, odometerAnomaly: odometer?.anomaly ?? null }
}
