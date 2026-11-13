import { Codes, DomainError } from './errors'
import { actorUserId, type Actor } from './actor'
import { auditCreate, transition } from './cas'
import { payloadHash } from './canonical'
import type { UnitOfWork } from './unitOfWork'

/*
 * Integration connections (SCHEMA §15, INTEGRATIONS). One row per provider the shop uses, with the mode
 * (manual or live), a hashed capability profile, health, and the name of the sealed secret. Nothing
 * here talks to a provider; the adapters do, and report what they saw as ProviderObservation rows.
 * Going live needs a person and a capability profile that names what the provider can do.
 */

export const KINDS = ['vehicle_data', 'labor_guide', 'parts_catalog', 'messaging', 'voice', 'payments', 'financing', 'accounting', 'service_history', 'tire_registration', 'tax', 'import'] as const
export const PROVIDERS = ['nhtsa', 'motor', 'alldata', 'partstech', 'nexpart', 'twilio', 'stripe', 'quickbooks', 'carfax', 'manual'] as const
export const MODES = ['manual', 'live'] as const
const KIND_OF_PROVIDER: Record<string, readonly string[]> = {
  nhtsa: ['vehicle_data'], motor: ['labor_guide', 'parts_catalog'], alldata: ['labor_guide'], partstech: ['parts_catalog'], nexpart: ['parts_catalog'],
  twilio: ['messaging', 'voice'], stripe: ['payments'], quickbooks: ['accounting'], carfax: ['service_history'], manual: KINDS,
}

export type ConnectionInput = { id?: string | null; shopId?: string | null; kind: string; providerKey: string; mode: string; capabilities?: Record<string, unknown> | null; note?: string | null }

