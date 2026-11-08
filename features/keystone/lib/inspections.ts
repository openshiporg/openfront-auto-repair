import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { addJob, assertOpen, markInService } from './repairOrders'
import { createAccessToken } from './publicTokens'
import { currentConsent } from './customers'
import type { UnitOfWork } from './unitOfWork'

/*
 * Digital vehicle inspection (STATE-MACHINES §6, SCHEMA §6). A template version is pinned; each
 * item's condition is derived from its measurements; a technician may override with a reason.
 * Completing the inspection turns red and yellow findings into draft jobs from the mapped canned
 * job, so the photo sits beside the price on the estimate.
 */

export type Condition = 'green' | 'yellow' | 'red'
export type MeasurementSpec = { unit: string; positions?: string[]; thresholds: { max?: number; min?: number; condition: Condition }[] }
const RANK: Record<string, number> = { green: 1, yellow: 2, red: 3 }

/** The worst condition over the measured values: each value takes the first threshold it meets, else green. */
export function deriveCondition(spec: MeasurementSpec | null | undefined, values: { position?: string; value: number }[]): Condition | null {
  if (!spec || !values.length) return null
  let worst: Condition = 'green'
  for (const { value } of values) {
    const hit = spec.thresholds.find(t => (t.max === undefined || value <= t.max) && (t.min === undefined || value >= t.min))
    const c = hit?.condition ?? 'green'
    if (RANK[c] > RANK[worst]) worst = c
  }
  return worst
}

export async function createInspection(uow: UnitOfWork, actor: Actor, input: { repairOrderId: string; templateId: string; technicianId?: string | null }) {
  const { tx } = uow
  const ro = await lockRow<any>(tx, 'RepairOrder', input.repairOrderId)
  await assertOpen(tx, ro.id)
  const version = await tx.inspectionTemplateVersion.findFirst({ where: { templateId: input.templateId, status: 'published' }, orderBy: { versionNumber: 'desc' }, include: { items: true } })
  if (!version) throw new DomainError(Codes.NOT_FOUND, 'That inspection template has no published version.')
  const open = await tx.inspection.findFirst({ where: { repairOrderId: ro.id, templateVersion: { templateId: input.templateId }, status: { in: ['assigned', 'in_progress'] } }, select: { id: true } })
  if (open) throw new DomainError(Codes.DUPLICATE, 'This inspection is already open on the repair order.', { existingId: open.id })
  const technicianId = input.technicianId ?? actorUserId(actor)
  const row = await tx.inspection.create({ data: { repairOrderId: ro.id, templateVersionId: version.id, technicianId, status: 'assigned' } })
  for (const item of version.items) await tx.inspectionItemResult.create({ data: { inspectionId: row.id, templateItemId: item.id, condition: 'not_inspected' } })
  auditCreate(uow, actor, 'Inspection', row.id, 'inspection.created', { repairOrderId: ro.id, templateVersionId: version.id, technicianId, items: version.items.length })
  return { id: row.id, items: version.items.length }
}

export async function startInspection(uow: UnitOfWork, actor: Actor, input: { inspectionId: string; expectedVersion: number }) {
  const row = await transition(uow, { model: 'Inspection', id: input.inspectionId, from: ['assigned'], to: 'in_progress', expectedVersion: input.expectedVersion, actor, eventType: 'inspection.started', data: { startedAt: uow.now } })
  await assertOpen(uow.tx, String(row.repairOrderId))
  await markInService(uow, actor, String(row.repairOrderId), 'inspection')
  return { id: input.inspectionId, status: 'in_progress' }
}

export type ItemResultInput = { resultId: string; expectedVersion: number; condition?: string | null; measurements?: { position?: string; value: number }[] | null; notes?: string | null; overrideReason?: string | null }

