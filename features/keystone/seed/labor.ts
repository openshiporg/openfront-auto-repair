import type { Actor } from '../lib/actor'
import { auditCreate } from '../lib/cas'
import type { UnitOfWork } from '../lib/unitOfWork'

/**
 * Phase 5 shop data: who turns wrenches, how each is paid and which certificates they hold. Create-only and
 * keyed by person and shop, so it runs once. Luis Ramirez's and Kevin Tran's EPA 609 certificates are current;
 * Jake Holloway's lapsed in the spring, so he cannot be put on air-conditioning work until it is renewed.
 */

type Tech = {
  id: string; userId: string; shopId: string; name: string; payPlan: 'flat_rate' | 'hourly' | 'salary_plus_bonus'; flatRateMinor: bigint; hourlyRateMinor: bigint; skills: string[]; rateClasses: string[]
  credentials: { kind: string; identifier: string; issuedAt: string; expiresAt: string | null }[]
}

const TECHS: Tech[] = [
  { id: 'seed_tech_nga_ramirez', userId: 'seed_user_ramirez', shopId: 'seed_shop_nga', name: 'Luis Ramirez', payPlan: 'flat_rate', flatRateMinor: 3800n, hourlyRateMinor: 0n, skills: ['Engine performance', 'Brakes', 'Air conditioning', 'Diagnostics'], rateClasses: ['general', 'diagnostic', 'electrical', 'european'],
    credentials: [
      { kind: 'ase', identifier: 'ASE A1-A8 Master', issuedAt: '2023-05-02', expiresAt: '2028-05-02' },
      { kind: 'epa_609', identifier: 'MACS 609-2210418', issuedAt: '2025-03-14', expiresAt: null },
    ] },
  { id: 'seed_tech_nga_tran', userId: 'seed_user_tran', shopId: 'seed_shop_nga', name: 'Kevin Tran', payPlan: 'flat_rate', flatRateMinor: 3200n, hourlyRateMinor: 0n, skills: ['Brakes', 'Suspension', 'Maintenance', 'Air conditioning'], rateClasses: ['general', 'fleet'],
    credentials: [
      { kind: 'ase', identifier: 'ASE A4, A5, A6', issuedAt: '2024-08-19', expiresAt: '2029-08-19' },
      { kind: 'epa_609', identifier: 'ESCO 609-884127', issuedAt: '2025-09-30', expiresAt: '2027-09-30' },
    ] },
  { id: 'seed_tech_nga_holloway', userId: 'seed_user_holloway', shopId: 'seed_shop_nga', name: 'Jake Holloway', payPlan: 'hourly', flatRateMinor: 0n, hourlyRateMinor: 2400n, skills: ['Maintenance', 'Tires', 'Brakes'], rateClasses: ['general'],
    credentials: [{ kind: 'epa_609', identifier: 'ESCO 609-731560', issuedAt: '2023-04-11', expiresAt: '2026-04-11' }] },
  { id: 'seed_tech_ngt_morgan', userId: 'seed_user_morgan', shopId: 'seed_shop_ngt', name: 'Aisha Morgan', payPlan: 'flat_rate', flatRateMinor: 3000n, hourlyRateMinor: 0n, skills: ['Tires', 'Alignment', 'Oil and lube', 'Batteries'], rateClasses: ['general'],
    credentials: [{ kind: 'ase', identifier: 'ASE G1, A4', issuedAt: '2024-02-07', expiresAt: '2029-02-07' }] },
]

const day = (value: string | null) => (value ? new Date(`${value}T00:00:00Z`) : null)

export async function seedLabor(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  const counts = { technicians: 0, credentials: 0 }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  for (const t of TECHS) {
    if (await tx.technicianProfile.findFirst({ where: { userId: t.userId, shopId: t.shopId }, select: { id: true } })) continue
    const user = await tx.user.findUnique({ where: { id: t.userId }, select: { id: true } })
    if (!user) continue
    const row = await tx.technicianProfile.create({
      data: { id: t.id, userId: t.userId, shopId: t.shopId, displayName: t.name, payPlan: t.payPlan, flatRateMinor: t.flatRateMinor, hourlyRateMinor: t.hourlyRateMinor, skills: t.skills, rateClasses: t.rateClasses, active: true },
    })
    auditCreate(uow, actor, 'TechnicianProfile', row.id, 'technician.created', { name: t.name, payPlan: t.payPlan }, { metadata: { seed: true } })
    counts.technicians += 1
    for (const c of t.credentials) {
      const expiresAt = day(c.expiresAt)
      const cred = await tx.technicianCredential.create({
        data: { technicianId: row.id, kind: c.kind, identifier: c.identifier, issuedAt: day(c.issuedAt), expiresAt, status: expiresAt && expiresAt < today ? 'expired' : 'active' },
      })
      auditCreate(uow, actor, 'TechnicianCredential', cred.id, 'credential.recorded', { technician: t.name, kind: c.kind, expiresAt }, { metadata: { seed: true } })
      counts.credentials += 1
    }
  }
  return counts
}
