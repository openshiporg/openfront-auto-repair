import { SOURCE_KINDS } from '../agents/constants'
import { actorAgentId, actorUserId, can, isMachine, type Actor } from './actor'
import { auditCreate, lockRow, transition } from './cas'
import { Codes, DomainError } from './errors'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Diagnosis sessions (STATE-MACHINES §7). open → testing → quote_ready | inconclusive → closed.
 * The trust gate: a diagnosis-based job can be quoted only when a test confirms the top hypothesis,
 * its confidence is at or above the shop's threshold (default 0.70) and the job addresses that hypothesis.
 * A lead technician or advisor can override with a reason. An agent never can.
 */

const text = (v: unknown, field: string, max: number, required = true) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (required && !s) throw new DomainError(Codes.INVALID_INPUT, `${field} is required.`, { field })
  if (s.length > max) throw new DomainError(Codes.INVALID_INPUT, `${field} is too long.`, { field })
  return s
}
const idOf = (v: unknown, what: string) => {
  if (typeof v !== 'string' || !v || v.length > 64) throw new DomainError(Codes.INVALID_INPUT, `Choose ${what}.`)
  return v
}
const SOURCE_SET = new Set<string>(SOURCE_KINDS)

/** Confidence is a fraction 0..1 held to four places. */
export function parseConfidence(value: unknown) {
  const bad = () => new DomainError(Codes.INVALID_INPUT, 'Confidence is a number from 0 to 1.', { field: 'confidence' })
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!/^\d(\.\d{1,4})?$/.test(text)) throw bad()
  const bp = basisPoints(text)
  if (bp > 10000) throw bad()
  return fraction(bp)
}

/** A decimal string such as "0.7" as whole basis points (7000), with no float arithmetic. */
export function basisPoints(value: unknown): number {
  const [whole = '0', part = ''] = String(value ?? '0').split('.')
  return parseInt(whole, 10) * 10000 + parseInt((part + '0000').slice(0, 4), 10)
}
/** Basis points back to a four-place decimal string. */
const fraction = (bp: number) => `${Math.floor(bp / 10000)}.${String(bp % 10000).padStart(4, '0')}`
const hundredths = (bp: number) => `${Math.floor(bp / 10000)}.${String(Math.round((bp % 10000) / 100)).padStart(2, '0')}`

export type SourceInput = { sourceKind: string; title: string; url?: string; licensedProvider?: string }
export function parseSources(value: unknown): SourceInput[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw new DomainError(Codes.INVALID_INPUT, 'Add at least one source for this cause (a service manual, a bulletin, shop history).', { field: 'sources' })
  return value.map((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>
    const kind = String(s.sourceKind ?? '')
    if (!SOURCE_SET.has(kind)) throw new DomainError(Codes.INVALID_INPUT, `Source ${i + 1}: choose where it came from.`, { field: 'sources' })
    return { sourceKind: kind, title: text(s.title, `Source ${i + 1} title`, 200), ...(s.url ? { url: text(s.url, 'Source link', 500) } : {}), ...(s.licensedProvider ? { licensedProvider: text(s.licensedProvider, 'Provider', 80) } : {}) }
  })
}

export async function trustThreshold(tx: Tx, shopId: string | null) {
  if (!shopId) return 0.7
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { shopPolicyId: true } })
  const policy = shop?.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId }, select: { diagnosisTrustThreshold: true } }) : null
  return policy?.diagnosisTrustThreshold != null ? basisPoints(policy.diagnosisTrustThreshold.toString()) / 10000 : 0.7
}

export type StartInput = { repairOrderId: string; concernId: string; jobId: string; symptoms?: unknown; dtcs?: unknown; summary?: string }

