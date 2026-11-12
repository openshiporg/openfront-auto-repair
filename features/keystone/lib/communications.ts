import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { currentConsent, recordConsent } from './customers'
import type { UnitOfWork } from './unitOfWork'
import type { Tx } from './db'

/*
 * Messages and calls are a RECORD (owner rule, 11-11): staff log what they sent or heard, or copy prepared wording.
 * Nothing in this file sends anything. An inbound STOP-family reply revokes consent, idempotently, with no reply.
 */

export const STOP_WORDS = ['stop', 'quit', 'end', 'revoke', 'opt out', 'optout', 'cancel', 'unsubscribe', 'stopall']

/** True when the whole reply is a STOP-family keyword (case-insensitive, surrounding punctuation ignored). */
export function stopKeyword(text: unknown): string | null {
  const t = String(text ?? '').trim().toLowerCase().replace(/^[\s"'.!]+|[\s"'.!]+$/g, '').replace(/\s+/g, ' ')
  return STOP_WORDS.includes(t) ? t : null
}

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

async function threadFor(uow: UnitOfWork, input: { shopId: string; customerId: string; vehicleId?: string | null; repairOrderId?: string | null }) {
  const { tx, now } = uow
  const threadKey = `${input.shopId}:${input.customerId}:${input.repairOrderId ?? 'general'}`
  const existing = await tx.messageThread.findUnique({ where: { threadKey } })
  if (existing) return existing
  return tx.messageThread.create({ data: { threadKey, shopId: input.shopId, customerId: input.customerId, vehicleId: input.vehicleId ?? null, repairOrderId: input.repairOrderId ?? null, lastMessageAt: now } })
}

async function context(tx: Tx, input: { customerId: string; repairOrderId?: string | null; shopId?: string | null }) {
  const customer = await tx.customer.findUnique({ where: { id: input.customerId }, select: { id: true, homeShopId: true } })
  if (!customer) throw new DomainError(Codes.NOT_FOUND, 'Customer not found.')
  let shopId = input.shopId ?? customer.homeShopId ?? null
  let vehicleId: string | null = null
  if (input.repairOrderId) {
    const ro = await tx.repairOrder.findUnique({ where: { id: input.repairOrderId }, select: { id: true, shopId: true, customerId: true, vehicleId: true } })
    if (!ro || ro.customerId !== customer.id) throw new DomainError(Codes.INVALID_INPUT, 'That repair order is not this customer\'s.', { field: 'repairOrderId' })
    shopId = ro.shopId
    vehicleId = ro.vehicleId
  }
  if (!shopId) throw new DomainError(Codes.INVALID_INPUT, 'Choose the shop this conversation belongs to.', { field: 'shopId' })
  return { shopId, vehicleId }
}

export type LogMessageInput = { customerId: string; repairOrderId?: string | null; shopId?: string | null; contactId?: string | null; direction: 'inbound' | 'outbound'; channel: 'sms' | 'email'; purpose?: 'transactional' | 'marketing'; body: string; templateCode?: string | null }

/** Staff record a text or email they sent or received themselves. */
export async function logMessage(uow: UnitOfWork, actor: Actor, input: LogMessageInput) {
  const { tx, now } = uow
  if (!['inbound', 'outbound'].includes(input.direction) || !['sms', 'email'].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, 'Choose whether it was a text or an email, and whether it came in or went out.')
  const purpose = input.purpose === 'marketing' ? 'marketing' : 'transactional'
  const body = clean(input.body, 4000)
  if (!body) throw new DomainError(Codes.INVALID_INPUT, 'Write down what the message said.', { field: 'body' })
  const ctx = await context(tx, input)
  let contactId: string | null = null
  if (input.contactId) {
    const c = await tx.customerContact.findUnique({ where: { id: input.contactId }, select: { id: true, customerId: true, kind: true } })
    if (!c || c.customerId !== input.customerId) throw new DomainError(Codes.INVALID_INPUT, 'That contact belongs to another customer.', { field: 'contactId' })
    contactId = c.id
  }
  // Marketing the shop sends itself still needs the customer's written consent on file; the record refuses without it.
  if (input.direction === 'outbound' && purpose === 'marketing') await requireMarketingConsent(tx, input.customerId, input.channel, contactId)
  const keyword = input.direction === 'inbound' && input.channel === 'sms' ? stopKeyword(body) : null
  let consentId: string | null = null
  if (keyword) {
    // A customer's STOP reply that staff write down takes effect the same way as one that arrives from a provider.
    const targets = contactId ? [contactId] : (await tx.customerContact.findMany({ where: { customerId: input.customerId, status: 'active', kind: { in: ['mobile', 'landline'] } }, select: { id: true } })).map(c => c.id)
    for (const id of targets) {
      const events = await tx.contactConsent.findMany({ where: { contactId: id, channel: 'sms' }, orderBy: { at: 'asc' } })
      const state = currentConsent(events.map(e => ({ channel: e.channel, purpose: e.purpose, action: e.action, at: e.at })))
      if (state['sms:transactional'] !== 'revoked' || state['sms:marketing'] !== 'revoked') consentId = (await recordConsent(uow, actor, { contactId: id, channel: 'sms', purpose: 'all', action: 'revoked', method: 'keyword_reply', evidence: { keyword: keyword.toUpperCase(), loggedBy: 'staff' } })).id
    }
  }
  const thread = await threadFor(uow, { ...ctx, customerId: input.customerId, repairOrderId: input.repairOrderId })
  const template = input.templateCode ? await tx.messageTemplate.findUnique({ where: { code: input.templateCode }, select: { version: true } }) : null
  const row = await tx.message.create({
    data: {
      threadId: thread.id, shopId: ctx.shopId, customerId: input.customerId, contactId, repairOrderId: input.repairOrderId ?? null, direction: input.direction, channel: input.channel, purpose,
      source: 'staff_log', keyword: keyword ?? '', consentId, templateCode: input.templateCode ?? '', templateVersion: template?.version ?? 0, body, recordedById: actorUserId(actor), at: now,
    },
  })
  await tx.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: now, version: { increment: 1 } } })
  auditCreate(uow, actor, 'Message', row.id, 'message.logged', { customerId: input.customerId, direction: input.direction, channel: input.channel, purpose, repairOrderId: input.repairOrderId ?? null })
  return { id: row.id, threadId: thread.id, revoked: Boolean(consentId) }
}

