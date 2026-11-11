import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { verifyAuditChain } from '../lib/audit'
import { checkInShopVehicle } from './phase1'
import { addRepairJob, openShopRepairOrder, recordCustomerAuthorization, sendRepairEstimate, transitionRepairJob } from './phase2'
import { finalizeShopInvoice } from './phase3'
import { addAccountCertificate, exportAccountStatement, holdAccountCredit, makeAccountStatement, refreshAccountStanding, releaseAccountHold, saveAccountTerms } from './phase6'
import { decideApprovalRequest } from './approvals'
import { loadNorthgateSetup } from './setup'
import { SHOPS } from '../seed/northgate'

const ALL_SHOPS = SHOPS.map(s => ({ status: 'active', shop: { id: s.id } }))
const sessionFor = (id: string, granted: string[]) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, memberships: ALL_SHOPS, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})
const NGA = 'seed_shop_nga'
const CVP = 'seed_acct_cvp'
const SACL = 'seed_acct_sacl'
const COUNTER = ['canAccessDashboard', 'canReadRepairOrders', 'canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations', 'canReadCustomerPII', 'canManageCustomers', 'canFinalizeInvoices', 'canReadFinancials', 'canTakePayments']
const BRAKES = [
  { kind: 'labor', description: 'Front brake pads and rotors, replace', rateClassCode: 'general', soldCentiHours: 125 },
  { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' },
]
const OIL = [{ kind: 'labor', description: 'Oil and filter change', rateClassCode: 'general', soldCentiHours: 50 }]

describe.skipIf(!hasTestDatabase)('Phase 6 fleet and business accounts (database)', () => {
  let prisma: PrismaClient
  type Ctx = { session: unknown; prisma: PrismaClient }
  let owner: Ctx, advisor: Ctx, manager: Ctx
  const key = (p: string) => uniqueKey(p)

  const used = new Set<string>()
  const unitOf = async (accountId: string) => {
    const unit = (await prisma.fleetUnit.findMany({ where: { businessAccountId: accountId }, orderBy: { unitNumber: 'asc' } })).find(u => !used.has(u.id))!
    used.add(unit.id)
    return unit
  }
  async function open(accountId: string) {
    const unit = await unitOf(accountId)
    const customerId = accountId === CVP ? 'seed_cust_fleet_cvp' : 'seed_cust_fleet_sacl'
    const checkIn = await checkInShopVehicle(null, { input: { shopId: NGA, customerId, vehicleId: unit.vehicleId!, concerns: ['Squealing brakes'], promisedAt: new Date(Date.now() + 86_400_000).toISOString(), odometer: { value: ((await prisma.vehicle.findUniqueOrThrow({ where: { id: unit.vehicleId! } })).lastOdometer ?? 0) + 200 }, signature: { method: 'in_person', signerName: 'Dana Whitfield', strokes: [Array.from({ length: 12 }, (_, i) => [i, i * 2])] } }, idempotencyKey: key('ci') }, advisor) as { id: string }
    return (await openShopRepairOrder(null, { input: { checkInId: checkIn.id, kind: 'fleet' }, idempotencyKey: key('ro') }, advisor) as { id: string }).id
  }
  async function estimate(repairOrderId: string, lines: unknown[]) {
    const added = await addRepairJob(null, { input: { repairOrderId, title: 'Brake service', lines }, idempotencyKey: key('j') }, advisor) as { id: string }
    const row = await prisma.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId } })
    const v = await sendRepairEstimate(null, { repairOrderId, expectedVersion: row.version, idempotencyKey: key('e') }, advisor) as { id: string }
    return { jobId: added.id, estimateVersionId: v.id }
  }
  const authorize = (e: { jobId: string; estimateVersionId: string }, extra: Record<string, unknown>) =>
    recordCustomerAuthorization(null, { input: { estimateVersionId: e.estimateVersionId, method: 'fleet_po', actorKind: 'fleet_approver', replacedPartsElection: 'do_not_return', actorName: 'Dana Whitfield', answers: [{ jobId: e.jobId, decision: 'approve' }], ...extra }, idempotencyKey: key('a') }, advisor)
  const step = async (jobId: string, to: string) => {
    const j = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })
    return transitionRepairJob(null, { jobId, to, expectedVersion: j.version, cause: 'Pads worn to the backing plate', correction: 'Replaced pads and rotors', idempotencyKey: key('t') } as never, advisor)
  }
  async function toInvoice(accountId: string, lines: unknown[], poNumber = 'PO-7731') {
    const ro = await open(accountId)
    const e = await estimate(ro, lines)
    // Capital Valley's operations manager (limit $3,000); Sac County's only approver.
    const approver = (await prisma.fleetApprover.findFirstOrThrow({ where: { businessAccountId: accountId, active: true }, orderBy: { order: 'desc' } })).id
    await authorize(e, { poNumber, fleetApproverId: approver })
    await step(e.jobId, 'in_progress'); await step(e.jobId, 'completed')
    const r = await prisma.repairOrder.findUniqueOrThrow({ where: { id: ro }, include: { vehicle: true } })
    return finalizeShopInvoice(null, { input: { repairOrderId: ro, expectedVersion: r.version, poNumber, odometerOut: (r.vehicle!.lastOdometer ?? 0) + 5 }, idempotencyKey: key('f') }, advisor) as Promise<{ invoices: { id: string }[] }>
  }

  beforeAll(async () => {
    prisma = testPrisma(2)
    await resetDatabase(prisma)
    const make = (name: string) => prisma.user.create({ data: { name, email: `${uniqueKey(name)}@test.local`, password: 'x'.repeat(60) } })
    const [o, a, m] = await Promise.all([make('owner'), make('advisor'), make('manager')])
    owner = { session: sessionFor(o.id, permissionNames.filter(x => x !== 'canBreakGlass')), prisma }
    advisor = { session: sessionFor(a.id, COUNTER), prisma }
    manager = { session: sessionFor(m.id, [...COUNTER, 'canApproveCredit']), prisma }
    await loadNorthgateSetup(null, { idempotencyKey: key('setup') }, owner)
  }, 900_000)

  afterAll(async () => { await prisma?.$disconnect() })

  it('seeds approvers in order with their limits, units for the vehicles, and the library certificate', { timeout: 60_000 }, async () => {
    const chain = await prisma.fleetApprover.findMany({ where: { businessAccountId: CVP, active: true }, orderBy: { order: 'asc' } })
    expect(chain.map(a => [a.order, a.limitMinor])).toEqual([[1, 75_000n], [2, 300_000n]])
    expect(await prisma.fleetUnit.count({ where: { businessAccountId: CVP } })).toBe(12)
    expect((await prisma.exemptionCertificate.findFirstOrThrow({ where: { businessAccountId: SACL } })).status).toBe('active')
  })

  it('an approver over their limit escalates to the next one, and a missing PO is refused', { timeout: 300_000 }, async () => {
    const ro = await open(CVP)
    const e = await estimate(ro, BRAKES)
    const job = await prisma.job.findUniqueOrThrow({ where: { id: e.jobId } })
    const [first, second] = await prisma.fleetApprover.findMany({ where: { businessAccountId: CVP }, orderBy: { order: 'asc' } })
    // Shrink the first limit below the job so it is over, whatever the price.
    await prisma.fleetApprover.update({ where: { id: first.id }, data: { limitMinor: job.totalMinor - 1n } })
    await expect(authorize(e, { poNumber: '', fleetApproverId: second.id })).rejects.toMatchObject({ code: 'PO_REQUIRED' })
    const over = await authorize(e, { poNumber: 'PO-1001', fleetApproverId: first.id }).catch(x => x)
    expect(over.message).toMatch(/above .* limit/)
    expect(over.message).toMatch(/goes to /)
    await authorize(e, { poNumber: 'PO-1001', fleetApproverId: second.id })
    const auth = await prisma.authorization.findFirstOrThrow({ where: { jobId: e.jobId, status: 'recorded' } })
    expect(auth.fleetApproverId).toBe(second.id)
    expect(auth.poNumber).toBe('PO-1001')
    await prisma.fleetApprover.update({ where: { id: first.id }, data: { limitMinor: 75_000n } })
  })

  it('a certificate that has not expired removes tax; once it is past its date a new invoice is taxed', { timeout: 300_000 }, async () => {
    const exempt = await toInvoice(SACL, BRAKES)
    const a = await prisma.invoice.findUniqueOrThrow({ where: { id: exempt.invoices[0].id } })
    expect(a.taxMinor).toBe(0n)
    expect(a.exemptionCertificateId).not.toBeNull()
    // The date passes: no timer, the next invoice just sees it.
    const cert = await prisma.exemptionCertificate.findFirstOrThrow({ where: { businessAccountId: SACL } })
    await prisma.$executeRawUnsafe(`ALTER TABLE "ExemptionCertificate" DISABLE TRIGGER USER`)
    await prisma.exemptionCertificate.update({ where: { id: cert.id }, data: { expiresAt: new Date('2026-01-01T00:00:00Z') } })
    await prisma.$executeRawUnsafe(`ALTER TABLE "ExemptionCertificate" ENABLE TRIGGER USER`)
    const taxed = await toInvoice(SACL, BRAKES)
    const b = await prisma.invoice.findUniqueOrThrow({ where: { id: taxed.invoices[0].id } })
    expect(b.exemptionCertificateId).toBeNull()
    expect(b.taxMinor).toBeGreaterThan(0n)
    expect((await prisma.exemptionCertificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe('active')
    await refreshAccountStanding(null, { businessAccountId: SACL, idempotencyKey: key('rf') }, manager)
    expect((await prisma.exemptionCertificate.findUniqueOrThrow({ where: { id: cert.id } })).status).toBe('expired')
    // A replacement certificate brings the exemption back.
    await addAccountCertificate(null, { input: { businessAccountId: SACL, kind: 'government', number: 'SCL-GOV-5000', issuingState: 'California', expiresAt: '2030-12-31' }, idempotencyKey: key('ac') }, manager)
    expect((await prisma.businessAccount.findUniqueOrThrow({ where: { id: SACL } })).taxExempt).toBe(true)
  })

  it('credit hold blocks new work with a readable reason, a manager releases it', { timeout: 300_000 }, async () => {
    await expect(holdAccountCredit(null, { businessAccountId: CVP, reason: 'Two checks bounced', idempotencyKey: key('h') }, advisor)).rejects.toMatchObject({ code: 'NOT_AUTHORIZED' })
    await holdAccountCredit(null, { businessAccountId: CVP, reason: 'Two checks bounced', idempotencyKey: key('h') }, manager)
    const blocked = await open(CVP).catch(x => x)
    expect(blocked.code).toBe('CREDIT_HOLD')
    expect(blocked.message).toMatch(/Capital Valley Plumbing is on credit hold/)
    expect(blocked.message).toMatch(/Two checks bounced/)
    const asked = await releaseAccountHold(null, { businessAccountId: CVP, reason: 'Paid in full', idempotencyKey: key('r') }, manager) as { approvalRequired?: boolean; approvalRequestId: string }
    expect(asked.approvalRequired).toBe(true)
    await decideApprovalRequest(null, { requestId: asked.approvalRequestId, decision: 'approve', reason: 'Checked', expectedVersion: (await prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.approvalRequestId } })).version, idempotencyKey: key('d') }, owner)
    await releaseAccountHold(null, { businessAccountId: CVP, reason: 'Paid in full', approvalRequestId: asked.approvalRequestId, idempotencyKey: key('r2') }, manager)
    expect((await prisma.businessAccount.findUniqueOrThrow({ where: { id: CVP } })).status).toBe('active')
    await open(CVP)
  })

  it('going over the credit limit puts the account on hold when it is checked', { timeout: 300_000 }, async () => {
    await saveAccountTerms(null, { input: { businessAccountId: CVP, creditLimitMinor: '100' }, idempotencyKey: key('t') }, manager).then(r => expect((r as { approvalRequired?: boolean }).approvalRequired).toBeUndefined())
    const inv = await toInvoice(CVP, OIL).catch(x => x)
    expect(inv.code).toBe('CREDIT_HOLD')
    expect(inv.message).toMatch(/credit limit/)
  })

  it('a statement adds up, is made once per period, and exports as a file (never sent)', { timeout: 300_000 }, async () => {
    await prisma.businessAccount.update({ where: { id: CVP }, data: { creditLimitMinor: 5_000_000n } })
    const inv = await toInvoice(CVP, OIL)
    const made = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.invoices[0].id } })
    const day = made.invoiceDate!.toISOString().slice(0, 10)
    const s = await makeAccountStatement(null, { businessAccountId: CVP, periodStart: day, periodEnd: day, idempotencyKey: key('s') }, advisor) as { id: string; closingMinor: string; reference: string }
    const row = await prisma.statement.findUniqueOrThrow({ where: { id: s.id } })
    expect(row.openingMinor + row.chargesMinor - row.paymentsMinor - row.creditsMinor).toBe(row.closingMinor)
    expect(row.chargesMinor).toBeGreaterThanOrEqual(made.totalMinor)
    const again = await makeAccountStatement(null, { businessAccountId: CVP, periodStart: day, periodEnd: day, idempotencyKey: key('s2') }, advisor) as { id: string; already: boolean }
    expect(again.id).toBe(s.id)
    const file = await exportAccountStatement(null, { statementId: s.id, idempotencyKey: key('x') }, advisor) as { csv: string; filename: string }
    expect(file.filename).toBe(`statement-${s.reference}.csv`)
    expect(file.csv).toContain(made.invoiceNumber)
    expect((await prisma.statement.findUniqueOrThrow({ where: { id: s.id } })).exportedAt).not.toBeNull()
    expect(await prisma.statement.update({ where: { id: s.id }, data: { closingMinor: 1n } }).catch(() => 'refused')).toBe('refused')
  })

  it('the audit chain is intact', { timeout: 120_000 }, async () => {
    expect((await verifyAuditChain(prisma)).ok).toBe(true)
  })
})
