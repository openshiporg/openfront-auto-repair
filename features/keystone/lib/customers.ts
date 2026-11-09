import { advisoryLock, type Tx } from './db'
import { keyedContactHash } from './canonical'
import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { nextReference } from './sequence'
import type { UnitOfWork } from './unitOfWork'

/*
 * Customers, contacts and consent (SCHEMA §3.1-3.5, DOMAIN I-V4).
 * - Contact values are normalised (E.164 phone numbers, lower-case email addresses) and looked up
 *   by hash, so staff can find a customer by phone number without reading other personal data.
 * - Consent is an append-only event log. The latest event per channel and purpose decides.
 * - Marketing by text or voice needs written consent (47 CFR 64.1200(f)(9)).
 */

export type ContactKind = 'mobile' | 'landline' | 'email'
export type ContactInput = { kind: ContactKind; value: string; label?: string | null; isPrimary?: boolean }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeContact(kind: ContactKind, value: unknown): string {
  const text = String(value ?? '').trim()
  if (kind === 'email') {
    const email = text.toLowerCase()
    if (!EMAIL.test(email) || email.length > 254) throw new DomainError(Codes.INVALID_INPUT, `${text.slice(0, 60)} is not an email address.`, { field: 'value' })
    return email
  }
  const digits = text.replace(/[^\d+]/g, '')
  let e164 = ''
  if (/^\+\d{8,15}$/.test(digits)) e164 = digits
  else if (/^\d{10}$/.test(digits)) e164 = `+1${digits}`
  else if (/^1\d{10}$/.test(digits)) e164 = `+${digits}`
  if (!e164) throw new DomainError(Codes.INVALID_INPUT, `${text.slice(0, 30)} is not a phone number. Use 10 digits or +country code.`, { field: 'value' })
  return e164
}

/** Lookup hash: phone kinds share one namespace so a mobile and a landline with the same number match. */
export const contactHash = (kind: ContactKind, normalized: string, key?: string) => keyedContactHash(kind === 'email' ? 'email' : 'phone', normalized, key ?? process.env.AUTO_SECRET_KEY)

export function displayNameOf(input: { kind?: string | null; firstName?: string | null; lastName?: string | null; companyName?: string | null }) {
  const person = [input.firstName, input.lastName].map(s => (s ?? '').trim()).filter(Boolean).join(' ')
  return (input.kind === 'business' ? input.companyName?.trim() || person : person || input.companyName?.trim()) || 'Unnamed customer'
}

const maskPhone = (e164: string) => `•••-•••-${e164.slice(-4)}`
const maskEmail = (email: string) => `${email[0]}•••@${email.split('@')[1]}`
export const contactLabel = (kind: ContactKind, value: string) => (kind === 'email' ? maskEmail(value) : maskPhone(value))

/** Active customers that already hold any of these contact values. */
export async function findByContacts(tx: Tx, contacts: { kind: ContactKind; normalized: string }[], excludeCustomerId?: string) {
  if (!contacts.length) return []
  const hashes = contacts.map(c => contactHash(c.kind, c.normalized))
  return tx.customerContact.findMany({
    where: { valueHash: { in: hashes }, status: 'active', customer: { status: 'active', ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}) } },
    select: { customerId: true, kind: true, label: true },
  })
}

export type CustomerInput = {
  id?: string | null
  expectedVersion?: number | null
  kind?: 'person' | 'business'
  firstName?: string | null
  lastName?: string | null
  companyName?: string | null
  homeShopId?: string | null
  preferredChannel?: 'sms' | 'email' | 'phone'
  notes?: string | null
  contacts?: ContactInput[]
  /** Create even when a contact matches another customer (a shared family phone, for example). */
  allowDuplicate?: boolean
  /** Fixed id for a new customer (seed and imports); ignored on update. */
  createId?: string | null
}

/** Trimmed text ('' when empty: Keystone text columns are non-null). */
const clean = (value: unknown, max = 120) => {
  const text = String(value ?? '').trim()
  if (text.length > max) throw new DomainError(Codes.INVALID_INPUT, `Keep this under ${max} characters.`)
  return text
}