export async function saveConnection(uow: UnitOfWork, actor: Actor, input: ConnectionInput) {
  const { tx } = uow
  if (!(KINDS as readonly string[]).includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose what this connection is for.', { field: 'kind' })
  if (!(PROVIDERS as readonly string[]).includes(input.providerKey)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a provider.', { field: 'providerKey' })
  if (!(MODES as readonly string[]).includes(input.mode)) throw new DomainError(Codes.INVALID_INPUT, 'Choose manual or live.', { field: 'mode' })
  if (!KIND_OF_PROVIDER[input.providerKey].includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, `${input.providerKey} does not provide ${input.kind.replaceAll('_', ' ')}.`, { field: 'providerKey' })
  const capabilityProfile = input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : {}
  if (input.mode === 'live' && !Object.keys(capabilityProfile).length) throw new DomainError(Codes.GUARD_FAILED, 'Going live needs a capability profile that says what the provider can do.', { field: 'capabilities' })
  const capabilityHash = payloadHash(capabilityProfile)
  const note = String(input.note ?? '').slice(0, 300)
  const status = input.mode === 'manual' ? 'active' : 'pending_auth'
  if (input.id) {
    const before = await tx.integrationConnection.findUnique({ where: { id: input.id } })
    if (!before) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
    if (before.status === 'revoked') throw new DomainError(Codes.INVALID_TRANSITION, 'This connection was revoked. Add a new one.', { currentStatus: before.status })
    await tx.integrationConnection.update({ where: { id: before.id }, data: { mode: input.mode, capabilityProfile: capabilityProfile as never, capabilityHash, note, status, version: { increment: 1 } } })
    uow.audit({ eventType: 'integration.connection_changed', entityType: 'IntegrationConnection', entityId: before.id, actorUserId: actorUserId(actor), before: { mode: before.mode, status: before.status, capabilityHash: before.capabilityHash }, after: { mode: input.mode, status, capabilityHash } })
    return { id: before.id, status }
  }
  const existing = await tx.integrationConnection.findFirst({ where: { shopId: input.shopId ?? null, kind: input.kind, providerKey: input.providerKey, status: { not: 'revoked' } } })
  if (existing) throw new DomainError(Codes.DUPLICATE, 'This provider is already connected for this purpose.', { existingId: existing.id })
  const row = await tx.integrationConnection.create({ data: { shopId: input.shopId ?? null, kind: input.kind, providerKey: input.providerKey, mode: input.mode, capabilityProfile: capabilityProfile as never, capabilityHash, note, status } })
  auditCreate(uow, actor, 'IntegrationConnection', row.id, 'integration.connection_created', { kind: input.kind, providerKey: input.providerKey, mode: input.mode })
  return { id: row.id, status }
}

/** A person marks a connection healthy, degraded or needing review, with what they saw. */
export async function recordHealth(uow: UnitOfWork, actor: Actor, input: { connectionId: string; ok: boolean; message?: string | null }) {
  const row = await uow.tx.integrationConnection.findUnique({ where: { id: input.connectionId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (row.status === 'revoked' || row.status === 'unconfigured') throw new DomainError(Codes.INVALID_TRANSITION, `This connection is ${row.status}.`, { currentStatus: row.status })
  const to = input.ok ? 'active' : 'degraded'
  const health = { ok: input.ok, message: String(input.message ?? '').slice(0, 300), at: uow.now.toISOString() }
  if (row.status === to) { await uow.tx.integrationConnection.update({ where: { id: row.id }, data: { health: health as never, lastHealthAt: uow.now } }); return { id: row.id, status: to } }
  await transition(uow, { model: 'IntegrationConnection', id: row.id, from: ['configured', 'pending_auth', 'active', 'degraded', 'needs_review'], to, actor, eventType: 'integration.health_recorded', data: { health: health as never, lastHealthAt: uow.now } })
  return { id: row.id, status: to }
}

export async function revokeConnection(uow: UnitOfWork, actor: Actor, input: { connectionId: string; reason: string }) {
  const reason = String(input.reason ?? '').trim().slice(0, 300)
  if (reason.length < 3) throw new DomainError(Codes.INVALID_INPUT, 'Say why this connection is being turned off.', { field: 'reason' })
  await transition(uow, { model: 'IntegrationConnection', id: input.connectionId, from: ['configured', 'pending_auth', 'active', 'degraded', 'needs_review'], to: 'revoked', actor, eventType: 'integration.connection_revoked', reason })
  return { id: input.connectionId, status: 'revoked' }
}

/** What a provider told us, kept as evidence. The same content is kept once (by hash), and the same external id is kept once. */
export async function recordObservation(uow: UnitOfWork, actor: Actor, input: { connectionId: string; kind: 'webhook' | 'response' | 'poll' | 'manual_entry'; externalId?: string | null; payload: unknown; applyResult?: string | null }) {
  const { tx, now } = uow
  const connection = await tx.integrationConnection.findUnique({ where: { id: input.connectionId } })
  if (!connection) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const payload = (input.payload && typeof input.payload === 'object' ? input.payload : { value: input.payload ?? null }) as object
  const text = JSON.stringify(payload)
  if (text.length > 64_000) throw new DomainError(Codes.INVALID_INPUT, 'That is too large to keep as an observation. Attach it as a document instead.', { field: 'payload' })
  const contentHash = payloadHash(payload)
  const externalId = String(input.externalId ?? '').trim().slice(0, 200)
  const dup = await tx.providerObservation.findFirst({ where: { connectionId: connection.id, OR: [{ contentHash }, ...(externalId ? [{ externalId }] : [])] }, select: { id: true } })
  if (dup) return { id: dup.id, existing: true }
  const row = await tx.providerObservation.create({ data: { connectionId: connection.id, kind: input.kind, externalId, contentHash, payload: payload as never, receivedAt: now, appliedAt: input.applyResult ? now : null, applyResult: String(input.applyResult ?? '').slice(0, 200) } })
  auditCreate(uow, actor, 'ProviderObservation', row.id, 'integration.observation_recorded', { connection: connection.providerKey, kind: input.kind, contentHash })
  return { id: row.id, existing: false }
}
