import type { Permission } from '../access'
import { AUTO_ELIGIBLE, NEVER_EXPOSED } from '../agents/constants'
import { checkArgs, TOOL_BY_NAME, type AgentTool, type Entity } from '../agents/tools'
import { stripCost } from '../security/costRedaction'
import { actorUserId, can, isMachine, type Actor } from './actor'
import { assertAllowed, agentActor, loadAgent, type AgentState } from './agentAccess'
import { auditCreate, lockRow, transition } from './cas'
import { command } from './command'
import { delegateOf, type Db, type Tx } from './db'
import { Codes, DomainError } from './errors'
import { runInTransaction, type UnitOfWork } from './unitOfWork'

/*
 * The proposal engine (STATE-MACHINES §18). drafted → previewed → confirmed → executing → executed,
 * previewed → rejected, confirmed | executing → stale | failed.
 *
 *  - draft: every step is a named tool, allowed only if the agent's grants AND the invoking user's permissions cover it.
 *  - preview: the whole plan is dry-run in one transaction that is rolled back, so the preview is the real effect and
 *    nothing is written. The readSet (entity, id, version) is read inside that dry run.
 *  - confirm: a person with canConfirmProposals presses Confirm. By default each step needs its own Confirm.
 *  - execute: before each step the readSet is checked again (compare-and-set). A changed record gives `stale`.
 *    Each step runs once under the key `proposalId:stepIndex`. A failed step stops the rest; earlier steps stay done.
 * There is no queue, lease or timer: everything happens inside the request of the person who pressed the button.
 */

export type PlanStep = { index: number; tool: string; args: Record<string, unknown>; summary: string; status: 'pending' | 'done' | 'failed'; preview?: unknown; result?: unknown; error?: string }
export type ReadEntry = { stepIndex: number; entity: string; id: string; version: number }

type UserActor = Extract<Actor, { kind: 'user' }>
class Rollback extends Error { constructor(readonly out: unknown) { super('rollback') } }

const REF = /^\$(\d+)\.([A-Za-z0-9_.]+)$/
const isRef = (v: unknown) => typeof v === 'string' && REF.test(v)
const pick = (obj: unknown, path: string) => path.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), obj)
/** A later step may use an earlier step's result: "$0.id". */
export function resolveRefs(value: unknown, results: unknown[]): unknown {
  if (typeof value === 'string') {
    const m = REF.exec(value)
    if (!m) return value
    const out = pick(results[Number(m[1])], m[2])
    if (out === undefined) throw new DomainError(Codes.GUARD_FAILED, `Step ${Number(m[1]) + 1} did not produce ${m[2]}.`)
    return out
  }
  if (Array.isArray(value)) return value.map(v => resolveRefs(v, results))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRefs(v, results)]))
  return value
}

const small = (v: unknown) => {
  const clean = stripCost(JSON.parse(JSON.stringify(v ?? null, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))) as unknown
  return JSON.stringify(clean).length > 3000 ? { truncated: true } : clean
}

async function policyOf(tx: Tx, shopId: string) {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { shopPolicyId: true } })
  const p = shop?.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId }, select: { id: true, agentAutonomy: true, agentOrderLimitMinor: true, proposalConfirmGranularity: true } }) : null
  return { id: p?.id ?? null, autonomy: (p?.agentAutonomy ?? {}) as Record<string, string>, orderLimit: p?.agentOrderLimitMinor ?? 0n, granularity: (p?.proposalConfirmGranularity ?? 'per_step') as 'per_step' | 'per_plan' }
}

function shopAllowed(shopIds: string[] | 'all', shopId: string | null) {
  if (!shopId) return false
  return shopIds === 'all' || shopIds.includes(shopId)
}

export type DraftInput = { agentId: string; title: string; steps: { tool: string; args: Record<string, unknown> }[]; runId?: string | null; repairOrderId?: string | null }

/**
 * Draft and preview in one go. The plan is refused (and nothing is stored) if the agent or user may not do a step,
 * a tool does not exist, or a step's own guard refuses it in the dry run (for example GUIDE_AMBIGUOUS).
 */
