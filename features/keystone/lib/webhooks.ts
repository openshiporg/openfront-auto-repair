import { createHmac, randomBytes } from 'node:crypto'
import type { Db, Tx } from './db'
import type { AuditInput } from './audit'
import { Codes, DomainError } from './errors'
import { actorUserId, type Actor } from './actor'
import { auditCreate } from './cas'
import { getSecret, putSecret } from './secretBox'
import type { UnitOfWork } from './unitOfWork'

/*
 * Webhooks out (INTEGRATIONS §10), ported from openfront features/webhooks/{delivery-policy,outbox,subscriptions,webhook-plugin}.
 * The only way anything leaves this system for a shop's own tools. A change that commits writes one WebhookEvent per
 * subscribed endpoint inside the same transaction (the outbox); delivery happens after commit, never inside it.
 * Payloads carry ids and the event name only (no customer details); the receiver reads the record it needs.
 * Deliveries are signed (HMAC-SHA256, x-openfront-signature), retried with backoff, dead-lettered after the budget, and replayable.
 * No scheduler exists: deliveries are attempted right after commit, and anything due is retried by the next command or by a person pressing retry.
 */

export const WEBHOOK_DELIVERY_MAX_ATTEMPTS = 12
export const WEBHOOK_DELIVERY_TIMEOUT_MS = 15_000
export const WEBHOOK_DELIVERY_LEASE_MS = 2 * 60_000

export const webhookDeliveryLease = (now = Date.now()) => new Date(now + WEBHOOK_DELIVERY_LEASE_MS)
export function nextWebhookAttempt(attempts: number, now = Date.now()): Date | null {
  if (attempts >= WEBHOOK_DELIVERY_MAX_ATTEMPTS) return null
  return new Date(now + Math.min(Math.pow(2, attempts) * 60_000, 24 * 60 * 60 * 1000))
}

/** The topics a shop can subscribe to (INTEGRATIONS §10) and the internal audit events that raise each. */
export const WEBHOOK_TOPICS: Record<string, string[]> = {
  'repair_order.updated': ['ro.created', 'ro.checked_in', 'ro.in_service', 'ro.on_hold', 'ro.resumed', 'repair_order.invoiced', 'repair_order.closed'],
  'job.authorized': ['job.authorized'],
  'job.declined': ['job.declined'],
  'estimate.sent': ['estimate.sent'],
  'invoice.finalized': ['invoice.finalized'],
  'payment.succeeded': ['payment.succeeded', 'payment.received'],
  'appointment.created': ['appointment.requested'],
  'parts.received': ['receipt.recorded'],
  'inspection.sent': ['inspection.sent'],
  'comeback.opened': ['comeback.opened'],
}
const TOPIC_OF = new Map(Object.entries(WEBHOOK_TOPICS).flatMap(([topic, events]) => events.map(e => [e, topic] as const)))
export const topicOf = (eventType: string) => TOPIC_OF.get(eventType) ?? null

export function normalizeWebhookUrl(value: unknown): string {
  let url: URL
  try { url = new URL(String(value || '').trim()) } catch { throw new DomainError(Codes.INVALID_INPUT, 'The address must be a full web address.', { field: 'url' }) }
  const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new DomainError(Codes.INVALID_INPUT, 'The address must start with https://', { field: 'url' })
  if (url.username || url.password || url.hash) throw new DomainError(Codes.INVALID_INPUT, 'The address cannot carry a password or a #fragment.', { field: 'url' })
  return url.toString()
}

export function normalizeWebhookEvents(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) throw new DomainError(Codes.INVALID_INPUT, 'Choose at least one event.', { field: 'events' })
  const events = [...new Set(value.map(v => String(v ?? '').trim()))].sort()
  const bad = events.find(e => e !== '*' && !(e in WEBHOOK_TOPICS))
  if (bad !== undefined) throw new DomainError(Codes.INVALID_INPUT, `${bad.slice(0, 40) || 'An empty name'} is not an event this system sends.`, { field: 'events' })
  return events
}

export const sign = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

// ── Endpoints (commands) ──────────────────────────────────────────────────────

