import { advisoryLock, type Tx } from './db'
import { canonicalJson, sha256, toJsonValue } from './canonical'
import { auditCreate, lockRow } from './cas'
import { actorUserId, type Actor } from './actor'
import { dec } from './decimal'
import { DomainError, Codes } from './errors'
import { parseToleranceRule } from './ceiling'
import { registerApplier } from './approvalAppliers'
import { requestApproval } from './approval'
import type { UnitOfWork } from './unitOfWork'

/*
 * Versioned policy ("law is data", SCHEMA §2). Each kind has a head (a jurisdiction pack, or a shop)
 * and numbered versions: draft → published → retired. Guards read the published version that is
 * pinned on the shop (and, from Phase 2, on each repair order); nothing in code hard-codes a state rule.
 */

export type PolicyKind = 'jurisdiction' | 'shop_policy' | 'labor_rates' | 'labor_matrix' | 'parts_matrix' | 'fees' | 'tax' | 'warranty'

type KindSpec = {
  model: string
  delegate: string
  head: 'packId' | 'shopId'
  /** Shop column pointing at the current published version. */
  pointer: string
  label: string
  children?: { model: string; delegate: string; fk: string; relation: string }
  /** Fields copied from the previous version into a new draft (everything that is policy, not bookkeeping). */
  fields: string[]
}

const META = new Set(['id', 'versionNumber', 'status', 'notes', 'basedOnId', 'authorId', 'publishedById', 'publishedAt', 'effectiveFrom', 'retiredAt', 'version', 'createdAt', 'updatedAt', 'packId', 'shopId'])

export const POLICY_KINDS: Record<PolicyKind, KindSpec> = {
  jurisdiction: {
    model: 'JurisdictionPolicyVersion', delegate: 'jurisdictionPolicyVersion', head: 'packId', pointer: 'jurisdictionPolicyId', label: 'Jurisdiction rules',
    fields: ['estimateThresholdMinor', 'writtenEstimateWaiverAllowed', 'waiverFormText', 'allowedAuthorizationMethods', 'authorizationEvidenceRules', 'toleranceRule', 'requireOdometerIn', 'requireOdometerOut', 'requireSignedWorkOrder', 'requirePartCondition', 'crashPartOemDefault', 'shopSuppliesGenericAllowed', 'replacedPartsOfferRequired', 'replacedPartsOfferText', 'nonReturnableNoteText', 'teardownRules', 'designeeRules', 'thirdPartyPayorNoticeText', 'towingSeparateAuthorization', 'subletDisclosureRequired', 'invoiceRequiredFields', 'recordRetentionYears', 'surchargeAllowed', 'requiredNotices'],
  },
  shop_policy: {
    model: 'ShopPolicyVersion', delegate: 'shopPolicyVersion', head: 'shopId', pointer: 'shopPolicyId', label: 'Shop policy',
    fields: ['flagHoursAt', 'comebackPayRule', 'allowConcurrentJobClocks', 'tinPendingAllowed', 'requireQualityCheck', 'diagnosisTrustThreshold', 'authorizationLinkTtlHours', 'promisedTimeRequired', 'noShowGraceMinutes', 'discountLimitPctByRole', 'refundApprovalMinor', 'creditMemoApprovalMinor', 'agentOrderLimitMinor', 'agentAutonomy', 'proposalConfirmGranularity', 'declinedSafetyFollowUpPurpose', 'followUpCadenceDays', 'depositPolicy', 'surchargePolicy', 'inspectionClockMode', 'markupFactorDefault'],
  },
  labor_rates: {
    model: 'LaborRateClassSetVersion', delegate: 'laborRateClassSetVersion', head: 'shopId', pointer: 'laborRateClassSetId', label: 'Labor rates',
    children: { model: 'LaborRateClass', delegate: 'laborRateClass', fk: 'setId', relation: 'classes' }, fields: [],
  },
  labor_matrix: { model: 'LaborMatrixVersion', delegate: 'laborMatrixVersion', head: 'shopId', pointer: 'laborMatrixId', label: 'Labor matrix', fields: ['bands', 'appliesToClasses'] },
  parts_matrix: { model: 'PartsMatrixVersion', delegate: 'partsMatrixVersion', head: 'shopId', pointer: 'partsMatrixId', label: 'Parts matrix', fields: ['tiers', 'categoryOverrides', 'supplierOverrides', 'marginFloorPct'] },
  fees: {
    model: 'FeePolicyVersion', delegate: 'feePolicyVersion', head: 'shopId', pointer: 'feePolicyId', label: 'Fees',
    children: { model: 'FeeRule', delegate: 'feeRule', fk: 'policyId', relation: 'rules' }, fields: [],
  },
  tax: {
    model: 'TaxRuleSetVersion', delegate: 'taxRuleSetVersion', head: 'shopId', pointer: 'taxRuleSetId', label: 'Sales tax',
    children: { model: 'TaxRule', delegate: 'taxRule', fk: 'ruleSetId', relation: 'rules' }, fields: ['rounding'],
  },
  warranty: {
    model: 'WarrantyTermSetVersion', delegate: 'warrantyTermSetVersion', head: 'shopId', pointer: 'warrantyTermSetId', label: 'Warranty',
    children: { model: 'WarrantyTerm', delegate: 'warrantyTerm', fk: 'termSetId', relation: 'terms' }, fields: [],
  },
}