export type LogCallInput = { customerId: string; repairOrderId?: string | null; shopId?: string | null; contactId?: string | null; direction: 'inbound' | 'outbound'; outcome: 'reached' | 'left_voicemail' | 'no_answer' | 'wrong_number'; note?: string | null; minutes?: number | null }

export async function logCall(uow: UnitOfWork, actor: Actor, input: LogCallInput) {
  const { tx, now } = uow
  if (!['inbound', 'outbound'].includes(input.direction)) throw new DomainError(Codes.INVALID_INPUT, 'Choose whether the call came in or went out.')
  if (!['reached', 'left_voicemail', 'no_answer', 'wrong_number'].includes(input.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Choose how the call went.', { field: 'outcome' })
  const minutes = input.minutes === null || input.minutes === undefined ? null : Number(input.minutes)
  if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 600)) throw new DomainError(Codes.INVALID_INPUT, 'Minutes must be a whole number up to 600.', { field: 'minutes' })
  const ctx = await context(tx, input)
  const thread = await threadFor(uow, { ...ctx, customerId: input.customerId, repairOrderId: input.repairOrderId })
  const row = await tx.callRecord.create({
    data: { threadId: thread.id, shopId: ctx.shopId, customerId: input.customerId, contactId: input.contactId ?? null, repairOrderId: input.repairOrderId ?? null, direction: input.direction, outcome: input.outcome, note: clean(input.note, 2000), minutes, recordedById: actorUserId(actor), at: now },
  })
  await tx.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: now, version: { increment: 1 } } })
  auditCreate(uow, actor, 'CallRecord', row.id, 'call.logged', { customerId: input.customerId, direction: input.direction, outcome: input.outcome, repairOrderId: input.repairOrderId ?? null })
  return { id: row.id, threadId: thread.id }
}

/** The latest consent decides. Throws CONSENT_BLOCKED with the reason when marketing is not allowed on this channel. */
export async function marketingConsentFor(tx: Tx, customerId: string, channel: 'sms' | 'email', contactId?: string | null) {
  const kinds = channel === 'sms' ? ['mobile'] : ['email']
  const contacts = await tx.customerContact.findMany({ where: { customerId, status: 'active', kind: { in: kinds }, ...(contactId ? { id: contactId } : {}) }, include: { consents: { orderBy: { at: 'asc' } } }, orderBy: { isPrimary: 'desc' } })
  if (!contacts.length) return { ok: false as const, reason: channel === 'sms' ? 'No mobile number on file.' : 'No email address on file.' }
  let reason = 'No marketing consent on file.'
  for (const c of contacts) {
    const state = currentConsent(c.consents.map(e => ({ channel: e.channel, purpose: e.purpose, action: e.action, at: e.at })))
    if (state[`${channel}:marketing`] === 'revoked') { reason = channel === 'sms' ? 'Replied STOP or withdrew consent.' : 'Withdrew marketing consent.'; continue }
    if (state[`${channel}:marketing`] !== 'granted') continue
    // Marketing needs WRITTEN consent on every channel: the latest grant must be the written kind.
    const grants = c.consents.filter(e => e.action === 'granted' && (e.purpose === 'marketing' || e.purpose === 'all') && e.channel === channel)
    const latest = grants[grants.length - 1]
    if (!latest?.writtenConsent) { reason = `Marketing ${channel === 'sms' ? 'texts' : 'email'} need written consent, and none is on file.`; continue }
    return { ok: true as const, contactId: c.id, consentId: latest?.id ?? null }
  }
  return { ok: false as const, reason }
}

