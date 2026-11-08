import { actorFromSession, isMachine, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { DomainError, Codes } from '../lib/errors'
import { requireShop } from './phase1'
import { deriveToken } from '../lib/publicTokens'
import { addJob, completeJob, editJobLines, openRepairOrder, repriceJob, setHold, setJobLines, startJob, voidJob, type JobInput, type OpenInput } from '../lib/repairOrders'
import { attachMedia, completeInspection, createInspection, recordItemResult, sendInspection, startInspection, type ItemResultInput } from '../lib/inspections'
import { publishCannedJob, saveCannedJobDraft, setCannedJobActive, type CannedDraftInput } from '../lib/cannedJobs'
import { authorizationLink, closeStaffTask, createStaffTask, issueEstimate, recordAuthorization, requestAuthorization, type StaffAuthorizationInput } from '../lib/authorization'

type Ctx = { session: any; prisma: any }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

/** The shop of a repair order, checked against the caller's shops. */
async function roShop(context: Ctx, repairOrderId: unknown) {
  if (typeof repairOrderId !== 'string' || !repairOrderId) throw new DomainError(Codes.INVALID_INPUT, 'Choose a repair order.', { field: 'repairOrderId' })
  const row = await context.prisma.repairOrder.findUnique({ where: { id: repairOrderId }, select: { shopId: true } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Repair order not found.')
  return requireShop(context, row.shopId)
}
async function jobShop(context: Ctx, jobId: unknown) {
  const row = typeof jobId === 'string' ? await context.prisma.job.findUnique({ where: { id: jobId }, select: { repairOrderId: true } }) : null
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Job not found.')
  return roShop(context, row.repairOrderId)
}
async function estimateShop(context: Ctx, estimateVersionId: unknown) {
  const row = typeof estimateVersionId === 'string' ? await context.prisma.estimateVersion.findUnique({ where: { id: estimateVersionId }, select: { repairOrderId: true } }) : null
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Estimate not found.')
  return roShop(context, row.repairOrderId)
}
async function inspectionShop(context: Ctx, inspectionId: unknown) {
  const row = typeof inspectionId === 'string' ? await context.prisma.inspection.findUnique({ where: { id: inspectionId }, select: { repairOrderId: true } }) : null
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Inspection not found.')
  return roShop(context, row.repairOrderId)
}
async function resultShop(context: Ctx, resultId: unknown) {
  const row = typeof resultId === 'string' ? await context.prisma.inspectionItemResult.findUnique({ where: { id: resultId }, select: { inspectionId: true } }) : null
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Inspection item not found.')
  return inspectionShop(context, row.inspectionId)
}

// ── Repair orders and jobs ────────────────────────────────────────────────────

export async function openShopRepairOrder(_root: unknown, args: { input: OpenInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canWriteRepairOrders')
  const checkIn = typeof args.input?.checkInId === 'string' ? await context.prisma.checkIn.findUnique({ where: { id: args.input.checkInId }, select: { shopId: true } }) : null
  if (!checkIn) throw new DomainError(Codes.NOT_FOUND, 'Check-in not found.')
  requireShop(context, checkIn.shopId)
  return run(context, actor, 'ro.open', args.idempotencyKey, args.input, uow => openRepairOrder(uow, actor, args.input))
}

export async function holdRepairOrder(_root: unknown, args: { repairOrderId: string; expectedVersion: number; hold: boolean; reason?: string | null; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canWriteRepairOrders')
  await roShop(context, args.repairOrderId)
  return run(context, actor, args.hold ? 'ro.hold' : 'ro.resume', args.idempotencyKey, args, async uow => {
    await setHold(uow, actor, { repairOrderId: args.repairOrderId, expectedVersion: args.expectedVersion, hold: args.hold, reason: args.reason ?? undefined, note: args.note ?? undefined })
    return { id: args.repairOrderId, status: args.hold ? 'on_hold' : 'in_service' }
  })
}

export async function addRepairJob(_root: unknown, args: { input: JobInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canWriteRepairOrders', 'canPriceJobs')
  await roShop(context, args.input?.repairOrderId)
  // An assistant's job is a draft proposal: it is priced but a person reviews it before the estimate goes out.
  const input: JobInput = { ...args.input, source: isMachine(actor) ? 'agent' : args.input.source }
  return run(context, actor, 'job.add', args.idempotencyKey, args.input, uow => addJob(uow, actor, input))
}

export async function saveJobLines(_root: unknown, args: { jobId: string; expectedVersion: number; lines: unknown; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPriceJobs')
  await jobShop(context, args.jobId)
  return run(context, actor, 'job.lines', args.idempotencyKey, args, uow => setJobLines(uow, actor, args))
}

export async function editRepairJobLines(_root: unknown, args: { jobId: string; expectedVersion: number; add?: unknown; removeLineId?: string | null; choose?: { operationCode: string; variant: string } | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPriceJobs')
  // Choosing between labor-guide variants is a person's call (R§17.2).
  if (args.choose) requireHuman(actor, 'choose a labor-guide variant')
  await jobShop(context, args.jobId)
  return run(context, actor, 'job.lines_edit', args.idempotencyKey, args, uow => editJobLines(uow, actor, args))
}

export async function repriceRepairJob(_root: unknown, args: { jobId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPriceJobs')
  await jobShop(context, args.jobId)
  return run(context, actor, 'job.reprice', args.idempotencyKey, args, uow => repriceJob(uow, actor, args.jobId))
}

export async function transitionRepairJob(_root: unknown, args: { jobId: string; to: string; expectedVersion: number; reason?: string | null; cause?: string | null; correction?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  await jobShop(context, args.jobId)
  switch (args.to) {
    case 'in_progress':
      requirePermission(actor, 'canWriteRepairOrders', 'canClockSelf')
      return run(context, actor, 'job.start', args.idempotencyKey, args, uow => startJob(uow, actor, args))
    case 'completed':
      requirePermission(actor, 'canWriteRepairOrders', 'canClockSelf')
      return run(context, actor, 'job.complete', args.idempotencyKey, args, uow => completeJob(uow, actor, { ...args, cause: args.cause ?? '', correction: args.correction ?? '' }))
    case 'voided':
      requirePermission(actor, 'canWriteRepairOrders')
      return run(context, actor, 'job.void', args.idempotencyKey, args, uow => voidJob(uow, actor, { ...args, reason: args.reason ?? '' }))
    default:
      throw new DomainError(Codes.INVALID_INPUT, 'Choose start, complete or remove. Authorization is recorded from the estimate.', { field: 'to' })
  }
}

// ── Inspections ───────────────────────────────────────────────────────────────

export async function startShopInspection(_root: unknown, args: { repairOrderId: string; templateId: string; technicianId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPerformInspections')
  await roShop(context, args.repairOrderId)
  return run(context, actor, 'inspection.create', args.idempotencyKey, args, async uow => {
    const created = await createInspection(uow, actor, args)
    const row = await uow.tx.inspection.findUniqueOrThrow({ where: { id: created.id }, select: { version: true } })
    await startInspection(uow, actor, { inspectionId: created.id, expectedVersion: row.version })
    return { ...created, status: 'in_progress' }
  })
}

export async function recordInspectionItem(_root: unknown, args: { input: ItemResultInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPerformInspections')
  await resultShop(context, args.input?.resultId)
  return run(context, actor, 'inspection.item', args.idempotencyKey, args.input, uow => recordItemResult(uow, actor, args.input))
}

export async function attachInspectionMedia(_root: unknown, args: { resultId: string; documentId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPerformInspections')
  await resultShop(context, args.resultId)
  return run(context, actor, 'inspection.media', args.idempotencyKey, args, uow => attachMedia(uow, actor, args))
}

export async function completeShopInspection(_root: unknown, args: { inspectionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canPerformInspections')
  await inspectionShop(context, args.inspectionId)
  return run(context, actor, 'inspection.complete', args.idempotencyKey, args, uow => completeInspection(uow, actor, args))
}

export async function sendShopInspection(_root: unknown, args: { inspectionId: string; expectedVersion: number; channel: 'sms' | 'email' | 'in_person'; contactId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canMessageCustomers', 'canSendEstimates')
  await inspectionShop(context, args.inspectionId)
  const result = await run(context, actor, 'inspection.send', args.idempotencyKey, args, uow => sendInspection(uow, actor, args))
  const token = deriveToken('inspection', result.tokenId)
  return { id: result.id, status: result.status, replay: result.replay, expiresAt: result.expiresAt, token, path: `/api/public/inspections/${token}` }
}

// ── Estimates and authorization ───────────────────────────────────────────────

export async function sendRepairEstimate(_root: unknown, args: { repairOrderId: string; jobIds?: string[] | null; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canSendEstimates')
  await roShop(context, args.repairOrderId)
  return run(context, actor, 'estimate.issue', args.idempotencyKey, args, uow => issueEstimate(uow, actor, args))
}

export async function requestCustomerAuthorization(_root: unknown, args: { estimateVersionId: string; channel: 'sms' | 'email' | 'in_person' | 'phone_call'; contactId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canSendEstimates')
  await estimateShop(context, args.estimateVersionId)
  // The link is derived after the command, so the stored receipt never holds a working token.
  const result = await run(context, actor, 'authorization.request', args.idempotencyKey, args, uow => requestAuthorization(uow, actor, args))
  return { ...result, ...authorizationLink(result.id) }
}

/**
 * Staff record what the customer said: in person (signature), on the phone, or a written form.
 * Never an assistant: refused here (requireHuman), by the command's agent flag, and by the
 * database trigger on "Authorization" / "JobDecision".
 */
export async function recordCustomerAuthorization(_root: unknown, args: { input: StaffAuthorizationInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requireHuman(actor, 'record a customer authorization')
  requirePermission(actor, 'canRecordAuthorizations')
  await estimateShop(context, args.input?.estimateVersionId)
  return run(context, actor, 'authorization.record', args.idempotencyKey, args.input, uow => recordAuthorization(uow, actor, args.input))
}

// ── Staff tasks ───────────────────────────────────────────────────────────────

/**
 * A callback task. This is how an assistant (or a voice call) hands a customer's "yes" to a person:
 * never an authorization.
 */
export async function createCallbackTask(_root: unknown, args: { repairOrderId: string; kind?: string | null; title: string; detail?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReadRepairOrders')
  const shopId = await roShop(context, args.repairOrderId)
  const kind = (['authorization_callback', 'authorization_follow_up', 'customer_callback', 'other'].includes(String(args.kind)) ? args.kind : 'customer_callback') as 'customer_callback'
  return run(context, actor, 'task.create', args.idempotencyKey, args, uow => createStaffTask(uow, actor, {
    shopId, repairOrderId: args.repairOrderId, kind, title: args.title, detail: args.detail ?? null, source: isMachine(actor) ? 'agent' : 'staff',
  }))
}

export async function closeCallbackTask(_root: unknown, args: { taskId: string; expectedVersion: number; outcome: string; cancel?: boolean | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canWriteRepairOrders', 'canManageSchedule')
  const task = typeof args.taskId === 'string' ? await context.prisma.staffTask.findUnique({ where: { id: args.taskId }, select: { shopId: true } }) : null
  if (!task) throw new DomainError(Codes.NOT_FOUND, 'Task not found.')
  requireShop(context, task.shopId)
  return run(context, actor, 'task.close', args.idempotencyKey, args, uow => closeStaffTask(uow, actor, { ...args, cancel: Boolean(args.cancel) }))
}

// ── Canned jobs ───────────────────────────────────────────────────────────────

export async function saveCannedJob(_root: unknown, args: { input: CannedDraftInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePolicies')
  if (args.input?.shopId) requireShop(context, args.input.shopId)
  return run(context, actor, 'canned_job.save', args.idempotencyKey, args.input, uow => saveCannedJobDraft(uow, actor, args.input))
}

export async function publishCannedJobVersion(_root: unknown, args: { versionId: string; expectedVersion: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePolicies')
  requireHuman(actor, 'publish a canned job')
  return run(context, actor, 'canned_job.publish', args.idempotencyKey, args, uow => publishCannedJob(uow, actor, args))
}

export async function setCannedJobStatus(_root: unknown, args: { cannedJobId: string; active: boolean; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManagePolicies')
  return run(context, actor, args.active ? 'canned_job.activate' : 'canned_job.deactivate', args.idempotencyKey, args, uow => setCannedJobActive(uow, actor, args))
}