export async function createEndpoint(uow: UnitOfWork, actor: Actor, input: { shopId?: string | null; url: string; events: string[] }) {
  const url = normalizeWebhookUrl(input.url)
  const events = normalizeWebhookEvents(input.events)
  const row = await uow.tx.webhookEndpoint.create({ data: { shopId: input.shopId ?? null, url, events: events as never, isActive: true } })
  const secret = randomBytes(32).toString('hex')
  const secretRef = `webhook.${row.id}`
  await putSecret(uow.tx, secretRef, secret, uow.now)
  await uow.tx.webhookEndpoint.update({ where: { id: row.id }, data: { secretRef } })
  auditCreate(uow, actor, 'WebhookEndpoint', row.id, 'webhook.endpoint_created', { url, events, shopId: input.shopId ?? null })
  // Shown once. The signing key is never readable again, only rotated.
  return { id: row.id, url, events, signingSecret: secret }
}

export async function changeEndpoint(uow: UnitOfWork, actor: Actor, input: { endpointId: string; url?: string | null; events?: string[] | null; isActive?: boolean | null; rotateSecret?: boolean | null }) {
  const { tx } = uow
  const row = await tx.webhookEndpoint.findUnique({ where: { id: input.endpointId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const data: Record<string, unknown> = {}
  if (input.url != null) data.url = normalizeWebhookUrl(input.url)
  if (input.events != null) data.events = normalizeWebhookEvents(input.events)
  if (input.isActive != null) { data.isActive = input.isActive; if (input.isActive) data.failureCount = 0 }
  let signingSecret: string | undefined
  if (input.rotateSecret) { signingSecret = randomBytes(32).toString('hex'); await putSecret(tx, row.secretRef || `webhook.${row.id}`, signingSecret, uow.now); data.secretRef = row.secretRef || `webhook.${row.id}` }
  await tx.webhookEndpoint.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } as never })
  uow.audit({ eventType: 'webhook.endpoint_changed', entityType: 'WebhookEndpoint', entityId: row.id, actorUserId: actorUserId(actor), before: { url: row.url, events: row.events, isActive: row.isActive }, after: { ...data, rotated: !!signingSecret } })
  return { id: row.id, ...(signingSecret ? { signingSecret } : {}) }
}