export async function draftProposal(db: Db, user: UserActor, shopIds: string[] | 'all', input: DraftInput, key: string) {
  // 1. Check the plan and store it as drafted (committed, so the dry run below never nests inside this transaction).
  const stored = await command(db, { name: 'proposal.draft', actor: user, idempotencyKey: key, params: input }, async uow => {
    const { tx } = uow
    const agent = await loadAgent(tx, input.agentId)
    if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 12) throw new DomainError(Codes.INVALID_INPUT, 'A plan has 1 to 12 steps.', { field: 'steps' })
    const title = String(input.title ?? '').trim().slice(0, 200)
    if (!title) throw new DomainError(Codes.INVALID_INPUT, 'Give the plan a title.', { field: 'title' })
    const tools: AgentTool[] = []
    for (const s of input.steps) {
      const t = TOOL_BY_NAME.get(String(s?.tool ?? ''))
      if (!t || (NEVER_EXPOSED as readonly string[]).includes(String(s?.tool))) throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'That is not something an assistant can do. A person does it, or an assistant can create a callback task.')
      checkArgs(t, s.args ?? {})
      assertAllowed(agent, user, t.scope, t.permissions as readonly Permission[])
      tools.push(t)
    }
    // One shop per plan, read from step 1, which can't depend on a result.
    if (Object.values(input.steps[0].args ?? {}).some(isRef)) throw new DomainError(Codes.INVALID_INPUT, 'The first step cannot use a result from a step before it.')
    const shopId = await tools[0].shopOf(tx, input.steps[0].args)
    if (!shopId) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
    if (!shopAllowed(shopIds, shopId) || (agent.shopIds.length && !agent.shopIds.includes(shopId))) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
    for (const [i, s] of input.steps.entries()) {
      if (i > 0 && !Object.values(s.args ?? {}).some(isRef)) {
        const other = await tools[i].shopOf(tx, s.args)
        if (other !== shopId) throw new DomainError(Codes.INVALID_INPUT, 'All the steps of a plan must be for the same shop.')
      }
    }
    const created = await tx.agentProposal.create({
      data: { title, runId: input.runId ?? null, agentId: agent.id, shopId, repairOrderId: input.repairOrderId ?? null, invokedById: user.userId, actionClass: tools[0].actionClass, plan: input.steps.map((s, i) => ({ index: i, tool: s.tool, args: s.args, summary: tools[i].summary(s.args), status: 'pending' })) as never, status: 'drafted' } as never,
    })
    auditCreate(uow, user, 'AgentProposal', created.id, 'proposal.drafted', { agentId: agent.id, steps: input.steps.map(s => s.tool) })
    return { proposalId: created.id, shopId }
  })
  if (stored.replay) {
    const again = await db.agentProposal.findUniqueOrThrow({ where: { id: stored.value.proposalId } })
    return { replay: true, proposalId: again.id, status: again.status, preview: (again.plan as unknown as PlanStep[]).map(p => ({ index: p.index, summary: p.summary, effect: p.preview })) }
  }
  const { proposalId, shopId } = stored.value
  // 2. Dry run in its own transaction: the exact effect of every step, rolled back.
  const agent = await loadAgent(db as unknown as Tx, input.agentId)
  const tools = input.steps.map(s => TOOL_BY_NAME.get(s.tool)!)
  let dry: { previews: unknown[]; readSet: ReadEntry[] }
  try {
    dry = await dryRun(db, agent, user, shopId, tools, input.steps, proposalId)
  } catch (error) {
    // The step's own rule refused it (for example GUIDE_AMBIGUOUS): keep the record as failed so the refusal is visible.
    await runInTransaction(db, async uow => { await transition(uow, { model: 'AgentProposal', id: proposalId, from: ['drafted'], to: 'failed', actor: user, eventType: 'proposal.refused', reason: (error as Error).message.slice(0, 300), data: { failure: (error as Error).message.slice(0, 300) } }) }, { actorKind: 'user' })
    throw error
  }
  // 3. Store the preview and the readSet, and move to previewed.
  const plan = input.steps.map((s, i) => ({ index: i, tool: s.tool, args: s.args, summary: tools[i].summary(s.args), status: 'pending', preview: dry.previews[i] }))
  await runInTransaction(db, async uow => {
    await uow.tx.agentProposal.update({ where: { id: proposalId }, data: { plan: plan as never, readSet: dry.readSet as never } })
    await transition(uow, { model: 'AgentProposal', id: proposalId, from: ['drafted'], to: 'previewed', actor: user, eventType: 'proposal.previewed' })
  }, { actorKind: 'user' })
  return { replay: false, proposalId, status: 'previewed', preview: plan.map(p => ({ index: p.index, summary: p.summary, effect: p.preview })) }
}

