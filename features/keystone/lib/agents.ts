import { AGENT_SCOPES } from '../agents/constants'
import { actorUserId, can, isMachine, requireHuman, requirePermission, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { PROVIDER_KEY, sealProvider } from './aiProvider'
import { logCall } from './communications'
import { createStaffTask } from './authorization'
import { Codes, DomainError } from './errors'
import type { UnitOfWork } from './unitOfWork'

const text = (v: unknown, field: string, max: number, required = true) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (required && !s) throw new DomainError(Codes.INVALID_INPUT, `${field} is required.`, { field })
  if (s.length > max) throw new DomainError(Codes.INVALID_INPUT, `${field} is too long.`, { field })
  return s
}
const KINDS = ['llm_agent', 'voice_agent', 'rules_engine', 'external_mcp_client']

function humanManager(actor: Actor) {
  requireHuman(actor, 'manage assistants')
  requirePermission(actor, 'canManageAgents')
}

export async function createAgent(uow: UnitOfWork, actor: Actor, input: { name: string; kind?: string; modelRef?: string; shopIds?: string[] }) {
  humanManager(actor)
  const kind = input.kind ?? 'llm_agent'
  if (!KINDS.includes(kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose what kind of assistant this is.', { field: 'kind' })
  const name = text(input.name, 'Name', 80)
  if (await uow.tx.agentIdentity.findUnique({ where: { name } })) throw new DomainError(Codes.DUPLICATE, 'An assistant with this name already exists.', { field: 'name' })
  const ids = Array.isArray(input.shopIds) ? input.shopIds.filter(s => typeof s === 'string').slice(0, 50) : []
  const row = await uow.tx.agentIdentity.create({ data: { name, kind, modelRef: text(input.modelRef ?? '', 'Model', 120, false), ownerId: actorUserId(actor), status: 'active', paused: false, shops: { connect: ids.map(id => ({ id })) } } as never })
  auditCreate(uow, actor, 'AgentIdentity', row.id, 'agent.created', { name, kind })
  return { id: row.id, name, status: 'active' }
}

/**
 * Granting a scope widens what an assistant may propose, so it needs the autonomy-approval permission on top of
 * canManageAgents. An assistant never grants anything (agents never call this). Limits are recorded as given.
 */
export async function grantScope(uow: UnitOfWork, actor: Actor, input: { agentId: string; scope: string; limits?: Record<string, unknown> }) {
  humanManager(actor)
  if (!can(actor, 'canApproveAgentAutonomy')) throw new DomainError(Codes.NOT_AUTHORIZED, 'Granting an assistant more access needs the canApproveAgentAutonomy permission.')
  if (!(AGENT_SCOPES as readonly string[]).includes(input.scope)) throw new DomainError(Codes.INVALID_INPUT, 'Choose a permission to grant.', { field: 'scope' })
  const agent = await uow.tx.agentIdentity.findUnique({ where: { id: String(input.agentId ?? '') }, select: { id: true, status: true } })
  if (!agent) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (agent.status === 'retired') throw new DomainError(Codes.GUARD_FAILED, 'This assistant is retired.')
  const existing = await uow.tx.agentToolGrant.findFirst({ where: { agentId: agent.id, scope: input.scope, status: 'active' } })
  if (existing) throw new DomainError(Codes.DUPLICATE, 'That permission is already granted.')
  const grant = await uow.tx.agentToolGrant.create({ data: { agentId: agent.id, scope: input.scope, limits: (input.limits ?? {}) as never, grantedById: actorUserId(actor), status: 'active' } as never })
  auditCreate(uow, actor, 'AgentToolGrant', grant.id, 'agent.grant_added', { agentId: agent.id, scope: input.scope })
  return { id: grant.id }
}

export async function revokeGrant(uow: UnitOfWork, actor: Actor, input: { grantId: string; expectedVersion?: number | null }) {
  humanManager(actor)
  const row = await transition(uow, { model: 'AgentToolGrant', id: String(input.grantId ?? ''), from: ['active'], to: 'revoked', expectedVersion: input.expectedVersion ?? undefined, actor, eventType: 'agent.grant_revoked' })
  return { id: String(row.id), status: 'revoked' }
}

/** Kill switch: a paused assistant can't read or propose, and every plan waiting for Confirm is cancelled. */
export async function setAgentPaused(uow: UnitOfWork, actor: Actor, input: { agentId: string; paused: boolean }) {
  humanManager(actor)
  const agent = await lockRow<Record<string, any>>(uow.tx, 'AgentIdentity', String(input.agentId ?? ''))
  if (agent.status === 'retired') throw new DomainError(Codes.GUARD_FAILED, 'This assistant is retired.')
  await uow.tx.agentIdentity.update({ where: { id: agent.id }, data: { paused: input.paused, status: input.paused ? 'paused' : 'active', version: { increment: 1 } } })
  let cancelled = 0
  if (input.paused) {
    const waiting = await uow.tx.agentProposal.findMany({ where: { agentId: agent.id, status: 'previewed' }, select: { id: true } })
    for (const p of waiting) { await transition(uow, { model: 'AgentProposal', id: p.id, from: ['previewed'], to: 'rejected', actor, eventType: 'proposal.cancelled_paused' }); cancelled += 1 }
  }
  uow.audit({ eventType: input.paused ? 'agent.paused' : 'agent.resumed', entityType: 'AgentIdentity', entityId: agent.id, actorUserId: actorUserId(actor), metadata: { cancelledProposals: cancelled } })
  return { id: agent.id, paused: input.paused, cancelledProposals: cancelled }
}

export async function retireAgent(uow: UnitOfWork, actor: Actor, input: { agentId: string }) {
  humanManager(actor)
  const agent = await lockRow<Record<string, any>>(uow.tx, 'AgentIdentity', String(input.agentId ?? ''))
  await uow.tx.agentIdentity.update({ where: { id: agent.id }, data: { status: 'retired', paused: true, version: { increment: 1 } } })
  await uow.tx.agentToolGrant.updateMany({ where: { agentId: agent.id, status: 'active' }, data: { status: 'revoked' } })
  uow.audit({ eventType: 'agent.retired', entityType: 'AgentIdentity', entityId: agent.id, actorUserId: actorUserId(actor) })
  return { id: agent.id, status: 'retired' }
}

/**
 * A run is the record of one request started with an assistant: by a person on the dashboard, or by the assistant's
 * own MCP token (channel 'mcp', checked by the caller to belong to this assistant). It only drafts; a person confirms.
 */
export async function startRun(uow: UnitOfWork, actor: Actor, input: { agentId: string; shopId: string; channel: string; adapter: string; summary: string }) {
  if (actor.kind !== 'user' || (isMachine(actor) && input.channel !== 'mcp')) throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'A person starts an assistant request.')
  const run = await uow.tx.agentRun.create({ data: { agentId: input.agentId, shopId: input.shopId, invokedById: actor.userId, channel: input.channel, adapter: input.adapter, inputSummary: input.summary.slice(0, 300), status: 'running', startedAt: uow.now } as never })
  return run.id
}

/** The owner's own model key, kept encrypted. Entering it is the only thing that turns the `llm` adapter on. */
export async function saveProviderKey(uow: UnitOfWork, actor: Actor, input: { baseUrl: string; model: string; apiKey: string }) {
  humanManager(actor)
  const baseUrl = text(input.baseUrl, 'Provider address', 200)
  if (!/^https:\/\//.test(baseUrl)) throw new DomainError(Codes.INVALID_INPUT, 'The provider address starts with https://', { field: 'baseUrl' })
  const sealed = sealProvider({ baseUrl, model: text(input.model, 'Model', 100), apiKey: text(input.apiKey, 'Key', 400) })
  await uow.tx.secretBox.upsert({ where: { key: PROVIDER_KEY }, create: { key: PROVIDER_KEY, ...sealed, keyVersion: 1 }, update: { ...sealed, rotatedAt: uow.now } })
  uow.audit({ eventType: 'agent.provider_saved', entityType: 'SecretBox', entityId: PROVIDER_KEY, actorUserId: actorUserId(actor), metadata: { baseUrl } })
  return { connected: true }
}

export async function removeProviderKey(uow: UnitOfWork, actor: Actor) {
  humanManager(actor)
  await uow.tx.secretBox.deleteMany({ where: { key: PROVIDER_KEY } })
  uow.audit({ eventType: 'agent.provider_removed', entityType: 'SecretBox', entityId: PROVIDER_KEY, actorUserId: actorUserId(actor) })
  return { connected: false }
}

// ── Voice tasks: a to-do for a person to call, and the manual log of how it went ─────────────────

export async function createVoiceTask(uow: UnitOfWork, actor: Actor, input: { shopId: string; kind: string; summary: string; target?: Record<string, unknown>; script?: string; agentId?: string | null }) {
  requireHuman(actor, 'queue a call')
  requirePermission(actor, 'canOrderParts', 'canManageParts', 'canMessageCustomers', 'canManageSchedule', 'canManageAgents')
  if (!['supplier_quote_call', 'customer_status_call', 'inbound_reception'].includes(input.kind)) throw new DomainError(Codes.INVALID_INPUT, 'Choose the kind of call.', { field: 'kind' })
  const row = await uow.tx.voiceTask.create({ data: { shopId: input.shopId, kind: input.kind, summary: text(input.summary, 'What the call is for', 200), target: (input.target ?? {}) as never, script: text(input.script ?? '', 'Script', 2000, false), agentId: input.agentId ?? null, createdById: actorUserId(actor), status: 'queued' } as never })
  auditCreate(uow, actor, 'VoiceTask', row.id, 'voice.task_created', { kind: input.kind })
  return { id: row.id }
}

export async function completeVoiceTask(uow: UnitOfWork, actor: Actor, input: { taskId: string; expectedVersion?: number | null; outcome: 'reached' | 'left_voicemail' | 'no_answer' | 'wrong_number'; note?: string; minutes?: number | null; customerId?: string | null; repairOrderId?: string | null; spokeTo?: string; customerSaidYes?: boolean }) {
  requireHuman(actor, 'log a call')
  const task = await lockRow<Record<string, any>>(uow.tx, 'VoiceTask', String(input.taskId ?? ''))
  if (!['queued', 'calling'].includes(task.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'This call is already logged.', { currentStatus: task.status })
  let callId: string | null = null
  if (input.customerId) {
    const call = await logCall(uow, actor, { customerId: input.customerId, repairOrderId: input.repairOrderId ?? null, shopId: task.shopId, direction: 'outbound', outcome: input.outcome, note: input.note ?? null, minutes: input.minutes ?? null }) as { id?: string }
    callId = call?.id ?? null
  }
  // I-A3: a "yes, go ahead" on a call is never an authorization. It becomes a callback task for staff.
  let taskId: string | null = null
  if (input.customerSaidYes && input.repairOrderId) {
    const t = await createStaffTask(uow, actor, { shopId: task.shopId, repairOrderId: input.repairOrderId, kind: 'authorization_callback', title: 'Customer said yes on a call: call back and record the authorization', detail: (input.note ?? '').slice(0, 800), source: 'voice' })
    taskId = (t as { id?: string })?.id ?? null
  }
  const row = await transition(uow, { model: 'VoiceTask', id: task.id, from: ['queued', 'calling'], to: input.outcome === 'reached' ? 'completed' : 'failed', expectedVersion: input.expectedVersion ?? undefined, actor, eventType: 'voice.task_logged',
    data: { callId, completedById: actorUserId(actor), completedAt: uow.now, extracted: { spokeTo: text(input.spokeTo ?? '', 'Who you spoke to', 100, false), note: text(input.note ?? '', 'Note', 800, false), outcome: input.outcome, callbackTaskId: taskId } as never } })
  return { id: task.id, status: String(row.status), callbackTaskId: taskId }
}