export async function recordItemResult(uow: UnitOfWork, actor: Actor, input: ItemResultInput) {
  const { tx, now } = uow
  const result = await lockRow<any>(tx, 'InspectionItemResult', input.resultId)
  if (result.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This item changed since you loaded it. Reload and try again.', { currentVersion: result.version })
  const inspection = await tx.inspection.findUniqueOrThrow({ where: { id: result.inspectionId } })
  if (inspection.status !== 'in_progress') throw new DomainError(Codes.INVALID_TRANSITION, `The inspection is ${inspection.status.replaceAll('_', ' ')}. Start it first.`, { currentStatus: inspection.status })
  const item = await tx.inspectionTemplateItem.findUniqueOrThrow({ where: { id: result.templateItemId } })
  const spec = (item.measurement ?? null) as MeasurementSpec | null
  const measurements = (input.measurements ?? []).slice(0, 8).map(m => {
    if (!Number.isSafeInteger(m?.value) || m.value < 0 || m.value > 100_000) throw new DomainError(Codes.INVALID_INPUT, `Measurements are whole ${spec?.unit ?? 'units'}.`, { field: 'measurements' })
    const position = m.position ? String(m.position).slice(0, 20) : undefined
    if (position && spec?.positions?.length && !spec.positions.includes(position)) throw new DomainError(Codes.INVALID_INPUT, `Unknown position ${position}.`, { field: 'measurements' })
    return { position, value: m.value, unit: spec?.unit ?? '' }
  })
  if (measurements.length && !spec) throw new DomainError(Codes.INVALID_INPUT, 'This item takes no measurements.', { field: 'measurements' })
  const derived = deriveCondition(spec, measurements)
  const chosen = (input.condition ?? derived ?? null) as string | null
  if (!chosen || !['green', 'yellow', 'red', 'na'].includes(chosen)) throw new DomainError(Codes.INVALID_INPUT, 'Choose green, yellow, red or not applicable.', { field: 'condition' })
  const overrideReason = String(input.overrideReason ?? '').trim().slice(0, 300)
  if (derived && chosen !== derived && !overrideReason) throw new DomainError(Codes.INVALID_INPUT, `The measurements say ${derived}. Give a reason to mark it ${chosen}.`, { field: 'overrideReason' })
  await tx.inspectionItemResult.update({
    where: { id: result.id },
    data: { condition: chosen, derivedCondition: derived ?? 'none', overrideReason: derived && chosen !== derived ? overrideReason : '', measurements: measurements as never, notes: String(input.notes ?? '').slice(0, 1000), recordedById: actorUserId(actor), recordedAt: now, version: { increment: 1 } },
  })
  auditCreate(uow, actor, 'InspectionItemResult', result.id, 'inspection.item_recorded', { code: item.code, condition: chosen, derived, measurements: measurements.length, override: Boolean(derived && chosen !== derived) })
  return { id: result.id, condition: chosen, derivedCondition: derived, version: result.version + 1 }
}

export async function attachMedia(uow: UnitOfWork, actor: Actor, input: { resultId: string; documentId: string }) {
  const { tx } = uow
  const result = await lockRow<any>(tx, 'InspectionItemResult', input.resultId)
  const inspection = await tx.inspection.findUniqueOrThrow({ where: { id: result.inspectionId }, include: { repairOrder: { select: { shopId: true } } } })
  if (!['in_progress', 'completed'].includes(inspection.status)) throw new DomainError(Codes.INVALID_TRANSITION, 'Photos can be added while the inspection is open.', { currentStatus: inspection.status })
  const doc = await tx.document.findUnique({ where: { id: input.documentId } })
  if (!doc || !['inspection_photo', 'inspection_video'].includes(doc.kind) || doc.shopId !== inspection.repairOrder?.shopId) throw new DomainError(Codes.NOT_FOUND, 'Photo not found.')
  await tx.inspectionItemResult.update({ where: { id: result.id }, data: { media: { connect: { id: doc.id } }, version: { increment: 1 } } })
  auditCreate(uow, actor, 'InspectionItemResult', result.id, 'inspection.media_attached', { documentId: doc.id, sha256: doc.sha256 })
  return { id: result.id, documentId: doc.id }
}

/** A photo already in storage becomes a Document on the shop and is attached to the item, in one step. */
export async function addInspectionPhoto(uow: UnitOfWork, actor: Actor, input: { resultId: string; storageKey: string; sha256: string; mimeType: string; bytes: number }) {
  const { tx } = uow
  const result = await tx.inspectionItemResult.findUnique({ where: { id: input.resultId }, include: { templateItem: { select: { label: true } }, inspection: { select: { repairOrder: { select: { shopId: true } } } } } })
  if (!result) throw new DomainError(Codes.NOT_FOUND, 'Inspection item not found.')
  const doc = await tx.document.create({ data: { shopId: result.inspection!.repairOrder!.shopId, title: `${result.templateItem?.label ?? 'Inspection'} (photo)`, kind: 'inspection_photo', visibility: 'customer_link', storageKey: input.storageKey, sha256: input.sha256, mimeType: input.mimeType, bytes: input.bytes } })
  auditCreate(uow, actor, 'Document', doc.id, 'document.uploaded', { kind: 'inspection_photo', sha256: input.sha256, bytes: input.bytes })
  return attachMedia(uow, actor, { resultId: input.resultId, documentId: doc.id })
}

/** in_progress → completed; findings become draft jobs (SM§6). */
export async function completeInspection(uow: UnitOfWork, actor: Actor, input: { inspectionId: string; expectedVersion: number }) {
  const { tx } = uow
  const inspection = await tx.inspection.findUniqueOrThrow({ where: { id: input.inspectionId }, include: { results: { include: { templateItem: true, media: { select: { id: true } } } } } })
  const problems: string[] = []
  for (const r of inspection.results) {
    const item = r.templateItem!
    if (item.required && r.condition === 'not_inspected') problems.push(`${item.label}: not inspected`)
    const photoOn = Array.isArray(item.photoRequiredOn) ? (item.photoRequiredOn as string[]) : []
    if (photoOn.includes(r.condition) && !r.media.length) problems.push(`${item.label}: a photo is required for ${r.condition}`)
  }
  if (problems.length) throw new DomainError(Codes.GUARD_FAILED, `Finish the inspection first: ${problems.slice(0, 4).join('; ')}${problems.length > 4 ? '…' : ''}`, { problems })
  await transition(uow, { model: 'Inspection', id: input.inspectionId, from: ['in_progress'], to: 'completed', expectedVersion: input.expectedVersion, actor, eventType: 'inspection.completed', data: { completedAt: uow.now } })

  const ro = await tx.repairOrder.findUniqueOrThrow({ where: { id: inspection.repairOrderId! }, select: { id: true, shopId: true } })
  const jobs: string[] = []
  for (const r of inspection.results.filter(x => (x.condition === 'red' || x.condition === 'yellow') && x.templateItem?.cannedJobCode)) {
    const canned = await tx.cannedJob.findFirst({ where: { code: r.templateItem!.cannedJobCode, active: true, OR: [{ shopId: ro.shopId }, { shopId: null }] }, orderBy: { shopId: 'asc' } })
    if (!canned) continue
    const already = await tx.job.findFirst({ where: { repairOrderId: ro.id, inspectionItemResultId: r.id }, select: { id: true } })
    if (already) continue
    const job = await addJob(uow, actor, { repairOrderId: ro.id, title: canned.name, cannedJobId: canned.id, inspectionItemResultId: r.id, source: 'inspection_finding', urgency: r.condition as 'red' | 'yellow' })
    jobs.push(job.id)
  }
  return { id: input.inspectionId, status: 'completed', proposedJobs: jobs }
}

/**
 * completed → sent: a view link for the customer. The raw token is returned once to the advisor;
 * only its hash is stored. Sending through SMS or email needs transactional consent (I-V4).
 */
export async function sendInspection(uow: UnitOfWork, actor: Actor, input: { inspectionId: string; expectedVersion: number; channel: 'sms' | 'email' | 'in_person'; contactId?: string | null }) {
  const { tx, now } = uow
  const inspection = await tx.inspection.findUniqueOrThrow({ where: { id: input.inspectionId }, include: { repairOrder: { select: { id: true, shopId: true, customerId: true, shopPolicyVersionId: true } } } })
  if (input.channel !== 'in_person') await requireTransactionalConsent(uow, inspection.repairOrder!.customerId!, input.contactId ?? null, input.channel)
  await transition(uow, { model: 'Inspection', id: input.inspectionId, from: ['completed'], to: 'sent', expectedVersion: input.expectedVersion, actor, eventType: 'inspection.sent', metadata: { channel: input.channel }, data: { sentAt: now } })
  const policy = inspection.repairOrder!.shopPolicyVersionId ? await tx.shopPolicyVersion.findUnique({ where: { id: inspection.repairOrder!.shopPolicyVersionId }, select: { authorizationLinkTtlHours: true } }) : null
  const { id: tokenId, expiresAt } = await createAccessToken(uow, { purpose: 'inspection', subjectType: 'Inspection', subjectId: inspection.id, shopId: inspection.repairOrder!.shopId!, ttlHours: policy?.authorizationLinkTtlHours ?? 72, maxUses: 50 })
  uow.emit({ topic: 'inspection.sent', aggregateType: 'Inspection', aggregateId: inspection.id, payload: { repairOrderId: inspection.repairOrderId, channel: input.channel }, dedupeKey: `inspection.sent:${inspection.id}` })
  return { id: inspection.id, status: 'sent', tokenId, expiresAt: expiresAt.toISOString() }
}

/** The contact must belong to the customer and have a current transactional grant for the channel. */
export async function requireTransactionalConsent(uow: UnitOfWork, customerId: string, contactId: string | null, channel: 'sms' | 'email') {
  const kinds = channel === 'sms' ? ['mobile'] : ['email']
  const contacts = await uow.tx.customerContact.findMany({ where: { customerId, status: 'active', kind: { in: kinds }, ...(contactId ? { id: contactId } : {}) }, include: { consents: true }, orderBy: { isPrimary: 'desc' } })
  for (const c of contacts) {
    const state = currentConsent(c.consents.map(e => ({ channel: e.channel, purpose: e.purpose, action: e.action, at: e.at })))
    if (state[`${channel}:transactional`] === 'granted') return c
  }
  throw new DomainError(Codes.CONSENT_BLOCKED, channel === 'sms' ? 'The customer has not agreed to service texts (or replied STOP). Use email or show it in person.' : 'The customer has no email with service consent. Use another channel.', { field: 'channel' })
}