async function dryRun(db: Db, agent: AgentState, user: UserActor, shopId: string, tools: AgentTool[], steps: DraftInput['steps'], proposalId: string) {
  void user
  const actor = agentActor(agent)
  try {
    await runInTransaction(db, async uow => {
      const results: unknown[] = []
      const previews: unknown[] = []
      const readSet: ReadEntry[] = []
      for (const [i, step] of steps.entries()) {
        const raw = step.args ?? {}
        for (const e of tools[i].reads(raw) as Entity[]) if (e.id && !isRef(e.id)) {
          const row = await delegateOf(uow.tx, e.entity).findUnique({ where: { id: e.id } })
          if (!row) throw new DomainError(Codes.NOT_FOUND, `${e.entity} not found.`)
          readSet.push({ stepIndex: i, entity: e.entity, id: e.id, version: Number((row as any).version ?? 0) })
        }
        const args = resolveRefs(raw, results) as Record<string, unknown>
        const out = await tools[i].run({ uow, actor, shopId, proposalId, runId: null, stepKey: `${proposalId}:${i}` }, args)
        results.push(out)
        previews.push(small(out))
      }
      throw new Rollback({ previews, readSet })
    }, { actorKind: 'agent' })
  } catch (e) {
    if (e instanceof Rollback) return e.out as { previews: unknown[]; readSet: ReadEntry[] }
    throw e
  }
  throw new Error('unreachable')
}

/** Is this plan one the shop has said can go ahead without a person (and still within its limits)? Never for protected classes. */
export async function autoEligible(tx: Tx, shopId: string, steps: { tool: string; args: Record<string, any> }[]) {
  const policy = await policyOf(tx, shopId)
  for (const s of steps) {
    const tool = TOOL_BY_NAME.get(s.tool)
    if (!tool) return false
    if (tool.name === 'order_parts') {
      if (policy.orderLimit <= 0n || policy.autonomy['order_parts'] !== 'auto_within_policy') return false
      const total = (Array.isArray(s.args.lines) ? s.args.lines : []).reduce((sum: bigint, l: any) => sum + BigInt(String(l.unitCostMinor ?? '0').replace(/\D/g, '') || '0') * BigInt(Math.trunc(Number(l.quantityMilli ?? 0))) / 1000n, 0n)
      if (total > policy.orderLimit) return false
    } else if (!(AUTO_ELIGIBLE as readonly string[]).includes(tool.actionClass) || policy.autonomy[tool.actionClass] !== 'auto_within_policy') return false
  }
  return true
}

export function requireConfirmer(actor: Actor): asserts actor is UserActor {
  if (actor.kind !== 'user' || isMachine(actor)) throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'Only a person can confirm what an assistant proposed.')
  if (!can(actor, 'canConfirmProposals')) throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs the canConfirmProposals permission.')
}

async function loadProposal(tx: Tx, id: unknown, shopIds: string[] | 'all') {
  const p = typeof id === 'string' ? await tx.agentProposal.findUnique({ where: { id } }) : null
  if (!p || !shopAllowed(shopIds, p.shopId)) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  return p
}

async function checkReadSet(tx: Tx, readSet: ReadEntry[], stepIndex: number) {
  for (const e of readSet.filter(r => r.stepIndex === stepIndex)) {
    const row = await delegateOf(tx, e.entity).findUnique({ where: { id: e.id } })
    if (!row || Number((row as any).version ?? 0) !== e.version) return `${e.entity.replace(/([A-Z])/g, ' $1').trim().toLowerCase()} changed after the preview`
  }
  return null
}