/** A session needs a concern and an authorized diagnosis job (the customer agreed to pay for finding the cause). */
export async function startDiagnosis(uow: UnitOfWork, actor: Actor, input: StartInput, agentRunId?: string | null) {
  const { tx } = uow
  const ro = await tx.repairOrder.findUnique({ where: { id: idOf(input.repairOrderId, 'a repair order') }, select: { id: true, shopId: true, status: true } })
  if (!ro) throw new DomainError(Codes.NOT_FOUND, 'Repair order not found.')
  const concern = await tx.concern.findUnique({ where: { id: idOf(input.concernId, 'a concern') }, select: { id: true, repairOrderId: true, customerWords: true } })
  if (!concern || concern.repairOrderId !== ro.id) throw new DomainError(Codes.NOT_FOUND, 'That concern is not on this repair order.', { field: 'concernId' })
  const job = await tx.job.findUnique({ where: { id: idOf(input.jobId, 'the diagnosis job') }, select: { id: true, repairOrderId: true, kind: true, status: true } })
  if (!job || job.repairOrderId !== ro.id) throw new DomainError(Codes.NOT_FOUND, 'That job is not on this repair order.', { field: 'jobId' })
  if (job.kind !== 'diagnosis') throw new DomainError(Codes.GUARD_FAILED, 'A diagnosis starts from a diagnosis job.', { field: 'jobId' })
  if (!['authorized', 'in_progress'].includes(job.status)) throw new DomainError(Codes.GUARD_FAILED, 'The customer has to authorize the diagnosis job before it starts.', { currentStatus: job.status })
  const open = await tx.diagnosisSession.count({ where: { diagnosisJobId: job.id, status: { in: ['open', 'testing'] } } })
  if (open) throw new DomainError(Codes.DUPLICATE, 'This diagnosis job already has a session open.')
  const symptoms = Array.isArray(input.symptoms) ? input.symptoms.slice(0, 20).map(s => text(s, 'Symptom', 300)) : []
  const dtcs = Array.isArray(input.dtcs) ? input.dtcs.slice(0, 30).map(s => text(s, 'Trouble code', 12).toUpperCase()) : []
  const session = await tx.diagnosisSession.create({
    data: {
      shopId: ro.shopId, repairOrderId: ro.id, concernId: concern.id, diagnosisJobId: job.id, summary: input.summary ? text(input.summary, 'Summary', 200) : concern.customerWords.slice(0, 200),
      symptoms: symptoms as never, dtcs: dtcs as never, openedById: actorUserId(actor), status: 'open',
    } as never,
  })
  auditCreate(uow, actor, 'DiagnosisSession', session.id, 'diagnosis.started', { repairOrderId: ro.id, jobId: job.id, agentRunId: agentRunId ?? null })
  return { id: session.id, status: 'open' }
}

async function rerank(tx: Tx, sessionId: string) {
  const all = await tx.diagnosisHypothesis.findMany({ where: { sessionId, status: { not: 'ruled_out' } }, orderBy: [{ confidence: 'desc' }, { createdAt: 'asc' }] })
  for (const [i, h] of all.entries()) if (h.rank !== i + 1) await tx.diagnosisHypothesis.update({ where: { id: h.id }, data: { rank: i + 1 } })
  const top = all[0] ?? null
  await tx.diagnosisSession.update({ where: { id: sessionId }, data: { topHypothesisId: top?.id ?? null, confidence: top ? top.confidence : '0.0000' } })
  return top
}

async function liveSession(tx: Tx, id: unknown, states = ['open', 'testing']) {
  const s = await lockRow<Record<string, any>>(tx, 'DiagnosisSession', idOf(id, 'a diagnosis session'))
  if (!states.includes(s.status)) throw new DomainError(Codes.INVALID_TRANSITION, `A diagnosis that is ${String(s.status).replace(/_/g, ' ')} cannot take changes.`, { currentStatus: s.status })
  return s
}

