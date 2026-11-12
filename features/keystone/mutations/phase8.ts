import { sessionShopIds } from '../access'
import { mcpSessionMarker } from '../mcp-oauth/session'
import { actorFromSession, can, isMachine, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { loadAgent, assertAgentActive } from '../lib/agentAccess'
import { completeVoiceTask, createAgent, createVoiceTask, grantScope, removeProviderKey, retireAgent, revokeGrant, saveProviderKey, setAgentPaused, startRun } from '../lib/agents'
import { llmCompletion, loadProvider, NO_PROVIDER, requireProvider, type Completion } from '../lib/aiProvider'
import { disputeEmail, findCannedJob, planWithModel } from '../lib/assistant'
import { command } from '../lib/command'
import { addHypothesis, closeDiagnosis, markInconclusive, markQuoteReady, recordDiagnosticTest, startDiagnosis, trustGate } from '../lib/diagnosis'
import { Codes, DomainError } from '../lib/errors'
import { confirmProposal, draftProposal, rejectProposal, type DraftInput } from '../lib/proposals'

type Ctx = { session: any; prisma: any }

/** Where the model is called from. Tests replace this with a deterministic fake; in production it is the owner's own key or nothing. */
export const adapters: { completion: (config: Parameters<typeof llmCompletion>[0]) => Completion } = { completion: config => llmCompletion(config) }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

const shopsOf = (context: Ctx) => sessionShopIds(context.session)
const allowedShop = (context: Ctx, shopId: string | null | undefined) => {
  const ids = shopsOf(context)
  if (!shopId || (ids !== 'all' && !ids.includes(shopId))) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  return shopId
}
async function shopOf(context: Ctx, list: string, id: unknown, pick: (row: any) => string | null | undefined, select?: object) {
  const row = typeof id === 'string' && id ? await context.prisma[list].findUnique({ where: { id }, ...(select ? { select } : {}) }) : null
  return allowedShop(context, row ? pick(row) : null)
}
const asUser = (actor: Actor) => {
  if (actor.kind !== 'user') throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in to continue.')
  return actor
}

// ── Assistants ───────────────────────────────────────────────────────────────────────────────────

export async function createAssistant(_root: unknown, args: { input: { name: string; kind?: string; modelRef?: string; shopIds?: string[] }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'add an assistant')
  requirePermission(actor, 'canManageAgents')
  const ids = shopsOf(context)
  const shopIds = (args.input?.shopIds ?? []).filter(id => ids === 'all' || ids.includes(id))
  return run(context, actor, 'agent.create', args.idempotencyKey, args.input, uow => createAgent(uow, actor, { ...args.input, shopIds }))
}

export async function grantAssistantScope(_root: unknown, args: { agentId: string; scope: string; limits?: Record<string, unknown> | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'grant access to an assistant')
  return run(context, actor, 'agent.grant', args.idempotencyKey, args, uow => grantScope(uow, actor, { agentId: args.agentId, scope: args.scope, limits: args.limits ?? {} }))
}

export async function revokeAssistantScope(_root: unknown, args: { grantId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'remove access from an assistant')
  return run(context, actor, 'agent.revoke', args.idempotencyKey, args, uow => revokeGrant(uow, actor, { grantId: args.grantId }))
}

export async function pauseAssistant(_root: unknown, args: { agentId: string; paused: boolean; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'pause an assistant')
  return run(context, actor, 'agent.pause', args.idempotencyKey, args, uow => setAgentPaused(uow, actor, { agentId: args.agentId, paused: Boolean(args.paused) }))
}

export async function retireAssistant(_root: unknown, args: { agentId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'retire an assistant')
  return run(context, actor, 'agent.retire', args.idempotencyKey, args, uow => retireAgent(uow, actor, { agentId: args.agentId }))
}

export async function saveAiProvider(_root: unknown, args: { input: { baseUrl: string; model: string; apiKey: string }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'connect an AI provider')
  // The key is never stored in the receipt: only its length is part of the replayed request.
  const params = { baseUrl: args.input?.baseUrl, model: args.input?.model, keyLength: String(args.input?.apiKey ?? '').length }
  return run(context, actor, 'agent.provider_save', args.idempotencyKey, params, uow => saveProviderKey(uow, actor, args.input))
}

export async function removeAiProvider(_root: unknown, args: { idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'disconnect the AI provider')
  return run(context, actor, 'agent.provider_remove', args.idempotencyKey, {}, uow => removeProviderKey(uow, actor))
}

/** Whether the owner has connected a provider. Never returns the key. */
export async function aiProviderStatus(_root: unknown, _args: unknown, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageAgents', 'canConfirmProposals', 'canDiagnose')
  const config = await loadProvider(context.prisma)
  return { connected: Boolean(config), model: config?.model ?? null, host: config ? new URL(config.baseUrl).host : null, message: config ? null : NO_PROVIDER }
}

// ── Asking an assistant: plan → preview → (later) Confirm ───────────────────────────────────────

/** Free text that came from outside the shop, handed to the model as quoted data and nothing more (I-A5). */
async function outsideContext(context: Ctx, repairOrderId: string | null) {
  if (!repairOrderId) return []
  const messages = await context.prisma.message.findMany({ where: { repairOrderId, direction: 'inbound' }, orderBy: { at: 'desc' }, take: 3, select: { body: true } })
  const ro = await context.prisma.repairOrder.findUnique({ where: { id: repairOrderId }, select: { vehicleId: true } })
  const recalls = ro?.vehicleId ? await context.prisma.recallCheck.findMany({ where: { vehicleId: ro.vehicleId }, orderBy: { checkedAt: 'desc' }, take: 1, select: { campaigns: true } }) : []
  return [
    ...messages.map((m: { body: string }) => ({ source: 'customer text message', text: m.body })),
    ...recalls.map((r: { campaigns: unknown }) => ({ source: 'recall summary', text: JSON.stringify(r.campaigns ?? []).slice(0, 2000) })),
  ]
}

type AskArgs = { agentId: string; shopId?: string | null; repairOrderId?: string | null; message?: string | null; title?: string | null; steps?: DraftInput['steps'] | null; tool?: string | null; args?: Record<string, unknown> | null; idempotencyKey: string }

/**
 * A person (or an assistant's own token) asks for a plan. With steps given, that is the manual path and needs no AI
 * provider. With only a message, the owner's provider writes the steps; without one this says "No AI provider connected".
 * Either way the steps go to the same engine, which checks the grants, dry-runs each step and stores a preview.
 * Nothing is written to the shop's records here.
 */
export async function askAssistant(_root: unknown, input: AskArgs, context: Ctx) {
  // One named step with its details is the same as a one-step plan.
  const args: AskArgs = input.tool ? { ...input, steps: [{ tool: input.tool, args: input.args ?? {} }], title: input.title ?? input.tool.replace(/_/g, ' ') } : input
  const actor = asUser(actorFromSession(context.session))
  const marker = mcpSessionMarker(context.session)
  if (marker?.agentId) { if (marker.agentId !== args.agentId) throw new DomainError(Codes.NOT_AUTHORIZED, 'This connection belongs to a different assistant.') } else requirePermission(actor, 'canConfirmProposals')
  const agent = await loadAgent(context.prisma, args.agentId)
  assertAgentActive(agent)
  const ids = shopsOf(context)
  let repairOrderId = args.repairOrderId ?? null
  if (repairOrderId) await shopOf(context, 'repairOrder', repairOrderId, r => r.shopId, { shopId: true })
  const manual = Array.isArray(args.steps) && args.steps.length > 0
  const adapter = manual ? 'manual' : 'llm'
  let plan: Pick<DraftInput, 'title' | 'steps'>
  if (manual) plan = { title: String(args.title ?? 'Plan').slice(0, 200), steps: args.steps! }
  else {
    const message = String(args.message ?? '').trim()
    if (!message) throw new DomainError(Codes.INVALID_INPUT, 'Say what you need.', { field: 'message' })
    const provider = requireProvider(await loadProvider(context.prisma))
    plan = await planWithModel(adapters.completion(provider), agent, message, { outside: await outsideContext(context, repairOrderId), repairOrderId })
  }
  const shopId = args.shopId ?? agent.shopIds[0] ?? (ids === 'all' ? null : ids[0]) ?? null
  const started = await command<string>(context.prisma, { name: 'agent.run_start', actor, idempotencyKey: `${args.idempotencyKey}:run`, params: { agentId: args.agentId, adapter, message: args.message ?? args.title ?? '' } }, async uow =>
    startRun(uow, actor, { agentId: agent.id, shopId: shopId ?? '', channel: marker?.agentId ? 'mcp' : 'dashboard_chat', adapter, summary: String(args.message ?? args.title ?? plan.title) }))
  const runId = started.value
  try {
    const out = await draftProposal(context.prisma, actor, ids, { agentId: agent.id, title: plan.title, steps: plan.steps, runId, repairOrderId }, `${args.idempotencyKey}:draft`)
    return { ...out, runId, adapter }
  } catch (error) {
    await command(context.prisma, { name: 'agent.run_refused', actor, idempotencyKey: `${args.idempotencyKey}:refused`, params: { runId } }, async uow => {
      await uow.tx.agentRun.update({ where: { id: runId }, data: { status: error instanceof DomainError && [Codes.AGENT_FORBIDDEN_ACTION, Codes.NOT_AUTHORIZED, Codes.GUIDE_AMBIGUOUS, Codes.GUARD_FAILED].includes(error.code as never) ? 'refused' : 'failed', endedAt: uow.now, toolCalls: [{ refused: String((error as Error).message).slice(0, 300) }] as never } })
      return { ok: true }
    }).catch(() => null)
    throw error
  }
}

/** The same thing for an assistant connected over MCP: it can only propose. */
export const draftAgentProposal = askAssistant

export async function confirmAgentProposal(_root: unknown, args: { proposalId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'confirm what an assistant proposed')
  await shopOf(context, 'agentProposal', args.proposalId, r => r.shopId, { shopId: true })
  return confirmProposal(context.prisma, actor, shopsOf(context), { proposalId: args.proposalId, expectedVersion: Number(args.expectedVersion) })
}

export async function rejectAgentProposal(_root: unknown, args: { proposalId: string; expectedVersion: number; reason?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'reject what an assistant proposed')
  await shopOf(context, 'agentProposal', args.proposalId, r => r.shopId, { shopId: true })
  return rejectProposal(context.prisma, actor, shopsOf(context), { proposalId: args.proposalId, expectedVersion: Number(args.expectedVersion), reason: args.reason }, args.idempotencyKey)
}

/** Price a job from a canned job. Several close matches are listed for a person to pick; ambiguity in the guide is refused by the engine. */
export async function suggestEstimate(_root: unknown, args: { agentId: string; repairOrderId: string; words: string; concernId?: string | null; cannedJobId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = asUser(actorFromSession(context.session))
  requirePermission(actor, 'canConfirmProposals')
  const shopId = await shopOf(context, 'repairOrder', args.repairOrderId, r => r.shopId, { shopId: true })
  let cannedJobId = args.cannedJobId ?? null
  let name = ''
  if (!cannedJobId) {
    const { matches } = await findCannedJob(context.prisma, shopId, args.words)
    if (matches.length !== 1) return { matches, proposalId: null, message: matches.length ? 'Several canned jobs fit. Pick one.' : 'No canned job fits those words. Price it by hand.' }
    cannedJobId = matches[0].id
    name = matches[0].name
  } else {
    name = (await context.prisma.cannedJob.findUnique({ where: { id: cannedJobId }, select: { name: true } }))?.name ?? 'Job'
  }
  return askAssistant(null, { agentId: args.agentId, shopId, repairOrderId: args.repairOrderId, title: `Add and price: ${name}`, steps: [{ tool: 'add_job', args: { repairOrderId: args.repairOrderId, title: name, cannedJobId, ...(args.concernId ? { concernId: args.concernId } : {}) } }], idempotencyKey: args.idempotencyKey }, context)
}

// ── Diagnosis ────────────────────────────────────────────────────────────────────────────────────

const DIAG = ['canDiagnose'] as const
const sessionShop = (context: Ctx, id: unknown) => shopOf(context, 'diagnosisSession', id, r => r.shopId, { shopId: true })

export async function startDiagnosisSession(_root: unknown, args: { input: { repairOrderId: string; concernId: string; jobId: string; symptoms?: string[]; dtcs?: string[]; summary?: string }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...DIAG)
  await shopOf(context, 'repairOrder', args.input?.repairOrderId, r => r.shopId, { shopId: true })
  return run(context, actor, 'diagnosis.start', args.idempotencyKey, args.input, uow => startDiagnosis(uow, actor, args.input))
}

export async function addDiagnosisHypothesis(_root: unknown, args: { input: { sessionId: string; cause: string; confidence: unknown; evidence?: unknown; sources: unknown }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...DIAG)
  await sessionShop(context, args.input?.sessionId)
  return run(context, actor, 'diagnosis.hypothesis', args.idempotencyKey, args.input, uow => addHypothesis(uow, actor, args.input))
}

export async function recordDiagnosisTest(_root: unknown, args: { input: { sessionId: string; hypothesisId?: string | null; procedure: string; expected?: string; result: string; outcome: string }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'record a diagnostic test')
  requirePermission(actor, ...DIAG)
  await sessionShop(context, args.input?.sessionId)
  return run(context, actor, 'diagnosis.test', args.idempotencyKey, args.input, uow => recordDiagnosticTest(uow, actor, args.input))
}

export async function markDiagnosisQuoteReady(_root: unknown, args: { input: { sessionId: string; repairJobId: string; expectedVersion: number; overrideReason?: string | null }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'mark a diagnosis ready to quote')
  requirePermission(actor, ...DIAG, 'canOverrideTrustGate')
  await sessionShop(context, args.input?.sessionId)
  return run(context, actor, 'diagnosis.quote_ready', args.idempotencyKey, args.input, uow => markQuoteReady(uow, actor, args.input))
}

export async function markDiagnosisInconclusive(_root: unknown, args: { sessionId: string; expectedVersion: number; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'close out a diagnosis')
  requirePermission(actor, ...DIAG)
  await sessionShop(context, args.sessionId)
  return run(context, actor, 'diagnosis.inconclusive', args.idempotencyKey, args, uow => markInconclusive(uow, actor, { sessionId: args.sessionId, expectedVersion: args.expectedVersion, note: args.note ?? undefined }))
}

export async function closeDiagnosisSession(_root: unknown, args: { sessionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'close a diagnosis')
  requirePermission(actor, ...DIAG)
  await sessionShop(context, args.sessionId)
  return run(context, actor, 'diagnosis.close', args.idempotencyKey, args, uow => closeDiagnosis(uow, actor, args))
}

/** Where the trust gate stands for a session (and a repair job, if one is chosen). Read only. */
export async function diagnosisGate(_root: unknown, args: { sessionId: string; jobId?: string | null }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canDiagnose', 'canReadRepairOrders', 'canConfirmProposals')
  await sessionShop(context, args.sessionId)
  const gate = await trustGate(context.prisma, args.sessionId, args.jobId ?? null)
  return { ...gate, canOverride: can(actor, 'canOverrideTrustGate') && !isMachine(actor) }
}

// ── Supplier invoices and voice ──────────────────────────────────────────────────────────────────

/** The dispute email for staff to copy. Nothing is sent from here. */
export async function supplierDisputeEmail(_root: unknown, args: { invoiceId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageParts', 'canApproveSupplierInvoice', 'canReceiveParts')
  await shopOf(context, 'supplierInvoice', args.invoiceId, r => r.shopId, { shopId: true })
  return disputeEmail(context.prisma, args.invoiceId)
}

export async function queueVoiceTask(_root: unknown, args: { input: { shopId: string; kind: string; summary: string; target?: Record<string, unknown>; script?: string; agentId?: string | null }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'queue a call')
  allowedShop(context, args.input?.shopId)
  return run(context, actor, 'voice.create', args.idempotencyKey, args.input, uow => createVoiceTask(uow, actor, args.input))
}

export async function logVoiceCall(_root: unknown, args: { input: Parameters<typeof completeVoiceTask>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'log a call')
  await shopOf(context, 'voiceTask', args.input?.taskId, r => r.shopId, { shopId: true })
  return run(context, actor, 'voice.log', args.idempotencyKey, args.input, uow => completeVoiceTask(uow, actor, args.input))
}