/**
 * Confirm the next step (per_step) or every remaining step (per_plan). Idempotent per step: `proposalId:stepIndex`.
 * Returns the proposal state; `stale` means a record changed since the preview and a new plan is needed.
 */
export async function confirmProposal(db: Db, actor: Actor, shopIds: string[] | 'all', input: { proposalId: string; expectedVersion: number }) {
  requireConfirmer(actor)
  // Phase 1: previewed → confirmed (committed on its own, so a failed step can be recorded as failed).
  const start = await command(db, { name: 'proposal.confirm', actor, idempotencyKey: `${input.proposalId}:confirm:${input.expectedVersion}`, params: input }, async uow => {
    const p = await loadProposal(uow.tx, input.proposalId, shopIds)
    const agent = await loadAgent(uow.tx, p.agentId ?? '')
    if (agent.paused || agent.status !== 'active') {
      await transition(uow, { model: 'AgentProposal', id: p.id, from: ['previewed'], to: 'rejected', actor, eventType: 'proposal.cancelled_paused' })
      throw new DomainError(Codes.AGENT_PAUSED, `${agent.name} is paused, so this plan was cancelled.`)
    }
    const row = await transition(uow, { model: 'AgentProposal', id: p.id, from: ['previewed'], to: 'confirmed', expectedVersion: input.expectedVersion, actor, eventType: 'proposal.confirmed', data: { confirmedById: actorUserId(actor), confirmedAt: uow.now } })
    return { version: Number(row.version), shopId: p.shopId }
  })
  return runSteps(db, actor, shopIds, input.proposalId, start.value.version)
}

async function runSteps(db: Db, actor: UserActor, shopIds: string[] | 'all', proposalId: string, confirmedVersion: number) {
  const pre = await db.agentProposal.findUnique({ where: { id: proposalId } })
  if (!pre) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const granularity = (await policyOf(db as unknown as Tx, pre.shopId ?? '')).granularity
  let version = confirmedVersion
  for (;;) {
    const current = await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } })
    const stepIndex = current.stepIndex ?? 0
    try {
      const out = await command(db, { name: 'proposal.step', actor, idempotencyKey: `${proposalId}:${stepIndex}`, params: { proposalId, stepIndex } }, uow => executeStep(uow, actor, shopIds, proposalId, version, granularity))
      version = out.value.version
      if (out.value.status !== 'previewed' || granularity === 'per_step' || out.value.done) return { replay: out.replay, ...out.value }
      // per_plan: carry on with the next step; it needs the confirmed state again
      const again = await command(db, { name: 'proposal.reconfirm', actor, idempotencyKey: `${proposalId}:reconfirm:${stepIndex + 1}`, params: { proposalId, stepIndex } }, async uow => (await transition(uow, { model: 'AgentProposal', id: proposalId, from: ['previewed'], to: 'confirmed', actor, eventType: 'proposal.confirmed' })).version)
      version = Math.trunc(+(again.value as number))
    } catch (error) {
      if (error instanceof DomainError || error instanceof Error) {
        await runInTransaction(db, async uow => {
          const row = await lockRow<Record<string, any>>(uow.tx, 'AgentProposal', proposalId)
          if (!['confirmed', 'executing'].includes(row.status)) return
          const plan = (row.plan as PlanStep[]).map(s => (s.index === row.stepIndex ? { ...s, status: 'failed' as const, error: error.message.slice(0, 300) } : s))
          await transition(uow, { model: 'AgentProposal', id: proposalId, from: ['confirmed', 'executing'], to: 'failed', actor, eventType: 'proposal.failed', reason: error.message.slice(0, 300), data: { plan: plan as never, failure: error.message.slice(0, 300) } })
        }, { actorKind: 'user' })
        throw error
      }
      throw error
    }
  }
}