export type HypothesisInput = { sessionId: string; cause: string; confidence: unknown; evidence?: unknown; sources: unknown }
export async function addHypothesis(uow: UnitOfWork, actor: Actor, input: HypothesisInput, agentRunId?: string | null) {
  const { tx } = uow
  const session = await liveSession(tx, input.sessionId)
  const evidence = Array.isArray(input.evidence) ? input.evidence.slice(0, 20).map(e => ({ kind: text((e as any)?.kind ?? 'note', 'Evidence kind', 30), ref: text((e as any)?.ref ?? '', 'Evidence reference', 120, false), excerpt: text((e as any)?.excerpt ?? '', 'Evidence', 400, false) })) : []
  const h = await tx.diagnosisHypothesis.create({
    data: { sessionId: session.id, cause: text(input.cause, 'Cause', 300), confidence: parseConfidence(input.confidence), evidence: evidence as never, sources: parseSources(input.sources) as never, agentRunId: agentRunId ?? null, enteredById: actorUserId(actor), origin: isMachine(actor) || agentRunId ? 'agent' : 'staff', status: 'active' } as never,
  })
  await rerank(tx, session.id)
  await tx.diagnosisSession.update({ where: { id: session.id }, data: { version: { increment: 1 } } })
  auditCreate(uow, actor, 'DiagnosisHypothesis', h.id, 'diagnosis.hypothesis_added', { sessionId: session.id, confidence: h.confidence, sourceKinds: parseSources(input.sources).map(s => s.sourceKind), agentRunId: agentRunId ?? null })
  return { id: h.id }
}

