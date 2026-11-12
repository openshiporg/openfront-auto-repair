import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { marketingConsentFor } from './communications'
import { recommendationBoard, reminderBoard } from './followUps'
import type { UnitOfWork } from './unitOfWork'
import type { Tx } from './db'

/*
 * Campaigns are an audience list with Export CSV and Copy message. The app never sends anything.
 * The audience is worked out when asked for. Consent is checked again at the moment of export or copy, inside the same
 * transaction, so a STOP that lands after the list was shown still keeps that person off the file. The database refuses a
 * recipient row without a written grant as a last guard.
 */

export const CAMPAIGN_KINDS = ['reminders', 'declined_work', 'reviews', 'promo'] as const
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number]
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function saveCampaign(uow: UnitOfWork, actor: Actor, input: { campaignId?: string | null; shopId: string; name: string; kind: CampaignKind; messageText: string; status?: 'draft' | 'active' | 'ended' }) {
  const { tx } = uow
  const name = clean(input.name, 120), messageText = clean(input.messageText, 1600)
  if (!name || !messageText) throw new DomainError(Codes.INVALID_INPUT, 'A campaign needs a name and its wording.')
  if (!CAMPAIGN_KINDS.includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose who the campaign is for.', { field: 'kind' })
  const status = input.status && ['draft', 'active', 'ended'].includes(input.status) ? input.status : 'draft'
  if (input.campaignId) {
    const c = await lockRow<any>(tx, 'Campaign', input.campaignId)
    const row = await tx.campaign.update({ where: { id: c.id }, data: { name, kind: input.kind, messageText, status, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Campaign', row.id, 'campaign.updated', { kind: input.kind, status })
    return { id: row.id }
  }
  const shop = await tx.shop.findUnique({ where: { id: input.shopId }, select: { id: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Shop not found.')
  const row = await tx.campaign.create({ data: { shopId: shop.id, name, kind: input.kind, messageText, status, audienceRule: {}, createdById: actorUserId(actor) } })
  auditCreate(uow, actor, 'Campaign', row.id, 'campaign.created', { kind: input.kind })
  return { id: row.id }
}

export type AudienceEntry = { customerId: string; name: string; detail: string; shopId: string }

/** Who the campaign is for right now, before any consent check. */
export async function audienceFor(tx: Tx, campaign: { kind: string; shopId: string | null }, now: Date): Promise<AudienceEntry[]> {
  const shopIds = campaign.shopId ? [campaign.shopId] : ('all' as const)
  const seen = new Map<string, AudienceEntry>()
  const add = (e: AudienceEntry) => { if (!seen.has(e.customerId)) seen.set(e.customerId, e) }
  if (campaign.kind === 'reminders') {
    for (const r of await reminderBoard(tx, { shopIds, now, limit: 1000 })) if (r.state === 'due') add({ customerId: r.customer.id, name: r.customer.displayName ?? '', detail: `${r.vehicle.year ?? ''} ${r.vehicle.make ?? ''} ${r.vehicle.model ?? ''}: ${r.kind} due ${r.dueDate}`.trim(), shopId: r.shop.id ?? '' })
  } else if (campaign.kind === 'declined_work') {
    for (const r of await recommendationBoard(tx, { shopIds, now, soonDays: 0 })) if (r.state === 'due' && r.customer) add({ customerId: r.customer.id, name: r.customer.displayName ?? '', detail: `${r.title} (${r.vehicle?.make ?? ''} ${r.vehicle?.model ?? ''})`.trim(), shopId: r.shop?.id ?? '' })
  } else if (campaign.kind === 'reviews') {
    const since = new Date(now.getTime() - 30 * 86_400_000)
    const ros = await tx.repairOrder.findMany({ where: { status: { in: ['invoiced', 'closed'] }, customerId: { not: null }, updatedAt: { gte: since }, ...(shopIds === 'all' ? {} : { shopId: { in: shopIds } }) }, select: { id: true, roNumber: true, shopId: true, customer: { select: { id: true, displayName: true } } }, take: 500 })
    const asked = new Set((await tx.reviewRequest.findMany({ where: { repairOrderId: { in: ros.map(r => r.id) } }, select: { repairOrderId: true } })).map(r => r.repairOrderId))
    for (const r of ros) if (!asked.has(r.id) && r.customer) add({ customerId: r.customer.id, name: r.customer.displayName ?? '', detail: `Repair order ${r.roNumber}`, shopId: r.shopId! })
  } else {
    const customers = await tx.customer.findMany({ where: { status: 'active', ...(shopIds === 'all' ? {} : { homeShopId: { in: shopIds } }) }, select: { id: true, displayName: true, homeShopId: true }, take: 2000 })
    for (const c of customers) add({ customerId: c.id, name: c.displayName ?? '', detail: '', shopId: c.homeShopId ?? '' })
  }
  return [...seen.values()]
}

export type Decision = { entry: AudienceEntry; ok: true; channel: 'sms' | 'email'; contactId: string; consentId: string | null; value: string } | { entry: AudienceEntry; ok: false; reason: string }

/** Text first when the customer has written consent for it, otherwise email. Says why when neither is allowed. */
export async function decideRecipient(tx: Tx, entry: AudienceEntry): Promise<Decision> {
  const reasons: string[] = []
  for (const channel of ['sms', 'email'] as const) {
    const r = await marketingConsentFor(tx, entry.customerId, channel)
    if (r.ok) {
      const contact = await tx.customerContact.findUnique({ where: { id: r.contactId }, select: { value: true } })
      return { entry, ok: true, channel, contactId: r.contactId, consentId: r.consentId, value: contact?.value ?? '' }
    }
    reasons.push(`${channel === 'sms' ? 'Text' : 'Email'}: ${r.reason}`)
  }
  return { entry, ok: false, reason: reasons.join(' ') }
}

/** The list as staff see it before exporting: who would be included now, and who is held back and why. */
export async function previewCampaign(tx: Tx, campaignId: string, now: Date) {
  const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } })
  const decisions: Decision[] = []
  for (const e of await audienceFor(tx, campaign, now)) decisions.push(await decideRecipient(tx, e))
  return {
    campaign: { id: campaign.id, name: campaign.name, kind: campaign.kind, status: campaign.status, messageText: campaign.messageText },
    included: decisions.filter((d): d is Extract<Decision, { ok: true }> => d.ok).map(d => ({ customerId: d.entry.customerId, name: d.entry.name, detail: d.entry.detail, channel: d.channel })),
    held: decisions.filter((d): d is Extract<Decision, { ok: false }> => !d.ok).map(d => ({ customerId: d.entry.customerId, name: d.entry.name, reason: d.reason })),
  }
}

const csvCell = (v: unknown) => {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // a spreadsheet must not run a customer's text as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Export the audience as a CSV. Consent is read fresh here; everyone without it is left out and listed with the reason. */
export async function exportCampaign(uow: UnitOfWork, actor: Actor, input: { campaignId: string }) {
  const { tx, now } = uow
  const campaign = await lockRow<any>(tx, 'Campaign', input.campaignId)
  if (campaign.status === 'ended') throw new DomainError(Codes.INVALID_TRANSITION, 'This campaign has ended.', { currentStatus: campaign.status })
  const decisions: Decision[] = []
  for (const e of await audienceFor(tx, campaign, now)) decisions.push(await decideRecipient(tx, e))
  const ok = decisions.filter((d): d is Extract<Decision, { ok: true }> => d.ok)
  const held = decisions.filter((d): d is Extract<Decision, { ok: false }> => !d.ok)
  if (!ok.length) {
    throw new DomainError(Codes.CONSENT_BLOCKED, held.length ? `No one on this list can be contacted for marketing. ${held[0].entry.name}: ${held[0].reason}` : 'No one is on this list right now.', { count: held.length })
  }
  const exportRow = await tx.campaignExport.create({ data: { campaignId: campaign.id, recipientCount: ok.length, excludedCount: held.length, excluded: held.map(h => ({ customerId: h.entry.customerId, name: h.entry.name, reason: h.reason })) as never, exportedById: actorUserId(actor), at: now } })
  for (const d of ok) {
    await tx.campaignRecipient.create({ data: { exportId: exportRow.id, campaignId: campaign.id, shopId: d.entry.shopId || campaign.shopId, customerId: d.entry.customerId, contactId: d.contactId, channel: d.channel, consentId: d.consentId, at: now } })
  }
  auditCreate(uow, actor, 'CampaignExport', exportRow.id, 'campaign.exported', { campaignId: campaign.id, recipients: ok.length, excluded: held.length })
  const lines = [['Name', 'How to reach', 'Phone or email', 'Detail', 'Message'].join(',')]
  for (const d of ok) lines.push([d.entry.name, d.channel === 'sms' ? 'Text' : 'Email', d.value, d.entry.detail, campaign.messageText].map(csvCell).join(','))
  return { exportId: exportRow.id, csv: lines.join('\r\n') + '\r\n', recipients: ok.length, excluded: held.map(h => ({ name: h.entry.name, reason: h.reason })) }
}

/** Copy the wording for one customer. Refused, with the reason, when they have no written marketing consent. */
export async function copyCampaignMessage(uow: UnitOfWork, actor: Actor, input: { campaignId: string; customerId: string; channel?: 'sms' | 'email' }) {
  const { tx } = uow
  const campaign = await tx.campaign.findUniqueOrThrow({ where: { id: input.campaignId } })
  const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, displayName: true, homeShopId: true } })
  if (!customer) throw new DomainError(Codes.NOT_FOUND, 'Customer not found.')
  const d = await decideRecipient(tx, { customerId: customer.id, name: customer.displayName ?? '', detail: '', shopId: customer.homeShopId ?? campaign.shopId ?? '' })
  if (!d.ok || (input.channel && d.channel !== input.channel)) {
    throw new DomainError(Codes.CONSENT_BLOCKED, `Marketing is not allowed for ${customer.displayName}: ${d.ok ? 'no consent for that channel.' : d.reason}`, { customerId: customer.id })
  }
  auditCreate(uow, actor, 'Campaign', campaign.id, 'campaign.message_copied', { customerId: customer.id, channel: d.channel })
  return { text: campaign.messageText.replaceAll('{name}', (customer.displayName ?? '').split(' ')[0]), channel: d.channel }
}

export async function askForReview(uow: UnitOfWork, actor: Actor, input: { repairOrderId: string; channel: string; note?: string | null }) {
  if (!['call', 'text', 'email', 'in_person'].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how you asked.', { field: 'channel' })
  const { tx, now } = uow
  const ro = await tx.repairOrder.findUnique({ where: { id: input.repairOrderId }, select: { id: true, shopId: true, customerId: true } })
  if (!ro?.customerId || !ro.shopId) throw new DomainError(Codes.NOT_FOUND, 'Repair order not found.')
  const key = ro.id
  const existing = await tx.reviewRequest.findUnique({ where: { repairOrderKey: key }, select: { id: true } })
  if (existing) return { id: existing.id, changed: false }
  const row = await tx.reviewRequest.create({ data: { shopId: ro.shopId, repairOrderId: ro.id, repairOrderKey: key, customerId: ro.customerId, channel: input.channel, note: clean(input.note, 300), askedAt: now, askedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'ReviewRequest', row.id, 'review.asked', { repairOrderId: ro.id, channel: input.channel })
  return { id: row.id, changed: true }
}