export function kindOf(value: unknown): PolicyKind {
  if (typeof value === 'string' && value in POLICY_KINDS) return value as PolicyKind
  throw new DomainError(Codes.INVALID_INPUT, `Unknown policy kind ${String(value).slice(0, 40)}.`, { field: 'kind' })
}

const d = (tx: Tx, name: string) => (tx as unknown as Record<string, any>)[name]

const childBody = (row: Record<string, unknown>, fk: string) => Object.fromEntries(Object.entries(row).filter(([k]) => !META.has(k) && k !== fk && k !== 'id'))

/** The policy content of a version (its fields and child rows), canonical and hashable. Bookkeeping is excluded. */
export async function policyContent(tx: Tx, kind: PolicyKind, versionId: string) {
  const spec = POLICY_KINDS[kind]
  const row = await d(tx, spec.delegate).findUnique({ where: { id: versionId } })
  if (!row) throw new DomainError(Codes.NOT_FOUND, `${spec.label} version not found.`)
  const body: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([k]) => !META.has(k)))
  if (spec.children) {
    const rows: Record<string, unknown>[] = await d(tx, spec.children.delegate).findMany({ where: { [spec.children.fk]: versionId } })
    const children = rows.map(r => childBody(r, spec.children!.fk)).map(r => toJsonValue<Record<string, unknown>>(r))
    children.sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)))
    body[spec.children.relation] = children
  }
  return { row, content: toJsonValue<Record<string, unknown>>(body) }
}

export const contentHash = (content: unknown) => sha256(canonicalJson(content))

/** Field-by-field differences between two contents (for the publish screen and the approval summary). */
export function diffContent(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after)])].sort()
  return keys
    .filter(key => canonicalJson((before ?? {})[key] ?? null) !== canonicalJson(after[key] ?? null))
    .map(key => ({ field: key, before: (before ?? {})[key] ?? null, after: after[key] ?? null }))
}

const AUTH_METHODS = ['in_person_signature', 'written_form', 'oral_phone', 'electronic_link', 'fleet_portal', 'fleet_po']
const AUTONOMY = ['off', 'propose_only', 'auto_within_policy']
/** Actions no autonomy setting can turn on (DOMAIN I-A3: agents never record a customer authorization). */
export const AGENT_FORBIDDEN = ['record_authorization', 'authorization.record', 'approve', 'publish_policy']

const isFraction = (value: unknown) => {
  try {
    const v = dec(String(value))
    return v.gte(0) && v.lte(1)
  } catch {
    return false
  }
}
const isCents = (value: unknown) => value !== null && value !== undefined && /^\d+$/.test(String(value))