export type TestInput = { sessionId: string; hypothesisId?: string | null; procedure: string; expected?: string; result: string; outcome: string }
/** The technician records what the test showed. An assistant may draft this, but a person confirms it and is named as the one who did it. */
export async function recordDiagnosticTest(uow: UnitOfWork, actor: Actor, input: TestInput) {
  const { tx } = uow
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'A person records what the test showed.')
  if (!can(actor, 'canDiagnose')) throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs the canDiagnose permission.')
  if (!['confirms', 'refutes', 'inconclusive'].includes(input.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Choose confirms, refutes or inconclusive.', { field: 'outcome' })
  const session = await liveSession(tx, input.sessionId)
  let hypothesis: { id: string; sessionId: string | null } | null = null
  if (input.hypothesisId) {
    hypothesis = await tx.diagnosisHypothesis.findUnique({ where: { id: idOf(input.hypothesisId, 'a cause') }, select: { id: true, sessionId: true } })
    if (!hypothesis || hypothesis.sessionId !== session.id) throw new DomainError(Codes.NOT_FOUND, 'That cause is not part of this diagnosis.', { field: 'hypothesisId' })
  } else if (input.outcome !== 'inconclusive') throw new DomainError(Codes.INVALID_INPUT, 'Say which cause this test is about.', { field: 'hypothesisId' })
  const t = await tx.diagnosisTest.create({
    data: { sessionId: session.id, hypothesisId: hypothesis?.id ?? null, procedure: text(input.procedure, 'Procedure', 400), expected: text(input.expected ?? '', 'Expected result', 400, false), result: text(input.result, 'Result', 600), outcome: input.outcome, performedById: actor.userId, at: uow.now } as never,
  })
  if (hypothesis && input.outcome === 'confirms') await tx.diagnosisHypothesis.update({ where: { id: hypothesis.id }, data: { status: 'confirmed' } })
  if (hypothesis && input.outcome === 'refutes') await tx.diagnosisHypothesis.update({ where: { id: hypothesis.id }, data: { status: 'ruled_out' } })
  await rerank(tx, session.id)
  await tx.diagnosisSession.update({ where: { id: session.id }, data: { ...(session.status === 'open' ? { status: 'testing' } : {}), version: { increment: 1 } } })
  auditCreate(uow, actor, 'DiagnosisTest', t.id, 'diagnosis.test_recorded', { sessionId: session.id, outcome: input.outcome })
  return { id: t.id, status: session.status === 'open' ? 'testing' : session.status }
}

export type GateResult = { ok: boolean; reason: string | null; topId: string | null; confidence: number; threshold: number; confirmed: boolean }

/** The trust gate, computed from the records (no writes). */
export async function trustGate(tx: Tx, sessionId: string, jobId?: string | null): Promise<GateResult> {
  const session = await tx.diagnosisSession.findUnique({ where: { id: sessionId }, select: { shopId: true, topHypothesisId: true } })
  if (!session) throw new DomainError(Codes.NOT_FOUND, 'Diagnosis not found.')
  const threshold = await trustThreshold(tx, session.shopId)
  const top = session.topHypothesisId ? await tx.diagnosisHypothesis.findUnique({ where: { id: session.topHypothesisId } }) : null
  if (!top) return { ok: false, reason: 'Add a likely cause first.', topId: null, confidence: 0, threshold, confirmed: false }
  const confidenceBp = basisPoints(top.confidence.toString())
  const thresholdBp = Math.round(threshold * 10000)
  const confidence = confidenceBp / 10000
  const confirmed = (await tx.diagnosisTest.count({ where: { sessionId, hypothesisId: top.id, outcome: 'confirms' } })) > 0
  const addresses = jobId ? (await tx.job.findUnique({ where: { id: jobId }, select: { addressesHypothesisId: true } }))?.addressesHypothesisId === top.id : true
  const reason = !confirmed ? 'No test has confirmed the most likely cause yet.' : confidenceBp < thresholdBp ? `Confidence is ${hundredths(confidenceBp)}; this shop needs ${hundredths(thresholdBp)} before quoting.` : !addresses ? 'The repair job does not address the most likely cause.' : null
  return { ok: reason === null, reason, topId: top.id, confidence, threshold, confirmed }
}

export type ReadyInput = { sessionId: string; repairJobId: string; expectedVersion: number; overrideReason?: string | null }
/** testing → quote_ready. The repair job is linked to the top cause here. */
export async function markQuoteReady(uow: UnitOfWork, actor: Actor, input: ReadyInput) {
  const { tx } = uow
  if (actor.kind !== 'user' || isMachine(actor)) throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'A person marks a diagnosis ready to quote.')
  if (!can(actor, 'canDiagnose') && !can(actor, 'canOverrideTrustGate')) throw new DomainError(Codes.NOT_AUTHORIZED, 'This needs the canDiagnose permission.')
  const session = await liveSession(tx, input.sessionId, ['testing'])
  const job = await tx.job.findUnique({ where: { id: idOf(input.repairJobId, 'the repair job') }, select: { id: true, repairOrderId: true, kind: true } })
  if (!job || job.repairOrderId !== session.repairOrderId) throw new DomainError(Codes.NOT_FOUND, 'That job is not on this repair order.', { field: 'repairJobId' })
  const first = await trustGate(tx, session.id, null)
  if (first.topId && !first.reason?.startsWith('Add')) await tx.job.update({ where: { id: job.id }, data: { addressesHypothesisId: first.topId } })
  const gate = await trustGate(tx, session.id, job.id)
  const reason = typeof input.overrideReason === 'string' ? input.overrideReason.trim() : ''
  let override: Record<string, unknown> | null = null
  if (!gate.ok) {
    if (!reason) throw new DomainError(Codes.GUARD_FAILED, `${gate.reason} A lead technician or advisor can override with a reason.`, { reason: gate.reason ?? '' })
    if (!can(actor, 'canOverrideTrustGate')) throw new DomainError(Codes.NOT_AUTHORIZED, 'Only a lead technician or advisor can override the diagnosis check.')
    if (!gate.topId) throw new DomainError(Codes.GUARD_FAILED, 'Add a likely cause before overriding.')
    override = { by: actor.userId, reason: text(reason, 'Reason', 400), at: uow.now.toISOString(), threshold: gate.threshold, confidence: gate.confidence, confirmed: gate.confirmed }
    await tx.job.update({ where: { id: job.id }, data: { addressesHypothesisId: gate.topId } })
  }
  const row = await transition(uow, {
    model: 'DiagnosisSession', id: session.id, from: ['testing'], to: 'quote_ready', expectedVersion: input.expectedVersion, actor, eventType: 'diagnosis.quote_ready',
    data: { override: override as never }, reason: override ? String(override.reason) : null,
  })
  return { id: session.id, status: String(row.status), overridden: Boolean(override), version: Number(row.version) }
}