async function executeStep(uow: UnitOfWork, actor: UserActor, shopIds: string[] | 'all', proposalId: string, expectedVersion: number, granularity: 'per_step' | 'per_plan') {
  const { tx } = uow
  const p = await loadProposal(tx, proposalId, shopIds)
  const agent = await loadAgent(tx, p.agentId ?? '')
  if (agent.paused || agent.status !== 'active') throw new DomainError(Codes.AGENT_PAUSED, `${agent.name} is paused.`)
  const plan = p.plan as unknown as PlanStep[]
  const readSet = p.readSet as unknown as ReadEntry[]
  const index = p.stepIndex ?? 0
  const step = plan[index]
  const tool = step ? TOOL_BY_NAME.get(step.tool) : null
  if (!step || !tool) throw new DomainError(Codes.INVALID_TRANSITION, 'There is no step left to run.')
  // The person's permissions can have changed since the preview: check again, on the fresh state.
  assertAllowed(agent, actor, tool.scope, tool.permissions as readonly Permission[])
  await transition(uow, { model: 'AgentProposal', id: p.id, from: ['confirmed'], to: 'executing', expectedVersion, actor, eventType: 'proposal.executing' })
  const changed = await checkReadSet(tx, readSet, index)
  if (changed) {
    await transition(uow, { model: 'AgentProposal', id: p.id, from: ['executing'], to: 'stale', actor, eventType: 'proposal.stale', reason: changed, data: { failure: `Stopped: the ${changed}. Ask for a new plan.` } })
    const row = await tx.agentProposal.findUniqueOrThrow({ where: { id: p.id } })
    return { proposalId: p.id, status: 'stale', stepIndex: index, version: row.version, done: true, message: `Stopped: the ${changed}. Ask for a new plan.` }
  }
  const results = plan.map(s => s.result)
  const args = resolveRefs(step.args, results) as Record<string, unknown>
  const out = await tool.run({ uow, actor: agentActor(agent), shopId: p.shopId ?? '', proposalId: p.id, runId: p.runId, stepKey: `${p.id}:${index}` }, args)
  const nextPlan = plan.map(s => (s.index === index ? { ...s, status: 'done' as const, result: JSON.parse(JSON.stringify(out, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) } : s))
  const last = index + 1 >= plan.length
  const row = await transition(uow, {
    model: 'AgentProposal', id: p.id, from: ['executing'], to: last ? 'executed' : 'previewed', actor, eventType: last ? 'proposal.executed' : 'proposal.step_done',
    data: { plan: nextPlan as never, stepIndex: last ? index : index + 1, ...(last ? { result: small(nextPlan.map(s => s.result)) as never } : {}) },
  })
  uow.audit({ eventType: 'proposal.step_executed', entityType: 'AgentProposal', entityId: p.id, actorUserId: actor.userId, actorAgentId: agent.id, metadata: { stepIndex: index, tool: tool.name, confirmedBy: actor.userId, idempotencyKey: `${p.id}:${index}`, granularity } })
  if (last && p.runId) await tx.agentRun.update({ where: { id: p.runId }, data: { status: 'completed', endedAt: uow.now } }).catch(() => null)
  return { proposalId: p.id, status: String(row.status), stepIndex: last ? index : index + 1, version: Number(row.version), done: last, message: last ? 'Done.' : `Step ${index + 1} done. Confirm the next step when you are ready.` }
}

export async function rejectProposal(db: Db, actor: Actor, shopIds: string[] | 'all', input: { proposalId: string; expectedVersion: number; reason?: string | null }, key: string) {
  requireConfirmer(actor)
  const out = await command(db, { name: 'proposal.reject', actor, idempotencyKey: key, params: input }, async uow => {
    const p = await loadProposal(uow.tx, input.proposalId, shopIds)
    const row = await transition(uow, { model: 'AgentProposal', id: p.id, from: ['previewed'], to: 'rejected', expectedVersion: input.expectedVersion, actor, eventType: 'proposal.rejected', reason: input.reason ? String(input.reason).slice(0, 300) : null })
    return { proposalId: p.id, status: 'rejected', version: Number(row.version) }
  })
  return { replay: out.replay, ...out.value }
}