/** Refuses a version that would make guards misbehave. Problems are listed together so the editor can fix them in one pass. */
export async function validatePolicy(tx: Tx, kind: PolicyKind, row: Record<string, any>, content: Record<string, any>) {
  const problems: string[] = []
  switch (kind) {
    case 'jurisdiction': {
      try { parseToleranceRule(content.toleranceRule) } catch (e) { problems.push(`Tolerance rule: ${(e as Error).message}`) }
      const methods = content.allowedAuthorizationMethods
      if (!Array.isArray(methods) || !methods.length) problems.push('List at least one allowed authorization method.')
      else for (const m of methods) if (!AUTH_METHODS.includes(m)) problems.push(`Unknown authorization method ${m}.`)
      if (!Number.isInteger(content.recordRetentionYears) || content.recordRetentionYears < 1) problems.push('Record retention must be at least one year.')
      if (!Array.isArray(content.requiredNotices)) problems.push('Required notices must be a list.')
      else for (const n of content.requiredNotices) if (!n?.key || !n?.text || !['estimate', 'invoice', 'work_order'].includes(n?.where)) problems.push(`Notice ${n?.key ?? '?'} needs key, text and where (estimate, invoice or work_order).`)
      break
    }
    case 'shop_policy': {
      if (!isFraction(content.diagnosisTrustThreshold)) problems.push('Diagnosis trust threshold must be between 0 and 1.')
      if (!isCents(content.agentOrderLimitMinor)) problems.push('Agent order limit must be whole cents, 0 or more.')
      const autonomy = content.agentAutonomy ?? {}
      if (typeof autonomy !== 'object' || Array.isArray(autonomy)) problems.push('Agent autonomy must be an object of action class → off, propose_only or auto_within_policy.')
      else for (const [action, mode] of Object.entries(autonomy)) {
        if (AGENT_FORBIDDEN.includes(action) && mode !== 'off') throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, `Agents can never ${action.replace(/[._]/g, ' ')}. A customer's "yes" to an agent becomes a staff callback task.`, { field: 'agentAutonomy' })
        if (!AUTONOMY.includes(String(mode))) problems.push(`Agent autonomy for ${action} must be off, propose_only or auto_within_policy.`)
      }
      const limits = content.discountLimitPctByRole ?? {}
      for (const [role, value] of Object.entries(limits)) if (!isFraction(value)) problems.push(`Discount limit for ${role} must be a fraction from 0 to 1.`)
      break
    }
    case 'labor_rates': {
      const classes: any[] = content.classes ?? []
      if (!classes.length) problems.push('Add at least one labor rate class.')
      if (classes.filter(c => c.isDefault).length !== 1) problems.push('Exactly one labor rate class must be the default.')
      for (const c of classes) if (!isCents(c.rateMinor) || BigInt(c.rateMinor) <= 0n) problems.push(`${c.name ?? c.code}: the hourly rate must be more than zero.`)
      break
    }
    case 'labor_matrix': {
      if (!Array.isArray(content.bands)) problems.push('Bands must be a list.')
      break
    }
    case 'parts_matrix': {
      const tiers: any[] = Array.isArray(content.tiers) ? content.tiers : []
      if (!tiers.length) problems.push('Add at least one cost tier.')
      let previousMax: bigint | null = null
      for (const [i, t] of tiers.entries()) {
        if (!isCents(t.minCostMinor) || (t.maxCostMinor !== null && t.maxCostMinor !== undefined && !isCents(t.maxCostMinor))) { problems.push(`Tier ${i + 1}: costs must be whole cents.`); continue }
        try { if (dec(String(t.multiplier)).lt(1)) problems.push(`Tier ${i + 1}: the multiplier must be at least 1.`) } catch { problems.push(`Tier ${i + 1}: the multiplier must be a decimal such as "1.85".`) }
        const min = BigInt(t.minCostMinor)
        if (previousMax !== null && min !== previousMax) problems.push(`Tier ${i + 1} must start where tier ${i} ends.`)
        previousMax = t.maxCostMinor === null || t.maxCostMinor === undefined ? null : BigInt(t.maxCostMinor)
        if (previousMax !== null && previousMax <= min) problems.push(`Tier ${i + 1}: the upper bound must be above the lower bound.`)
      }
      if (!isFraction(content.marginFloorPct)) problems.push('Margin floor must be a fraction from 0 to 1.')
      break
    }
    case 'fees': {
      const shop = row.shopId ? await tx.shop.findUnique({ where: { id: row.shopId }, select: { jurisdictionPolicyId: true } }) : null
      const law = shop?.jurisdictionPolicyId ? await tx.jurisdictionPolicyVersion.findUnique({ where: { id: shop.jurisdictionPolicyId }, select: { shopSuppliesGenericAllowed: true } }) : null
      for (const r of (content.rules ?? []) as any[]) {
        if (r.code === 'shop_supplies_pct' && law && !law.shopSuppliesGenericAllowed) {
          throw new DomainError(Codes.SHOP_SUPPLIES_PROHIBITED, "This state's rules don't allow a generic shop-supplies percentage. Charge supplies as itemised parts instead.", { field: 'rules' })
        }
        if (r.kind === 'percent_of_base' && !isFraction(r.percent)) problems.push(`${r.code}: percent must be a fraction from 0 to 1.`)
        if (r.kind === 'flat_per_ro' && !isCents(r.flatMinor)) problems.push(`${r.code}: a flat fee needs an amount in cents.`)
        if (r.kind === 'per_unit' && (!isCents(r.perUnitMinor) || !r.itemCategory)) problems.push(`${r.code}: a per-unit fee needs an amount and an item category.`)
        if (r.refundable && !(Number.isInteger(r.refundWindowDays) && r.refundWindowDays > 0)) problems.push(`${r.code}: a refundable deposit needs a refund window in days.`)
      }
      break
    }
    case 'tax': {
      const rules: any[] = content.rules ?? []
      if (!rules.length) problems.push('Add at least one tax rule.')
      for (const r of rules) {
        if (!r.categoryId) problems.push('Every tax rule needs a category.')
        let rate
        try { rate = dec(String(r.rate)) } catch { problems.push('Tax rates must be decimals such as "0.0875".'); continue }
        if (rate.lt(0) || rate.gte(1)) problems.push('A tax rate must be a fraction from 0 to under 1 (0.0875 = 8.75%).')
        if (!r.taxable && !rate.isZero()) problems.push('A non-taxable category must have a zero rate.')
      }
      break
    }
    case 'warranty': {
      if (!((content.terms ?? []) as any[]).length) problems.push('Add at least one warranty term.')
      break
    }
  }
  if (problems.length) throw new DomainError(Codes.POLICY_INVALID, problems[0], { problems })
}

