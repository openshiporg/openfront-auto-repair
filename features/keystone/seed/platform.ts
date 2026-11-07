import { permissionNames } from '../access'
import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import type { UnitOfWork } from '../lib/unitOfWork'
import { AGENTS, APPROVAL_POLICIES, CALENDAR_COVERAGE_THROUGH, ORG, ROLES, SHOP_CLOSURES, SHOPS, STAFF } from './northgate'

/**
 * Seeded people cannot sign in until an administrator sets a password or sends a reset link.
 * This is a bcrypt hash of 32 random bytes that were discarded when it was made, so no password matches it.
 */
const UNUSABLE_PASSWORD_HASH = '$2a$10$3dITCbIvf5zFA.1U8KZDhOHC3EEexi3KYy5ysZK1cRF6LHMm0H.ya'

const day = (date: string) => new Date(`${date}T00:00:00Z`)

/**
 * Loads the organisation spine idempotently: settings, shops with calendars and bays, the 11 roles,
 * staff with shop memberships, agent identities and approval policies. Create-only by deterministic
 * id or natural key, so a second run changes nothing and never overwrites later edits.
 */
export async function seedOrgPlatform(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  const created: Record<string, number> = { organization: 0, shops: 0, bays: 0, calendarExceptions: 0, roles: 0, staff: 0, memberships: 0, agents: 0, approvalPolicies: 0 }

  if (!(await tx.organizationSettings.findUnique({ where: { id: 1 } }))) {
    await tx.organizationSettings.create({ data: { id: 1, ...ORG } })
    auditCreate(uow, actor, 'OrganizationSettings', '1', 'organization.created', ORG, { metadata: { seed: true } })
    created.organization += 1
  }

  for (const shop of SHOPS) {
    if (await tx.shop.findFirst({ where: { OR: [{ id: shop.id }, { code: shop.code }] } })) continue
    const { bays, weeklyHours, ...fields } = shop
    const calendar = await tx.shopCalendar.create({
      data: { id: `${shop.id}_calendar`, name: `${shop.name} hours`, weeklyHours: weeklyHours as never, coverageThrough: day(CALENDAR_COVERAGE_THROUGH) },
    })
    await tx.shop.create({ data: { ...fields, registrations: fields.registrations as never, timeZone: ORG.defaultTimeZone, isPublished: false, calendarId: calendar.id } })
    await tx.shopCalendarException.createMany({ data: SHOP_CLOSURES.map(([date, reason]) => ({ calendarId: calendar.id, date: day(date), closed: true, reason })) })
    await tx.bay.createMany({ data: bays.map(bay => ({ id: `${shop.id}_${bay.code.toLowerCase()}`, shopId: shop.id, code: bay.code, name: bay.name, kind: bay.kind, active: true })) })
    auditCreate(uow, actor, 'Shop', shop.id, 'shop.created', { code: shop.code, name: shop.name, bays: bays.length, region: shop.region }, { metadata: { seed: true } })
    created.shops += 1
    created.bays += bays.length
    created.calendarExceptions += SHOP_CLOSURES.length
  }

  const haveRoles = new Set((await tx.role.findMany({ where: { id: { in: ROLES.map(r => r.id) } }, select: { id: true } })).map(r => r.id))
  const newRoles = ROLES.filter(role => !haveRoles.has(role.id))
  if (newRoles.length) {
    await tx.role.createMany({ data: newRoles.map(role => ({ id: role.id, name: role.name, description: role.description, ...Object.fromEntries(permissionNames.map(name => [name, role.permissions.includes(name)])) })) })
    for (const role of newRoles) auditCreate(uow, actor, 'Role', role.id, 'role.created', { name: role.name, permissions: role.permissions }, { metadata: { seed: true } })
    created.roles = newRoles.length
  }

  const haveUsers = await tx.user.findMany({ where: { OR: [{ id: { in: STAFF.map(p => p.id) } }, { email: { in: STAFF.map(p => p.email) } }] }, select: { id: true, email: true } })
  const newStaff = STAFF.filter(person => !haveUsers.some(u => u.id === person.id || u.email === person.email))
  if (newStaff.length) {
    await tx.user.createMany({
      data: newStaff.map(person => ({
        id: person.id,
        name: person.name,
        email: person.email,
        title: person.title,
        password: UNUSABLE_PASSWORD_HASH,
        kind: person.kind,
        roleId: person.roleId,
        accessExpiresAt: person.accessDays ? new Date(now.getTime() + person.accessDays * 86_400_000) : null,
        onboardingStatus: 'dismissed',
      })),
    })
    for (const person of newStaff) auditCreate(uow, actor, 'User', person.id, 'user.created', { name: person.name, title: person.title, role: person.roleId, kind: person.kind, shops: person.shops }, { metadata: { seed: true } })
    created.staff = newStaff.length
    const memberships = newStaff.flatMap(person => person.shops.map((shopId, i) => ({ id: `${person.id}_${shopId}`, userId: person.id, shopId, isDefault: i === 0, status: 'active', startedAt: now })))
    if (memberships.length) {
      await tx.shopMembership.createMany({ data: memberships })
      created.memberships = memberships.length
    }
  }

  for (const agent of AGENTS) {
    if (await tx.agentIdentity.findFirst({ where: { OR: [{ id: agent.id }, { name: agent.name }] } })) continue
    await tx.agentIdentity.create({ data: { id: agent.id, name: agent.name, kind: agent.kind, ownerId: agent.ownerId, status: 'active', shops: { connect: agent.shops.map(id => ({ id })) } } })
    auditCreate(uow, actor, 'AgentIdentity', agent.id, 'agent.created', { name: agent.name, owner: agent.ownerId, autonomy: 'propose_only' }, { metadata: { seed: true } })
    created.agents += 1
  }

  const havePolicies = new Set((await tx.approvalPolicy.findMany({ select: { action: true } })).map(p => p.action))
  for (const policy of APPROVAL_POLICIES.filter(p => !havePolicies.has(p.action))) {
    const row = await tx.approvalPolicy.create({ data: { action: policy.action, description: policy.description, requiredPermission: policy.requiredPermission, minApprovals: 1, expiresAfterMinutes: policy.expiresAfterMinutes, thresholdMinor: policy.thresholdMinor ?? null } })
    auditCreate(uow, actor, 'ApprovalPolicy', row.id, 'approval_policy.created', { action: policy.action, requiredPermission: policy.requiredPermission }, { metadata: { seed: true } })
    created.approvalPolicies += 1
  }

  return created
}