export async function upsertCustomer(uow: UnitOfWork, actor: Actor, input: CustomerInput) {
  const { tx } = uow
  const kind = input.kind ?? 'person'
  const firstName = clean(input.firstName)
  const lastName = clean(input.lastName)
  const companyName = clean(input.companyName, 200)
  if (kind === 'person' && !firstName && !lastName) throw new DomainError(Codes.INVALID_INPUT, 'Enter a first or last name.', { field: 'lastName' })
  if (kind === 'business' && !companyName) throw new DomainError(Codes.INVALID_INPUT, 'Enter the company name.', { field: 'companyName' })
  const contacts = (input.contacts ?? []).map(c => ({ ...c, normalized: normalizeContact(c.kind, c.value) }))
  const seen = new Set<string>()
  for (const c of contacts) {
    const key = contactHash(c.kind, c.normalized)
    if (seen.has(key)) throw new DomainError(Codes.INVALID_INPUT, 'The same contact is listed twice.', { field: 'contacts' })
    seen.add(key)
  }
  // One lock per contact value, so two counters adding the same phone at once can't both miss the other.
  for (const key of [...seen].sort()) await advisoryLock(tx, `contact:${key}`)
  if (!input.allowDuplicate) {
    const clash = await findByContacts(tx, contacts, input.id ?? undefined)
    if (clash.length) throw new DomainError(Codes.DUPLICATE, 'A customer with this phone number or email already exists. Open that customer, or confirm this is a different person.', { existingId: clash[0].customerId, field: 'contacts' })
  }
  const displayName = displayNameOf({ kind, firstName, lastName, companyName })
  const fields = {
    kind, firstName, lastName, companyName, displayName,
    homeShopId: input.homeShopId ?? null,
    preferredChannel: input.preferredChannel ?? 'sms',
    notes: clean(input.notes, 4000),
  }

  let customerId: string
  if (input.id) {
    const row = await lockRow<Record<string, any>>(tx, 'Customer', input.id)
    if (row.status !== 'active') throw new DomainError(Codes.INVALID_TRANSITION, `This customer is ${row.status}.`, { currentStatus: row.status })
    if (input.expectedVersion !== undefined && input.expectedVersion !== null && input.expectedVersion !== row.version) throw new DomainError(Codes.STALE_STATE, 'This customer changed since you loaded it. Reload and try again.', { currentVersion: row.version })
    await tx.customer.update({ where: { id: input.id }, data: { ...fields, version: { increment: 1 } } })
    uow.audit({ eventType: 'customer.updated', entityType: 'Customer', entityId: input.id, actorUserId: actorUserId(actor), before: { displayName: row.displayName, homeShopId: row.homeShopId, preferredChannel: row.preferredChannel }, after: { displayName, homeShopId: fields.homeShopId, preferredChannel: fields.preferredChannel } })
    customerId = input.id
  } else {
    const created = await tx.customer.create({ data: { ...(input.createId ? { id: input.createId } : {}), ...fields, status: 'active' } })
    auditCreate(uow, actor, 'Customer', created.id, 'customer.created', { displayName, kind, homeShopId: fields.homeShopId, contacts: contacts.length })
    customerId = created.id
  }
  const added = []
  for (const c of contacts) added.push(await addContactRow(uow, actor, customerId, c))
  return { id: customerId, displayName, contactIds: added.map(a => a.id) }
}

async function addContactRow(uow: UnitOfWork, actor: Actor, customerId: string, c: ContactInput & { normalized: string }) {
  const { tx } = uow
  const valueHash = contactHash(c.kind, c.normalized)
  const existing = await tx.customerContact.findFirst({ where: { customerId, kind: c.kind, valueHash } })
  if (existing) return existing
  if (c.isPrimary) await tx.customerContact.updateMany({ where: { customerId, kind: c.kind === 'email' ? 'email' : { in: ['mobile', 'landline'] }, isPrimary: true }, data: { isPrimary: false } })
  const hasPrimary = await tx.customerContact.count({ where: { customerId, isPrimary: true, kind: c.kind === 'email' ? 'email' : { in: ['mobile', 'landline'] } } })
  const row = await tx.customerContact.create({
    data: { customerId, kind: c.kind, value: c.normalized, valueHash, label: c.label?.trim() || contactLabel(c.kind, c.normalized), isPrimary: c.isPrimary ?? hasPrimary === 0, status: 'active' },
  })
  // The audit trail records that a contact was added, never the value itself.
  auditCreate(uow, actor, 'CustomerContact', row.id, 'customer.contact_added', { customerId, kind: c.kind, label: row.label })
  return row
}

export async function addContact(uow: UnitOfWork, actor: Actor, customerId: string, contact: ContactInput, allowDuplicate = false) {
  const normalized = normalizeContact(contact.kind, contact.value)
  await advisoryLock(uow.tx, `contact:${contactHash(contact.kind, normalized)}`)
  const customer = await uow.tx.customer.findUnique({ where: { id: customerId }, select: { status: true } })
  if (!customer) throw new DomainError(Codes.NOT_FOUND, 'Customer not found.')
  if (customer.status !== 'active') throw new DomainError(Codes.INVALID_TRANSITION, `This customer is ${customer.status}.`)
  if (!allowDuplicate) {
    const clash = await findByContacts(uow.tx, [{ kind: contact.kind, normalized }], customerId)
    if (clash.length) throw new DomainError(Codes.DUPLICATE, 'Another customer already has this contact.', { existingId: clash[0].customerId, field: 'value' })
  }
  return addContactRow(uow, actor, customerId, { ...contact, normalized })
}