async function headLock(tx: Tx, kind: PolicyKind, headId: string) {
  await advisoryLock(tx, `policy:${kind}:${headId}`)
}

export async function latestPublished(tx: Tx, kind: PolicyKind, headId: string) {
  const spec = POLICY_KINDS[kind]
  return d(tx, spec.delegate).findFirst({ where: { [spec.head]: headId, status: 'published' }, orderBy: { versionNumber: 'desc' } })
}

/**
 * A new draft copied from the published version (or empty defaults when there is none). One open
 * draft per head: asking again returns the existing draft.
 */
export async function createDraft(uow: UnitOfWork, actor: Actor, kind: PolicyKind, headId: string) {
  const spec = POLICY_KINDS[kind]
  const { tx } = uow
  const head = spec.head === 'packId' ? await tx.jurisdictionPack.findUnique({ where: { id: headId } }) : await tx.shop.findUnique({ where: { id: headId } })
  if (!head) throw new DomainError(Codes.NOT_FOUND, spec.head === 'packId' ? 'Jurisdiction pack not found.' : 'Shop not found.')
  await headLock(tx, kind, headId)
  const open = await d(tx, spec.delegate).findFirst({ where: { [spec.head]: headId, status: 'draft' } })
  if (open) return { id: open.id as string, versionNumber: open.versionNumber as number, existing: true }
  const last = await d(tx, spec.delegate).findFirst({ where: { [spec.head]: headId }, orderBy: { versionNumber: 'desc' }, select: { versionNumber: true } })
  const base = await latestPublished(tx, kind, headId)
  const data: Record<string, unknown> = { [spec.head]: headId, versionNumber: (last?.versionNumber ?? 0) + 1, status: 'draft', authorId: actorUserId(actor), basedOnId: base?.id ?? null }
  if (base) for (const field of spec.fields) data[field] = base[field]
  const created = await d(tx, spec.delegate).create({ data })
  if (base && spec.children) {
    const rows: Record<string, unknown>[] = await d(tx, spec.children.delegate).findMany({ where: { [spec.children.fk]: base.id } })
    for (const r of rows) {
      const copy = Object.fromEntries(Object.entries(r).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k)))
      await d(tx, spec.children.delegate).create({ data: { ...copy, [spec.children.fk]: created.id } })
    }
  }
  auditCreate(uow, actor, spec.model, created.id, 'policy.draft_created', { kind, headId, versionNumber: created.versionNumber, basedOn: base?.id ?? null })
  return { id: created.id as string, versionNumber: created.versionNumber as number, existing: false }
}