export async function markInconclusive(uow: UnitOfWork, actor: Actor, input: { sessionId: string; expectedVersion: number; note?: string }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'A person closes out a diagnosis.')
  const row = await transition(uow, { model: 'DiagnosisSession', id: idOf(input.sessionId, 'a diagnosis session'), from: ['open', 'testing'], to: 'inconclusive', expectedVersion: input.expectedVersion, actor, eventType: 'diagnosis.inconclusive', reason: input.note ?? null })
  return { id: String(row.id), status: 'inconclusive', version: Number(row.version) }
}

export async function closeDiagnosis(uow: UnitOfWork, actor: Actor, input: { sessionId: string; expectedVersion: number }) {
  if (actor.kind !== 'user') throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, 'A person closes a diagnosis.')
  const row = await transition(uow, { model: 'DiagnosisSession', id: idOf(input.sessionId, 'a diagnosis session'), from: ['quote_ready', 'inconclusive'], to: 'closed', expectedVersion: input.expectedVersion, actor, eventType: 'diagnosis.closed' })
  return { id: String(row.id), status: 'closed', version: Number(row.version) }
}

/**
 * SM§7: a repair job that rests on a diagnosis (it addresses one of its causes, or it answers a concern that is being
 * diagnosed) can be priced or put on an estimate only once that diagnosis cleared the trust gate: quote_ready with the
 * gate met, or a person's recorded override (who and why). Called by writeAndPrice and issueEstimate, for every actor.
 */
export async function assertDiagnosisCleared(tx: Tx, jobIds: string[]) {
  if (!jobIds.length) return
  // One round trip: for each non-diagnosis job, the session it addresses and the latest session on its concern
  // (an inconclusive diagnosis is followed by a new session, so the newest one counts).
  const rows = await tx.$queryRaw<{ title: string; id: string; status: string; override: unknown }[]>`
    SELECT j.title, ds.id, ds.status, ds.override
    FROM "Job" j
    JOIN "DiagnosisSession" ds ON ds.id IN (
      (SELECT h.session FROM "DiagnosisHypothesis" h WHERE h.id = j."addressesHypothesis"),
      (SELECT d2.id FROM "DiagnosisSession" d2 WHERE d2.concern = j.concern ORDER BY d2."createdAt" DESC LIMIT 1)
    )
    WHERE j.id = ANY(${jobIds}::text[]) AND j.kind <> 'diagnosis'`
  for (const s of rows) {
    const override = (s.override ?? null) as { by?: string; reason?: string } | null
    const ready = ['quote_ready', 'closed'].includes(s.status)
    // A person's recorded override (who and why) clears it; otherwise the gate itself must hold.
    if (ready && override?.by && override.reason) continue
    if (ready) {
      const gate = await trustGate(tx, s.id, null)
      if (gate.ok) continue
      throw new DomainError(Codes.TRUST_GATE, `"${s.title}" rests on a diagnosis that has not cleared: ${gate.reason}`, { sessionId: s.id, reason: gate.reason ?? '' })
    }
    throw new DomainError(Codes.TRUST_GATE, `"${s.title}" rests on a diagnosis that is not ready to quote. Confirm the cause (or a lead technician or advisor overrides with a reason) first.`, { sessionId: s.id, currentStatus: s.status })
  }
}

export const agentIdForRun = actorAgentId
