import { sessionShopIds } from '../access'
import { actorFromSession, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { askForReview, copyCampaignMessage, exportCampaign, previewCampaign, saveCampaign } from '../lib/campaigns'
import { logCall, logMessage, markThreadRead, saveTemplate } from '../lib/communications'
import { dismissRecommendation, markRecommendationContacted, markReminderContacted, recommendationBoard, reminderBoard } from '../lib/followUps'
import { createPortalLink } from '../lib/portal'
import { DomainError, Codes } from '../lib/errors'

type Ctx = { session: any; prisma: any }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

const TALK = ['canMessageCustomers', 'canManageCustomers'] as const
const FOLLOW = ['canMessageCustomers', 'canManageCustomers', 'canManageCampaigns', 'canReadRepairOrders'] as const
const CAMPAIGN = ['canManageCampaigns'] as const

// ── Reads (computed when asked; nothing is stored until a person acts) ───────────────────────────

export async function followUpBoard(_root: unknown, args: { soonDays?: number | null }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...FOLLOW)
  const now = new Date()
  const shopIds = sessionShopIds(context.session)
  if (Array.isArray(shopIds) && !shopIds.length) return { recommendations: [], reminders: [] }
  const [recommendations, reminders] = await Promise.all([
    recommendationBoard(context.prisma, { shopIds, now, soonDays: args.soonDays ?? 7 }),
    reminderBoard(context.prisma, { shopIds, now }),
  ])
  return { recommendations, reminders }
}

export async function campaignPreview(_root: unknown, args: { campaignId: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...CAMPAIGN, 'canMessageCustomers')
  const shopIds = sessionShopIds(context.session)
  const c = await context.prisma.campaign.findUnique({ where: { id: args.campaignId }, select: { shopId: true } })
  if (!c || (shopIds !== 'all' && (!c.shopId || !shopIds.includes(c.shopId)))) throw new DomainError(Codes.NOT_FOUND, 'Campaign not found.')
  return previewCampaign(context.prisma, args.campaignId, new Date())
}

// ── Records of what staff said and did ───────────────────────────────────────────────────────────

export async function logCustomerMessage(_root: unknown, args: { input: Parameters<typeof logMessage>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...TALK)
  requireHuman(actor, 'log a message')
  return run(context, actor, 'message.log', args.idempotencyKey, args.input, uow => logMessage(uow, actor, args.input))
}

export async function logCustomerCall(_root: unknown, args: { input: Parameters<typeof logCall>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...TALK)
  requireHuman(actor, 'log a call')
  return run(context, actor, 'call.log', args.idempotencyKey, args.input, uow => logCall(uow, actor, args.input))
}

export async function readMessageThread(_root: unknown, args: { threadId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...TALK)
  return run(context, actor, 'message.thread_read', args.idempotencyKey, args, uow => markThreadRead(uow, actor, { threadId: args.threadId }))
}

export async function saveMessageTemplate(_root: unknown, args: { input: Parameters<typeof saveTemplate>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canMessageCustomers', 'canManageCampaigns')
  requireHuman(actor, 'change a template')
  return run(context, actor, 'message.template', args.idempotencyKey, args.input, uow => saveTemplate(uow, actor, args.input))
}

// ── Follow-ups ───────────────────────────────────────────────────────────────────────────────────

export async function markFollowUpContacted(_root: unknown, args: { recommendationId: string; channel: string; note?: string | null; expectedContactedCount: number; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...FOLLOW.filter(p => p !== 'canReadRepairOrders'))
  requireHuman(actor, 'mark someone contacted')
  return run(context, actor, 'recommendation.contacted', args.idempotencyKey, args, uow => markRecommendationContacted(uow, actor, args))
}

export async function closeRecommendation(_root: unknown, args: { recommendationId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...TALK, ...CAMPAIGN)
  requireHuman(actor, 'close a recommendation')
  return run(context, actor, 'recommendation.dismiss', args.idempotencyKey, args, uow => dismissRecommendation(uow, actor, args))
}

export async function markServiceReminderContacted(_root: unknown, args: { cycleKey: string; channel: string; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...TALK, ...CAMPAIGN)
  requireHuman(actor, 'mark someone contacted')
  return run(context, actor, 'reminder.contacted', args.idempotencyKey, args, uow => markReminderContacted(uow, actor, args))
}

// ── Campaigns ────────────────────────────────────────────────────────────────────────────────────

export async function saveMarketingCampaign(_root: unknown, args: { input: Parameters<typeof saveCampaign>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...CAMPAIGN)
  requireHuman(actor, 'change a campaign')
  return run(context, actor, 'campaign.save', args.idempotencyKey, args.input, uow => saveCampaign(uow, actor, args.input))
}

export async function exportMarketingCampaign(_root: unknown, args: { campaignId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...CAMPAIGN)
  requireHuman(actor, 'export a campaign')
  return run(context, actor, 'campaign.export', args.idempotencyKey, args, uow => exportCampaign(uow, actor, args))
}

export async function copyMarketingMessage(_root: unknown, args: { campaignId: string; customerId: string; channel?: 'sms' | 'email' | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...CAMPAIGN, 'canMessageCustomers')
  requireHuman(actor, 'copy a campaign message')
  return run(context, actor, 'campaign.copy', args.idempotencyKey, args, uow => copyCampaignMessage(uow, actor, { campaignId: args.campaignId, customerId: args.customerId, channel: args.channel ?? undefined }))
}

export async function recordReviewRequest(_root: unknown, args: { repairOrderId: string; channel: string; note?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...TALK, ...CAMPAIGN)
  requireHuman(actor, 'record a review request')
  return run(context, actor, 'review.ask', args.idempotencyKey, args, uow => askForReview(uow, actor, args))
}

// ── Customer portal link (a copyable link, never emailed) ───────────────────────────────────────────

export async function createCustomerPortalLink(_root: unknown, args: { customerId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageCustomers')
  requireHuman(actor, 'create a portal link')
  return run(context, actor, 'portal.link', args.idempotencyKey, args, uow => createPortalLink(uow, actor, { customerId: args.customerId }))
}