export async function requireMarketingConsent(tx: Tx, customerId: string, channel: 'sms' | 'email', contactId?: string | null) {
  const r = await marketingConsentFor(tx, customerId, channel, contactId)
  if (!r.ok) throw new DomainError(Codes.CONSENT_BLOCKED, `Marketing is not allowed for this customer: ${r.reason}`, { field: 'purpose' })
  return r
}

/**
 * A reply received from a provider webhook or logged by staff. Records the message once (providerMessageId), and a STOP-family
 * keyword revokes text consent on that number, once. No confirmation is sent; other text goes to the review list.
 */
export async function recordInbound(uow: UnitOfWork, actor: Actor, input: { fromHash: string; body: string; providerMessageId: string; shopId?: string | null }) {
  const { tx, now } = uow
  const dup = await tx.message.findUnique({ where: { providerMessageId: input.providerMessageId }, select: { id: true } })
  if (dup) return { id: dup.id, replay: true, revoked: false }
  const contacts = await tx.customerContact.findMany({ where: { valueHash: input.fromHash, status: 'active', kind: { in: ['mobile', 'landline'] } }, include: { customer: { select: { id: true, homeShopId: true, status: true } } } })
  const live = contacts.filter(c => c.customer?.status === 'active')
  const keyword = stopKeyword(input.body)
  const body = clean(input.body, 4000)
  if (!live.length) return { id: null, replay: false, revoked: false, unmatched: true }
  let first: string | null = null
  let revoked = false
  for (const c of live) {
    const shopId = c.customer!.homeShopId ?? input.shopId
    if (!shopId) continue
    const thread = await threadFor(uow, { shopId, customerId: c.customerId!, repairOrderId: null })
    let consentId: string | null = null
    if (keyword) {
      const events = await tx.contactConsent.findMany({ where: { contactId: c.id, channel: 'sms' }, orderBy: { at: 'asc' } })
      const state = currentConsent(events.map(e => ({ channel: e.channel, purpose: e.purpose, action: e.action, at: e.at })))
      if (state['sms:transactional'] !== 'revoked' || state['sms:marketing'] !== 'revoked') {
        consentId = (await recordConsent(uow, actor, { contactId: c.id, channel: 'sms', purpose: 'all', action: 'revoked', method: 'keyword_reply', evidence: { keyword: keyword.toUpperCase(), providerMessageId: input.providerMessageId } })).id
        revoked = true
      }
    }
    const pid: string = first ? `${input.providerMessageId}#${c.id}` : input.providerMessageId
    const row = await tx.message.create({
      data: {
        threadId: thread.id, shopId, customerId: c.customerId!, contactId: c.id, direction: 'inbound', channel: 'sms', purpose: 'transactional', source: 'inbound_webhook', body,
        providerMessageId: pid, keyword: keyword ?? '', reviewState: keyword ? 'none' : 'needs_review', consentId, at: now,
      },
    })
    first ??= row.id
    await tx.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: now, unreadCount: { increment: 1 }, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Message', row.id, keyword ? 'message.stop_received' : 'message.received', { customerId: c.customerId, keyword: keyword ?? null })
  }
  return { id: first, replay: false, revoked }
}

export async function markThreadRead(uow: UnitOfWork, actor: Actor, input: { threadId: string }) {
  const thread = await lockRow<any>(uow.tx, 'MessageThread', input.threadId)
  if (thread.unreadCount > 0) await uow.tx.messageThread.update({ where: { id: thread.id }, data: { unreadCount: 0, version: { increment: 1 } } })
  await uow.tx.message.updateMany({ where: { threadId: thread.id, reviewState: 'needs_review' }, data: { reviewState: 'reviewed', reviewedAt: uow.now, reviewedById: actorUserId(actor) } })
  return { id: thread.id }
}

export async function saveTemplate(uow: UnitOfWork, actor: Actor, input: { code: string; name: string; purpose: 'transactional' | 'marketing'; body: string }) {
  const { tx } = uow
  const code = clean(input.code, 60).toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const name = clean(input.name, 120)
  const body = clean(input.body, 1600)
  if (!code || !name || !body) throw new DomainError(Codes.INVALID_INPUT, 'A template needs a name and its wording.')
  if (!['transactional', 'marketing'].includes(input.purpose)) throw new DomainError(Codes.INVALID_INPUT, 'Choose transactional or marketing.', { field: 'purpose' })
  const existing = await tx.messageTemplate.findUnique({ where: { code } })
  if (existing) {
    if (existing.body === body && existing.name === name && existing.purpose === input.purpose) return { id: existing.id, version: existing.version, changed: false }
    const row = await tx.messageTemplate.update({ where: { id: existing.id }, data: { name, body, purpose: input.purpose, version: { increment: 1 }, updatedById: actorUserId(actor) } })
    auditCreate(uow, actor, 'MessageTemplate', row.id, 'template.updated', { code, version: row.version })
    return { id: row.id, version: row.version, changed: true }
  }
  const row = await tx.messageTemplate.create({ data: { code, name, body, purpose: input.purpose, updatedById: actorUserId(actor) } })
  auditCreate(uow, actor, 'MessageTemplate', row.id, 'template.created', { code })
  return { id: row.id, version: 1, changed: true }
}
