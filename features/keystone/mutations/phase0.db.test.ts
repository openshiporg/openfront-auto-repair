import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { loadNorthgateSetup } from './setup'
import { cancelApprovalRequest, decideApprovalRequest, requestOrgControls } from './approvals'
import { AGENTS, APPROVAL_POLICIES, ROLES, SHOP_CLOSURES, SHOPS, STAFF } from '../seed/northgate'

/** A Keystone-like session for a user with the given permissions. */
const sessionFor = (id: string, granted: string[]) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})

describe.skipIf(!hasTestDatabase)('Phase 0 commands (database)', () => {
  let prisma: PrismaClient
  let owner: { session: unknown; prisma: PrismaClient }
  let checker: { session: unknown; prisma: PrismaClient }
  let advisor: { session: unknown; prisma: PrismaClient }

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, c, a] = await Promise.all([make('owner'), make('checker'), make('advisor')])
    owner = { session: sessionFor(o.id, permissionNames.filter(p => p !== 'canBreakGlass')), prisma }
    checker = { session: sessionFor(c.id, ['canAccessDashboard', 'canApproveAgentAutonomy', 'canReadAudit']), prisma }
    advisor = { session: sessionFor(a.id, ['canAccessDashboard', 'canWriteRepairOrders']), prisma }
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('loads Northgate once: a second load with a new key creates nothing, and a replay returns the first result', async () => {
    const key = uniqueKey('setup')
    const first = await loadNorthgateSetup(null, { idempotencyKey: key }, owner)
    expect(first.replay).toBe(false)
    const bays = SHOPS.reduce((n, shop) => n + shop.bays.length, 0)
    const memberships = STAFF.reduce((n, person) => n + person.shops.length, 0)
    expect(first.created).toMatchObject({
      organization: 1, shops: SHOPS.length, bays, calendarExceptions: SHOP_CLOSURES.length * SHOPS.length,
      roles: ROLES.length, staff: STAFF.length, memberships, agents: AGENTS.length, approvalPolicies: APPROVAL_POLICIES.length,
    })
    expect(ROLES).toHaveLength(11)
    expect(bays).toBe(13)

    const replay = await loadNorthgateSetup(null, { idempotencyKey: key }, owner)
    expect(replay).toEqual({ ...first, replay: true })

    const again = await loadNorthgateSetup(null, { idempotencyKey: uniqueKey('setup') }, owner)
    expect(Object.values(again.created).every(n => n === 0)).toBe(true)

    const roles = await prisma.role.findMany({ where: { id: { startsWith: 'seed_' } } })
    expect(roles.some(role => (role as Record<string, unknown>).canBreakGlass === true)).toBe(false)
    // Customer and fleet portal roles never reach the dashboard.
    expect(roles.filter(role => !(role as Record<string, unknown>).canAccessDashboard).map(r => r.id).sort()).toEqual(['seed_role_fleet', 'seed_role_portal'])
    const seeded = await prisma.user.findMany({ where: { id: { startsWith: 'seed_' } } })
    expect(seeded).toHaveLength(STAFF.length)
    expect(new Set(seeded.map(u => u.password)).size).toBe(1)
    expect(seeded[0].password).toMatch(/^\$2[aby]\$10\$/)
    const nga = await prisma.shop.findUniqueOrThrow({ where: { code: 'NGA' }, include: { calendar: true, bays: true } })
    expect(nga.calendar?.name).toBe('Northgate Auto Care hours')
    expect(nga.bays).toHaveLength(8)

    const chain = await verifyAuditChain(prisma)
    expect(chain.ok).toBe(true)
    expect(chain.count).toBeGreaterThan(ROLES.length + STAFF.length)
  })

  it('refuses setup without canManageOnboarding', async () => {
    await expect(loadNorthgateSetup(null, { idempotencyKey: uniqueKey('setup') }, advisor)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
  })

  it('organisation controls change only after a second person approves, and the approved payload is what applies', async () => {
    const before = await prisma.organizationSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(before.retentionYearsOverride).toBeNull()

    await expect(requestOrgControls(null, { changes: { retentionYearsOverride: 99 }, reason: 'too long', idempotencyKey: uniqueKey('oc') }, owner)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(requestOrgControls(null, { changes: { retentionYearsOverride: 7 }, reason: '', idempotencyKey: uniqueKey('oc') }, owner)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(requestOrgControls(null, { changes: { retentionYearsOverride: 7 }, reason: 'keep longer', idempotencyKey: uniqueKey('oc') }, advisor)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })

    const asked = await requestOrgControls(null, { changes: { retentionYearsOverride: 7 }, reason: 'Our insurer asks for seven years', idempotencyKey: uniqueKey('oc') }, owner)
    expect(asked.status).toBe('pending')
    expect((await prisma.organizationSettings.findUniqueOrThrow({ where: { id: 1 } })).retentionYearsOverride).toBeNull()

    // The requester holds canApproveAgentAutonomy too, but cannot approve their own request.
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, owner)).rejects.toMatchObject({ code: 'SELF_APPROVAL' })
    // An advisor lacks the permission.
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, advisor)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    // A stale version is refused.
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 7, idempotencyKey: uniqueKey('d') }, checker)).rejects.toMatchObject({ code: 'STALE_STATE' })

    const key = uniqueKey('d')
    const approved = await decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: key }, checker)
    expect(approved).toMatchObject({ status: 'approved', applied: { applied: ['retentionYearsOverride'] }, replay: false })
    const after = await prisma.organizationSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(after.retentionYearsOverride).toBe(7)
    expect(after.version).toBe(before.version + 1)

    const replay = await decideApprovalRequest(null, { requestId: asked.id, decision: 'approve', expectedVersion: 0, idempotencyKey: key }, checker)
    expect(replay.replay).toBe(true)
    expect((await prisma.organizationSettings.findUniqueOrThrow({ where: { id: 1 } })).version).toBe(after.version)

    const request = await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.id } })
    expect(request.consumedAt).not.toBeNull()
    const events = await prisma.auditEvent.findMany({ where: { entityId: { in: [asked.id, '1'] } }, orderBy: { seq: 'asc' } })
    expect(events.map(e => e.eventType)).toEqual(expect.arrayContaining(['approval.requested', 'approval.approved', 'approval.consumed', 'org.controls_changed']))
    expect(events.find(e => e.eventType === 'approval.approved')?.approverId).toBeTruthy()
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })

  it('a change approved against an old version is refused when applied after another change landed', async () => {
    const one = await requestOrgControls(null, { changes: { retentionYearsOverride: 6 }, reason: 'first', idempotencyKey: uniqueKey('oc') }, owner)
    const two = await requestOrgControls(null, { changes: { customerSharing: 'per_shop', retentionYearsOverride: 5 }, reason: 'second', idempotencyKey: uniqueKey('oc') }, owner)
    await decideApprovalRequest(null, { requestId: one.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, checker)
    await expect(decideApprovalRequest(null, { requestId: two.id, decision: 'approve', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, checker)).rejects.toMatchObject({ code: 'STALE_STATE' })
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: two.id } })).status).toBe('pending')
    const org = await prisma.organizationSettings.findUniqueOrThrow({ where: { id: 1 } })
    expect(org.retentionYearsOverride).toBe(6)
    expect(org.customerSharing).toBe('shared_all_shops')
  })

  it('rejecting needs a reason; only the requester can withdraw', async () => {
    const asked = await requestOrgControls(null, { changes: { retentionYearsOverride: 3 }, reason: 'try', idempotencyKey: uniqueKey('oc') }, owner)
    await expect(decideApprovalRequest(null, { requestId: asked.id, decision: 'reject', reason: ' ', expectedVersion: 0, idempotencyKey: uniqueKey('d') }, checker)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(cancelApprovalRequest(null, { requestId: asked.id, expectedVersion: 0, idempotencyKey: uniqueKey('c') }, checker)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    const withdrawn = await cancelApprovalRequest(null, { requestId: asked.id, expectedVersion: 0, idempotencyKey: uniqueKey('c') }, owner)
    expect(withdrawn.status).toBe('cancelled')
  })

  it('the database itself refuses agent approvals and edits to the audit chain (S§20 triggers)', async () => {
    const asked = await requestOrgControls(null, { changes: { retentionYearsOverride: 8 }, reason: 'trigger check', idempotencyKey: uniqueKey('oc') }, owner)
    const checkerId = (checker.session as { itemId: string }).itemId
    // Even raw SQL with the agent actor kind set cannot insert a decision.
    await expect(prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.actor_kind', 'agent', true)`
      await tx.approvalDecision.create({ data: { request: { connect: { id: asked.id } }, decidedBy: { connect: { id: checkerId } }, decision: 'approve', reason: 'agent says yes' } })
    })).rejects.toThrow(/agents cannot write/)
    const audit = await prisma.auditEvent.findFirstOrThrow({ orderBy: { seq: 'asc' } })
    await expect(prisma.auditEvent.update({ where: { id: audit.id }, data: { reason: 'rewritten' } })).rejects.toThrow(/append-only/)
    await expect(prisma.auditEvent.delete({ where: { id: audit.id } })).rejects.toThrow(/append-only/)
    expect((await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.id } })).status).toBe('pending')
  })
})
