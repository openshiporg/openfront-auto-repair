import { actorFromSession, can, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { Codes, DomainError } from '../lib/errors'
import { buildJournal, exportBatch, mappingsFor, recordProviderResponse, saveMappings, stageJournal, SOURCE_KEYS } from '../lib/accounting'
import { applyImport, discardImport, previewImport } from '../lib/importers'
import { recordHealth, recordObservation, revokeConnection, saveConnection } from '../lib/integrations'
import { computeKpis, REPORT_DEFINITIONS, saveKpiSnapshot } from '../lib/reporting'
import { runTieOuts } from '../lib/tieouts'
import { changeEndpoint, createEndpoint, deliverDue, replayEvent, WEBHOOK_TOPICS } from '../lib/webhooks'
import { requireShop } from './phase1'

type Ctx = { session: any; prisma: any }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

const REPORTS = ['canReadReports', 'canReadFinancials'] as const
const BOOKS = ['canReadFinancials', 'canCloseDay'] as const
const ADMIN = ['canManageIntegrations'] as const

/** The shop of a record, read inside the command's own transaction so the check and the write agree. */
async function shopOf(tx: any, list: string, id: unknown, pick: (row: any) => string | null | undefined = r => r.shopId, select: object = { shopId: true }) {
  const row = typeof id === 'string' && id ? await tx[list].findUnique({ where: { id }, select }) : null
  if (!row) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  return pick(row) ?? null
}
/** Records with no shop belong to the whole organisation: only a person who works at every shop may touch them. */
function requireShopOrOrg(context: Ctx, shopId: string | null | undefined) {
  if (shopId) return requireShop(context, shopId)
  const role = context.session?.data?.role
  if (!role?.canAccessAllShops) throw new DomainError(Codes.NOT_AUTHORIZED, 'This belongs to the whole organisation.')
  return null
}

// ── Reads (computed when asked) ───────────────────────────────────────────────────────────────

export async function shopReports(_root: unknown, args: { shopId: string; from: string; to: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...REPORTS)
  requireShop(context, args.shopId)
  const report = await computeKpis(context.prisma, args.shopId, args.from, args.to, { includeCost: can(actor, 'canSeeCost') && can(actor, 'canReadFinancials') })
  return { ...report, labels: Object.fromEntries(Object.entries(REPORT_DEFINITIONS).map(([k, v]) => [k, v.label])) }
}

export async function shopTieOuts(_root: unknown, args: { shopId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReadFinancials')
  requireShop(context, args.shopId)
  return { shopId: args.shopId, checks: await runTieOuts(context.prisma, args.shopId) }
}

export async function accountingJournalPreview(_root: unknown, args: { shopId: string; businessDate: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...BOOKS)
  requireShop(context, args.shopId)
  const journal = await buildJournal(context.prisma, args.shopId, args.businessDate)
  const maps = await mappingsFor(context.prisma, args.shopId)
  return {
    lines: journal.lines.map(l => ({ ...l, accountCode: maps.get(l.sourceKey)?.accountCode ?? '', accountName: maps.get(l.sourceKey)?.accountName ?? '' })),
    debitTotalMinor: journal.debitTotalMinor.toString(), creditTotalMinor: journal.creditTotalMinor.toString(), balanced: journal.debitTotalMinor === journal.creditTotalMinor,
    unmapped: [...new Set(journal.lines.filter(l => !maps.has(l.sourceKey)).map(l => l.sourceKey))], sourceKeys: SOURCE_KEYS, postingStatus: 'NOT_POSTED',
  }
}

export async function exportFile(_root: unknown, args: { exportJobId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...BOOKS, ...ADMIN)
  const job = await context.prisma.exportJob.findUnique({ where: { id: args.exportJobId } })
  if (!job) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  requireShopOrOrg(context, job.shopId)
  return { fileName: job.fileName, contentType: job.contentType, content: job.content, sha256: job.sha256, rowCount: job.rowCount }
}

export async function webhookTopics() {
  return Object.entries(WEBHOOK_TOPICS).map(([topic, sources]) => ({ topic, sources }))
}

// ── Accounting ────────────────────────────────────────────────────────────────────────────────

export async function saveAccountingMappings(_root: unknown, args: { shopId: string; mappings: { sourceKey: string; accountCode: string; accountName?: string | null }[]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN, 'canCloseDay')
  requireHuman(actor, 'change the account mapping')
  requireShop(context, args.shopId)
  return run(context, actor, 'accounting.mappings', args.idempotencyKey, { shopId: args.shopId, mappings: args.mappings }, uow => saveMappings(uow, actor, { shopId: args.shopId, mappings: args.mappings }))
}

export async function stageAccountingBatch(_root: unknown, args: { shopId: string; businessDate: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canCloseDay')
  requireHuman(actor, 'stage the accounting export')
  requireShop(context, args.shopId)
  return run(context, actor, 'accounting.stage', args.idempotencyKey, { shopId: args.shopId, businessDate: args.businessDate }, uow => stageJournal(uow, actor, { shopId: args.shopId, businessDate: args.businessDate }))
}

export async function exportAccountingBatch(_root: unknown, args: { batchId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canCloseDay')
  requireHuman(actor, 'export the accounting batch')
  return run(context, actor, 'accounting.export', args.idempotencyKey, { batchId: args.batchId }, async uow => {
    requireShop(context, await shopOf(uow.tx, 'accountingBatch', args.batchId))
    return exportBatch(uow, actor, { batchId: args.batchId })
  })
}

export async function recordAccountingResponse(_root: unknown, args: { input: { batchId: string; outcome: 'accepted' | 'rejected' | 'partial' | 'error'; providerRef?: string | null; message?: string | null; payload?: unknown }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canCloseDay')
  requireHuman(actor, 'record what the books said')
  return run(context, actor, 'accounting.response', args.idempotencyKey, args.input, async uow => {
    requireShop(context, await shopOf(uow.tx, 'accountingBatch', args.input?.batchId))
    return recordProviderResponse(uow, actor, args.input)
  })
}

export async function saveReportSnapshot(_root: unknown, args: { shopId: string; from: string; to: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...REPORTS)
  requireShop(context, args.shopId)
  const includeCost = can(actor, 'canSeeCost') && can(actor, 'canReadFinancials')
  return run(context, actor, 'report.snapshot', args.idempotencyKey, { shopId: args.shopId, from: args.from, to: args.to }, uow => saveKpiSnapshot(uow, actor, { shopId: args.shopId, from: args.from, to: args.to, includeCost }))
}

// ── Imports ──────────────────────────────────────────────────────────────────────────────────

export async function previewDataImport(_root: unknown, args: { input: { shopId: string; format: any; entity: any; fileName?: string | null; text: string }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'import data')
  requireShop(context, args.input?.shopId)
  return run(context, actor, 'import.preview', args.idempotencyKey, { ...args.input, text: undefined, textHash: String(args.input?.text ?? '').length }, uow => previewImport(uow, actor, args.input))
}

export async function applyDataImport(_root: unknown, args: { jobId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'import data')
  return run(context, actor, 'import.apply', args.idempotencyKey, { jobId: args.jobId }, async uow => {
    requireShop(context, await shopOf(uow.tx, 'importJob', args.jobId))
    return applyImport(uow, actor, { jobId: args.jobId })
  })
}

export async function discardDataImport(_root: unknown, args: { jobId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'discard an import')
  return run(context, actor, 'import.discard', args.idempotencyKey, { jobId: args.jobId }, async uow => {
    requireShop(context, await shopOf(uow.tx, 'importJob', args.jobId))
    return discardImport(uow, actor, { jobId: args.jobId })
  })
}

// ── Integrations ─────────────────────────────────────────────────────────────────────────────

export async function saveIntegrationConnection(_root: unknown, args: { input: Parameters<typeof saveConnection>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'change an integration')
  return run(context, actor, 'integration.save', args.idempotencyKey, args.input, async uow => {
    requireShopOrOrg(context, args.input?.id ? await shopOf(uow.tx, 'integrationConnection', args.input.id) : args.input?.shopId ?? null)
    return saveConnection(uow, actor, args.input)
  })
}

export async function recordIntegrationHealth(_root: unknown, args: { connectionId: string; ok: boolean; message?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'record an integration check')
  return run(context, actor, 'integration.health', args.idempotencyKey, args, async uow => {
    requireShopOrOrg(context, await shopOf(uow.tx, 'integrationConnection', args.connectionId))
    return recordHealth(uow, actor, { connectionId: args.connectionId, ok: args.ok, message: args.message })
  })
}

export async function revokeIntegrationConnection(_root: unknown, args: { connectionId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'turn off an integration')
  return run(context, actor, 'integration.revoke', args.idempotencyKey, args, async uow => {
    requireShopOrOrg(context, await shopOf(uow.tx, 'integrationConnection', args.connectionId))
    return revokeConnection(uow, actor, { connectionId: args.connectionId, reason: args.reason })
  })
}

export async function recordProviderObservation(_root: unknown, args: { input: Parameters<typeof recordObservation>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'record a provider message')
  return run(context, actor, 'integration.observe', args.idempotencyKey, args.input, async uow => {
    requireShopOrOrg(context, await shopOf(uow.tx, 'integrationConnection', args.input?.connectionId))
    return recordObservation(uow, actor, args.input)
  })
}

// ── Webhooks out ─────────────────────────────────────────────────────────────────────────────

export async function addWebhookEndpoint(_root: unknown, args: { input: { shopId?: string | null; url: string; events: string[] }; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'add a webhook')
  requireShopOrOrg(context, args.input?.shopId ?? null)
  return run(context, actor, 'webhook.create', args.idempotencyKey, args.input, uow => createEndpoint(uow, actor, args.input))
}

export async function changeWebhookEndpoint(_root: unknown, args: { input: Parameters<typeof changeEndpoint>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'change a webhook')
  return run(context, actor, 'webhook.change', args.idempotencyKey, args.input, async uow => {
    requireShopOrOrg(context, await shopOf(uow.tx, 'webhookEndpoint', args.input?.endpointId))
    return changeEndpoint(uow, actor, args.input)
  })
}

export async function replayWebhookEvent(_root: unknown, args: { eventId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'replay a webhook')
  return run(context, actor, 'webhook.replay', args.idempotencyKey, args, async uow => {
    requireShopOrOrg(context, await shopOf(uow.tx, 'webhookEvent', args.eventId, r => r.endpoint?.shopId, { endpoint: { select: { shopId: true } } }))
    return replayEvent(uow, actor, { eventId: args.eventId })
  })
}

/** A person pressing "send what is due": there is no scheduler (AGENTS.md); deliveries also go out right after each commit. */
export async function sendDueWebhooks(_root: unknown, _args: { idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...ADMIN)
  requireHuman(actor, 'send webhooks')
  return deliverDue(context.prisma)
}