export type PublishPayload = { kind: PolicyKind; versionId: string; contentHash: string; baseVersion: number }

/**
 * Publish a draft. Someone else with canPublishPolicies approves it (canApproveAgentAutonomy as well
 * when agent autonomy changes); when nobody else holds the permission, the author publishes directly
 * and the audit event says so.
 */
export async function requestPublish(uow: UnitOfWork, actor: Actor, kind: PolicyKind, versionId: string, expectedVersion: number) {
  const spec = POLICY_KINDS[kind]
  const { tx } = uow
  const row = await lockRow<Record<string, any>>(tx, spec.model, versionId)
  if (row.status !== 'draft') throw new DomainError(Codes.POLICY_PUBLISHED, 'This version is already published. Make a new draft to change it.', { currentStatus: row.status })
  if (row.version !== expectedVersion) throw new DomainError(Codes.STALE_STATE, 'This draft changed since you loaded it. Reload and try again.', { currentVersion: row.version })
  const { content } = await policyContent(tx, kind, versionId)
  await validatePolicy(tx, kind, row, content)
  const headId = row[spec.head] as string
  const published = await latestPublished(tx, kind, headId)
  const before = published ? (await policyContent(tx, kind, published.id)).content : null
  const changes = diffContent(before, content)
  if (published && !changes.length) throw new DomainError(Codes.INVALID_INPUT, 'This draft is the same as the published version.')
  const autonomyChanged = kind === 'shop_policy' && changes.some(c => c.field === 'agentAutonomy' || c.field === 'agentOrderLimitMinor')
  const payload: PublishPayload = { kind, versionId, contentHash: contentHash(content), baseVersion: row.version }

  const requiredPermission = autonomyChanged ? 'canApproveAgentAutonomy' : 'canPublishPolicies'
  const others = await tx.user.count({ where: { id: { not: actorUserId(actor) ?? '' }, role: { [requiredPermission]: true }, OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: uow.now } }] } as never })
  if (others === 0 && actor.kind === 'user' && actor.permissions.has(requiredPermission)) {
    const result = await applyPublish(uow, actor, payload, { solo: true })
    return { published: true, ...result }
  }
  const request = await requestApproval(uow, actor, {
    action: autonomyChanged ? 'agent.autonomy' : 'policy.publish',
    targetList: spec.model,
    targetId: versionId,
    payload,
    requiredPermission,
    summary: `Publish ${spec.label} v${row.versionNumber}: ${changes.length} change${changes.length === 1 ? '' : 's'} (${changes.slice(0, 6).map(c => c.field).join(', ')}${changes.length > 6 ? ', …' : ''})`,
  })
  return { published: false, approvalRequestId: request.id as string }
}