export type ConsentInput = {
  contactId: string
  channel: 'sms' | 'email' | 'voice'
  purpose: 'transactional' | 'marketing' | 'all'
  action: 'granted' | 'revoked'
  method: 'web_form' | 'in_person_form' | 'keyword_reply' | 'staff_recorded' | 'import' | 'classifier_review'
  writtenConsent?: boolean
  evidence?: Record<string, unknown>
}

const CHANNEL_FOR: Record<ContactKind, ConsentInput['channel'][]> = { mobile: ['sms', 'voice'], landline: ['voice'], email: ['email'] }

export async function recordConsent(uow: UnitOfWork, actor: Actor, input: ConsentInput) {
  const { tx, now } = uow
  const contact = await tx.customerContact.findUnique({ where: { id: input.contactId }, select: { id: true, kind: true, customerId: true } })
  if (!contact) throw new DomainError(Codes.NOT_FOUND, 'Contact not found.')
  if (!CHANNEL_FOR[contact.kind as ContactKind].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, `A ${contact.kind} contact can't take ${input.channel} consent.`, { field: 'channel' })
  if (!['transactional', 'marketing', 'all'].includes(input.purpose) || !['granted', 'revoked'].includes(input.action)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a purpose and whether consent was granted or revoked.')
  const marketing = input.purpose === 'marketing' || input.purpose === 'all'
  if (input.action === 'granted' && marketing && input.channel !== 'email' && !input.writtenConsent) {
    throw new DomainError(Codes.CONSENT_BLOCKED, 'Marketing texts and calls need written consent (a signed form or a web form with the consent wording). Record how it was given.', { field: 'writtenConsent' })
  }
  if (input.method === 'classifier_review' && input.action === 'granted') throw new DomainError(Codes.CONSENT_BLOCKED, 'Consent can be revoked from a message, but never granted by a classifier.')
  // "The latest event wins", so events on one contact need a strict order even inside one command (a grant then a STOP).
  const previous = await tx.contactConsent.findFirst({ where: { contactId: contact.id }, orderBy: { at: 'desc' }, select: { at: true } })
  const at = previous?.at && previous.at.getTime() >= now.getTime() ? new Date(previous.at.getTime() + 1) : now
  const row = await tx.contactConsent.create({
    data: {
      contactId: contact.id, channel: input.channel, purpose: input.purpose, action: input.action, method: input.method,
      writtenConsent: input.writtenConsent ?? false,
      evidence: { ...(input.evidence ?? {}), recordedBy: actorUserId(actor) } as never,
      recordedById: actorUserId(actor), at,
    },
  })
  auditCreate(uow, actor, 'ContactConsent', row.id, `consent.${input.action}`, { contactId: contact.id, customerId: contact.customerId, channel: input.channel, purpose: input.purpose, method: input.method })
  return { id: row.id }
}

/** The consent that applies now for each channel and purpose (the latest event wins; "all" covers both purposes). */
export function currentConsent(events: { channel: string; purpose: string; action: string; at: Date | string }[]) {
  const sorted = [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const state: Record<string, 'granted' | 'revoked' | 'unknown'> = {}
  for (const channel of ['sms', 'email', 'voice']) for (const purpose of ['transactional', 'marketing']) state[`${channel}:${purpose}`] = 'unknown'
  for (const e of sorted) {
    const purposes = e.purpose === 'all' ? ['transactional', 'marketing'] : [e.purpose]
    for (const p of purposes) state[`${e.channel}:${p}`] = e.action as 'granted' | 'revoked'
  }
  return state
}

/** Fleet and commercial account (basic, Phase 1). */
export async function createBusinessAccount(uow: UnitOfWork, actor: Actor, input: { name: string; termsDays?: number; poRequired?: boolean; creditLimitMinor?: bigint; billingMode?: 'per_invoice' | 'statement_monthly'; createId?: string | null }) {
  const name = clean(input.name, 200)
  if (!name) throw new DomainError(Codes.INVALID_INPUT, 'Enter the account name.', { field: 'name' })
  const termsDays = input.termsDays ?? 0
  if (!Number.isInteger(termsDays) || termsDays < 0 || termsDays > 120) throw new DomainError(Codes.INVALID_INPUT, 'Terms must be 0 to 120 days.', { field: 'termsDays' })
  const accountNumber = await nextReference(uow.tx, 'ACCT', uow.now, 5)
  const row = await uow.tx.businessAccount.create({ data: { ...(input.createId ? { id: input.createId } : {}), name, accountNumber, termsDays, poRequired: input.poRequired ?? false, creditLimitMinor: input.creditLimitMinor ?? 0n, billingMode: input.billingMode ?? 'per_invoice', status: 'active' } })
  auditCreate(uow, actor, 'BusinessAccount', row.id, 'business_account.created', { name, accountNumber, termsDays })
  return { id: row.id, accountNumber }
}
