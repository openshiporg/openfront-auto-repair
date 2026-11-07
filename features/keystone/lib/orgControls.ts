import { DomainError, Codes } from './errors'
import { registerApplier } from './approvalAppliers'
import { requestApproval } from './approval'
import type { Actor } from './actor'
import type { UnitOfWork } from './unitOfWork'

/**
 * Organisation-wide controls (agent-owner separation, cross-shop customer visibility, record
 * retention) change only through maker-checker: one person requests, a
 * second person with canApproveAgentAutonomy approves, and the change applies against the settings
 * version that was approved (STATE-MACHINES §0, SCHEMA §1.1, §2.8).
 */

export type OrgControls = {
  strictAgentOwnerSoD?: boolean
  customerSharing?: 'shared_all_shops' | 'per_shop'
  retentionYearsOverride?: number | null
}

const KEYS = ['strictAgentOwnerSoD', 'customerSharing', 'retentionYearsOverride'] as const

export function validateOrgControls(input: OrgControls): OrgControls {
  const keys = Object.keys(input ?? {})
  if (!keys.length) throw new DomainError(Codes.INVALID_INPUT, 'Nothing to change.')
  const out: OrgControls = {}
  for (const key of keys) if (!(KEYS as readonly string[]).includes(key)) throw new DomainError(Codes.INVALID_INPUT, `${key} is not an organisation control.`, { field: key })
  if (input.strictAgentOwnerSoD !== undefined) {
    if (typeof input.strictAgentOwnerSoD !== 'boolean') throw new DomainError(Codes.INVALID_INPUT, 'strictAgentOwnerSoD must be true or false.')
    out.strictAgentOwnerSoD = input.strictAgentOwnerSoD
  }
  if (input.customerSharing !== undefined) {
    if (input.customerSharing !== 'shared_all_shops' && input.customerSharing !== 'per_shop') throw new DomainError(Codes.INVALID_INPUT, 'customerSharing must be shared_all_shops or per_shop.', { field: 'customerSharing' })
    out.customerSharing = input.customerSharing
  }
  if (input.retentionYearsOverride !== undefined) {
    const years = input.retentionYearsOverride
    if (years !== null && (!Number.isSafeInteger(years) || years < 1 || years > 30)) throw new DomainError(Codes.INVALID_INPUT, 'retentionYearsOverride must be a whole number of years from 1 to 30, or empty.', { field: 'retentionYearsOverride' })
    out.retentionYearsOverride = years
  }
  return out
}

export async function requestOrgControlsChange(uow: UnitOfWork, actor: Actor, input: OrgControls, reason: string) {
  const changes = validateOrgControls(input)
  const org = await uow.tx.organizationSettings.findUnique({ where: { id: 1 } })
  if (!org) throw new DomainError(Codes.NOT_FOUND, 'Organisation settings are not set up yet.')
  return requestApproval(uow, actor, {
    action: 'org.controls',
    targetList: 'OrganizationSettings',
    targetId: '1',
    payload: { changes, baseVersion: org.version },
    requiredPermission: 'canApproveAgentAutonomy',
    summary: `Change organisation controls: ${Object.keys(changes).join(', ')}${reason ? ` (${reason})` : ''}`,
  })
}

registerApplier('org.controls', async (uow, actor, request) => {
  const [org] = await uow.tx.$queryRaw<{ version: number }[]>`SELECT version FROM "OrganizationSettings" WHERE id = 1 FOR UPDATE`
  if (!org) throw new DomainError(Codes.NOT_FOUND, 'Organisation settings are not set up yet.')
  const { changes, baseVersion } = request.payload as { changes: OrgControls; baseVersion: number }
  if (org.version !== baseVersion) throw new DomainError(Codes.STALE_STATE, 'Organisation settings changed after this was approved. Request the change again.', { currentVersion: org.version })
  const before = await uow.tx.organizationSettings.findUnique({ where: { id: 1 }, select: { strictAgentOwnerSoD: true, customerSharing: true, retentionYearsOverride: true } })
  const updated = await uow.tx.organizationSettings.updateMany({ where: { id: 1, version: baseVersion }, data: { ...changes, version: { increment: 1 } } as never })
  if (updated.count !== 1) throw new DomainError(Codes.STALE_STATE, 'Organisation settings changed while applying.')
  uow.audit({ eventType: 'org.controls_changed', entityType: 'OrganizationSettings', entityId: '1', actorUserId: actor.kind === 'user' ? actor.userId : null, before, after: changes })
  return { applied: Object.keys(changes) }
})