/** Make the draft the published version: retire the old one, move the shop pointers, audit. Runs once, inside the approving transaction. */
export async function applyPublish(uow: UnitOfWork, actor: Actor, payload: PublishPayload, options: { solo?: boolean; approverId?: string | null } = {}) {
  const kind = kindOf(payload.kind)
  const spec = POLICY_KINDS[kind]
  const { tx, now } = uow
  const row = await lockRow<Record<string, any>>(tx, spec.model, payload.versionId)
  const headId = row[spec.head] as string
  await headLock(tx, kind, headId)
  if (row.status !== 'draft') throw new DomainError(Codes.POLICY_PUBLISHED, 'This version was already published or retired.', { currentStatus: row.status })
  if (row.version !== payload.baseVersion) throw new DomainError(Codes.STALE_STATE, 'The draft changed after it was approved. Ask for approval again.', { currentVersion: row.version })
  const { content } = await policyContent(tx, kind, payload.versionId)
  if (contentHash(content) !== payload.contentHash) throw new DomainError(Codes.APPROVAL_MISMATCH, 'The draft content changed after it was approved. Ask for approval again.')
  await validatePolicy(tx, kind, row, content)

  const previous = await latestPublished(tx, kind, headId)
  if (previous) await d(tx, spec.delegate).update({ where: { id: previous.id }, data: { status: 'retired', retiredAt: now, version: { increment: 1 } } })
  await d(tx, spec.delegate).update({ where: { id: payload.versionId }, data: { status: 'published', publishedAt: now, effectiveFrom: now, publishedById: actorUserId(actor), version: { increment: 1 } } })

  const shops = spec.head === 'packId'
    ? await tx.shop.findMany({ where: { jurisdictionPackId: headId }, select: { id: true } })
    : [{ id: headId }]
  for (const shop of shops) await tx.shop.update({ where: { id: shop.id }, data: { [spec.pointer]: payload.versionId, version: { increment: 1 } } as never })

  uow.audit({
    eventType: 'policy.published', entityType: spec.model, entityId: payload.versionId, actorUserId: actorUserId(actor), approverId: options.approverId ?? null,
    before: previous ? { publishedVersionId: previous.id, versionNumber: previous.versionNumber } : null,
    after: { versionNumber: row.versionNumber, contentHash: payload.contentHash, shops: shops.map(s => s.id) },
    metadata: { kind, solo: options.solo ?? false },
  })
  return { versionId: payload.versionId, versionNumber: row.versionNumber as number, retiredVersionId: (previous?.id as string | undefined) ?? null, shops: shops.length }
}

const publishApplier = async (uow: UnitOfWork, actor: Actor, request: { payload: any }) => applyPublish(uow, actor, request.payload as PublishPayload, { approverId: actor.kind === 'user' ? actor.userId : null })
registerApplier('policy.publish', publishApplier)
registerApplier('agent.autonomy', publishApplier)

/** The jurisdiction rules a shop runs under now: its pinned published version and whether the pack is verified. */
export async function shopLaw(tx: Tx, shopId: string) {
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { id: true, code: true, jurisdictionPolicyId: true, jurisdictionPackId: true, shopPolicyId: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Shop not found.')
  if (!shop.jurisdictionPolicyId) throw new DomainError(Codes.POLICY_MISSING, `${shop.code} has no published jurisdiction rules. Publish them under Settings → Policies first.`)
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: shop.jurisdictionPolicyId } })
  const pack = await tx.jurisdictionPack.findUniqueOrThrow({ where: { id: law.packId! } })
  const shopPolicy = shop.shopPolicyId ? await tx.shopPolicyVersion.findUnique({ where: { id: shop.shopPolicyId } }) : null
  return { shop, law, pack, shopPolicy, verified: pack.verified }
}
