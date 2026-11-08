import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { parseLines } from './repairOrders'
import type { UnitOfWork } from './unitOfWork'

/*
 * Canned jobs (SCHEMA §7.1): the shop's job templates. A version is drafted, then published; a
 * published version never changes (trigger), and a job copies its lines when it is added, so
 * editing a template never touches a sent estimate. Templates carry no money of their own: the
 * matrix and the pinned rates price the copied lines.
 */

const KINDS = ['repair', 'maintenance', 'diagnosis', 'inspection', 'teardown', 'tire', 'sublet']
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export type CannedDraftInput = {
  cannedJobId?: string | null
  shopId?: string | null
  code?: string; name?: string; category?: string
  kind?: string; customerDescription?: string; notes?: string
  lines: unknown
}

/** Create a canned job with a draft, or replace the open draft of an existing one. */
export async function saveCannedJobDraft(uow: UnitOfWork, actor: Actor, input: CannedDraftInput) {
  const { tx } = uow
  const lines = parseLines(input.lines)
  if (!lines.length) throw new DomainError(Codes.INVALID_INPUT, 'A canned job needs at least one line.', { field: 'lines' })
  const kind = input.kind ?? 'repair'
  if (!KINDS.includes(kind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown job kind.', { field: 'kind' })
  // Stored as the line inputs (no refs; quantities and costs as entered).
  const stored = lines.map(l => Object.fromEntries(Object.entries(l).filter(([k, v]) => k !== 'ref' && v !== null && v !== undefined && v !== '' && v !== false).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])))
  const content = { kind, customerDescription: text(input.customerDescription, 1000), notes: text(input.notes, 1000), lines: stored as never, authorId: actorUserId(actor) }

  let jobId = input.cannedJobId ?? null
  if (!jobId) {
    const code = text(input.code, 40).toUpperCase().replace(/[^A-Z0-9-]/g, '-')
    const name = text(input.name, 120)
    if (!code || !name) throw new DomainError(Codes.INVALID_INPUT, 'Give the canned job a code and a name.', { field: !code ? 'code' : 'name' })
    const clash = await tx.cannedJob.findFirst({ where: { code, shopId: input.shopId ?? null }, select: { id: true } })
    if (clash) throw new DomainError(Codes.DUPLICATE, `${code} already exists.`, { existingId: clash.id })
    const head = await tx.cannedJob.create({ data: { code, name, category: text(input.category, 40), shopId: input.shopId ?? null, active: true } })
    jobId = head.id
    auditCreate(uow, actor, 'CannedJob', head.id, 'canned_job.created', { code, name })
  } else {
    await lockRow(tx, 'CannedJob', jobId)
    if (input.name !== undefined || input.category !== undefined) {
      const name = text(input.name, 120)
      if (input.name !== undefined && !name) throw new DomainError(Codes.INVALID_INPUT, 'Give the canned job a name.', { field: 'name' })
      await tx.cannedJob.update({ where: { id: jobId }, data: { ...(input.name !== undefined ? { name } : {}), ...(input.category !== undefined ? { category: text(input.category, 40) } : {}) } })
    }
  }
  const draft = await tx.cannedJobVersion.findFirst({ where: { cannedJobId: jobId, status: 'draft' } })
  if (draft) {
    await tx.cannedJobVersion.update({ where: { id: draft.id }, data: { ...content, version: { increment: 1 } } })
    auditCreate(uow, actor, 'CannedJobVersion', draft.id, 'canned_job.draft_saved', { versionNumber: draft.versionNumber, lines: stored.length })
    return { cannedJobId: jobId, versionId: draft.id, versionNumber: draft.versionNumber, status: 'draft' }
  }
  const last = await tx.cannedJobVersion.findFirst({ where: { cannedJobId: jobId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } })
  const row = await tx.cannedJobVersion.create({ data: { cannedJobId: jobId, versionNumber: (last?.versionNumber ?? 0) + 1, status: 'draft', ...content } })
  auditCreate(uow, actor, 'CannedJobVersion', row.id, 'canned_job.draft_created', { versionNumber: row.versionNumber, lines: stored.length })
  return { cannedJobId: jobId, versionId: row.id, versionNumber: row.versionNumber, status: 'draft' }
}

/** Publish the draft: the previous published version is retired, and new jobs copy this one. */
export async function publishCannedJob(uow: UnitOfWork, actor: Actor, input: { versionId: string; expectedVersion: number }) {
  const { tx, now } = uow
  const row = await lockRow<any>(tx, 'CannedJobVersion', input.versionId)
  if (row.status !== 'draft') throw new DomainError(Codes.INVALID_TRANSITION, 'Only a draft can be published.', { currentStatus: row.status })
  if (row.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The draft changed since you loaded it. Reload and try again.', { currentVersion: row.version })
  parseLines(row.lines)
  await lockRow(tx, 'CannedJob', row.cannedJobId)
  const previous = await tx.cannedJobVersion.findFirst({ where: { cannedJobId: row.cannedJobId, status: 'published' }, select: { id: true } })
  if (previous) await tx.cannedJobVersion.update({ where: { id: previous.id }, data: { status: 'retired', retiredAt: now, version: { increment: 1 } } })
  await tx.cannedJobVersion.update({ where: { id: row.id }, data: { status: 'published', publishedAt: now, publishedById: actorUserId(actor), version: { increment: 1 } } })
  await tx.cannedJob.update({ where: { id: row.cannedJobId }, data: { currentVersionId: row.id } })
  auditCreate(uow, actor, 'CannedJobVersion', row.id, 'canned_job.published', { versionNumber: row.versionNumber, retired: previous?.id ?? null })
  return { id: row.id, status: 'published', versionNumber: row.versionNumber }
}

export async function setCannedJobActive(uow: UnitOfWork, actor: Actor, input: { cannedJobId: string; active: boolean }) {
  const row = await lockRow<any>(uow.tx, 'CannedJob', input.cannedJobId)
  if (row.active === input.active) return { id: row.id, active: row.active }
  await uow.tx.cannedJob.update({ where: { id: row.id }, data: { active: input.active } })
  auditCreate(uow, actor, 'CannedJob', row.id, input.active ? 'canned_job.activated' : 'canned_job.deactivated', { code: row.code })
  return { id: row.id, active: input.active }
}