/** Put a failed or dead-lettered delivery back in the queue. */
export async function replayEvent(uow: UnitOfWork, actor: Actor, input: { eventId: string }) {
  const row = await uow.tx.webhookEvent.findUnique({ where: { id: input.eventId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  await uow.tx.webhookEvent.update({ where: { id: row.id }, data: { delivered: false, deliveryAttempts: 0, deadLetteredAt: null, nextAttempt: new Date(uow.now.getTime() - 1000), responseStatus: null, responseBody: '' } })
  uow.audit({ eventType: 'webhook.event_replayed', entityType: 'WebhookEvent', entityId: row.id, actorUserId: actorUserId(actor), metadata: { topic: row.eventType } })
  return { id: row.id }
}

// ── Outbox: fed by the audit events a transaction commits ─────────────────────────

async function shopOfEntity(tx: Tx, entityType: string, entityId: string): Promise<string | null> {
  const t = tx as any
  try {
    switch (entityType) {
      case 'RepairOrder': case 'Invoice': case 'Payment': case 'Appointment': case 'ComebackCase': return (await t[entityType[0].toLowerCase() + entityType.slice(1)].findUnique({ where: { id: entityId }, select: { shopId: true } }))?.shopId ?? null
      case 'Job': return (await t.job.findUnique({ where: { id: entityId }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId ?? null
      case 'EstimateVersion': return (await t.estimateVersion.findUnique({ where: { id: entityId }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId ?? null
      case 'Inspection': return (await t.inspection.findUnique({ where: { id: entityId }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId ?? null
      case 'Receipt': return (await t.receipt.findUnique({ where: { id: entityId }, select: { order: { select: { shopId: true } } } }))?.order?.shopId ?? null
    }
  } catch { /* an unknown shape only means org-wide endpoints get it */ }
  return null
}

/** Called inside the transaction with the audit events it is about to commit. Writes rows only; no network. */
export async function enqueueFromAudits(tx: Tx, audits: AuditInput[], now: Date): Promise<number> {
  const raised = audits.filter(a => topicOf(a.eventType))
  if (!raised.length) return 0
  const endpoints = await tx.webhookEndpoint.findMany({ where: { isActive: true }, select: { id: true, shopId: true, events: true } })
  if (!endpoints.length) return 0
  let count = 0
  for (const a of raised) {
    const topic = topicOf(a.eventType)!
    const subscribed = endpoints.filter(e => Array.isArray(e.events) && ((e.events as string[]).includes(topic) || (e.events as string[]).includes('*')))
    if (!subscribed.length) continue
    const shopId = await shopOfEntity(tx, a.entityType, a.entityId)
    for (const e of subscribed) {
      if (e.shopId && e.shopId !== shopId) continue
      const payload = { event: topic, occurredAt: now.toISOString(), resource: { type: a.entityType, id: a.entityId }, shopId, source: a.eventType }
      await tx.webhookEvent.create({ data: { eventType: topic, resourceType: a.entityType, resourceId: a.entityId, payload: payload as never, endpointId: e.id, nextAttempt: new Date(now.getTime() - 1000) } })
      count += 1
    }
  }
  return count
}

// ── Delivery: after commit ───────────────────────────────────────────────────────────

export type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ status: number; text(): Promise<string> }>
export const transport: { fetch: Fetcher } = { fetch: (url, init) => fetch(url, init) as unknown as ReturnType<Fetcher> }

/** Deliver what is due, once each. Leases a row (moves its next attempt) before sending so two callers don't both send it. */
export async function deliverDue(db: Db, options: { now?: Date; limit?: number } = {}) {
  const now = options.now ?? new Date()
  const due = await db.webhookEvent.findMany({ where: { delivered: false, deadLetteredAt: null, nextAttempt: { lte: now }, endpoint: { isActive: true } }, orderBy: { createdAt: 'asc' }, take: options.limit ?? 25, include: { endpoint: true } })
  let delivered = 0, failed = 0
  for (const ev of due) {
    const leased = await db.webhookEvent.updateMany({ where: { id: ev.id, delivered: false, nextAttempt: ev.nextAttempt }, data: { nextAttempt: webhookDeliveryLease(now.getTime()) } })
    if (leased.count !== 1 || !ev.endpoint) continue
    const secret = ev.endpoint.secretRef ? await db.$transaction(tx => getSecret(tx, ev.endpoint!.secretRef)) : null
    const body = JSON.stringify({ ...(ev.payload as object), deliveryId: ev.id })
    let status = 0, text = ''
    try {
      const abort = new AbortController()
      const timer = setTimeout(() => abort.abort(), WEBHOOK_DELIVERY_TIMEOUT_MS)
      try {
        const res = await transport.fetch(ev.endpoint.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'openfront-auto-repair-webhooks', 'x-openfront-topic': ev.eventType, 'x-openfront-delivery-id': ev.id, ...(secret ? { 'x-openfront-signature': sign(secret, body) } : {}) }, body, signal: abort.signal })
        status = res.status
        text = (await res.text()).slice(0, 500)
      } finally { clearTimeout(timer) }
    } catch (e) { text = e instanceof Error ? e.message.slice(0, 200) : 'Request failed' }
    const ok = status >= 200 && status < 300
    const attempts = (ev.deliveryAttempts ?? 0) + 1
    if (ok) {
      await db.webhookEvent.update({ where: { id: ev.id }, data: { delivered: true, deliveryAttempts: attempts, lastAttempt: now, nextAttempt: null, responseStatus: status, responseBody: text } })
      await db.webhookEndpoint.update({ where: { id: ev.endpoint.id }, data: { lastTriggered: now, failureCount: 0 } })
      delivered += 1
    } else {
      const next = nextWebhookAttempt(attempts, now.getTime())
      await db.webhookEvent.update({ where: { id: ev.id }, data: { deliveryAttempts: attempts, lastAttempt: now, nextAttempt: next, deadLetteredAt: next ? null : now, responseStatus: status || null, responseBody: text } })
      await db.webhookEndpoint.update({ where: { id: ev.endpoint.id }, data: { failureCount: { increment: 1 } } })
      failed += 1
    }
  }
  return { due: due.length, delivered, failed }
}

let kicking = false
/** After a command commits: send what is due without making the caller wait. Off in tests and when disabled. */
export function kickDeliveries(db: Db) {
  if (kicking || process.env.VITEST || process.env.WEBHOOKS_AUTODELIVER === 'off') return
  kicking = true
  void deliverDue(db).catch(() => undefined).finally(() => { kicking = false })
}
