import { actorFromSession, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { Codes, DomainError } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { CUSTOMERS, seedAppointments, seedBookingRules, seedCustomers, seedFleets } from '../seed/customers'
import { seedOrgPlatform } from '../seed/platform'
import { seedParts } from '../seed/parts'
import { seedLabor } from '../seed/labor'
import { seedCommunications } from '../seed/communications'
import { seedGoldenRepairOrder, seedServiceCatalog } from '../seed/repairOrders'
import { SHOP_POLICY, seedJurisdictions, seedShopPolicy } from '../seed/policy'

type Counts = Record<string, number>

/** Customers per transaction: each step stays well inside the transaction timeout against a remote database. */
const CUSTOMER_BATCH = 5

export type SetupScope = 'spine' | 'all'

/**
 * The load runs as a chain of steps, each its own idempotent command, so a retry resumes where it stopped.
 * `spine`: organisation, shops, people, policies, booking rules and the service catalog. `all` adds the demo customers, vehicles, fleets, appointments and the golden brake repair order.
 */
export function northgateSteps(actor: Actor, scope: SetupScope = 'all'): { name: string; run: (uow: UnitOfWork) => Promise<Counts> }[] {
  const steps: { name: string; run: (uow: UnitOfWork) => Promise<Counts> }[] = [
    { name: 'platform', run: uow => seedOrgPlatform(uow, actor) },
    { name: 'jurisdictions', run: uow => seedJurisdictions(uow, actor) },
    ...SHOP_POLICY.map(shop => ({ name: `policy_${shop.code.toLowerCase()}`, run: (uow: UnitOfWork) => seedShopPolicy(uow, actor, shop.id) })),
    { name: 'booking_rules', run: async uow => ({ bookingRules: await seedBookingRules(uow, actor) }) },
    { name: 'service_catalog', run: uow => seedServiceCatalog(uow, actor) },
  ]
  if (scope === 'spine') return steps
  for (let from = 0; from < CUSTOMERS.length; from += CUSTOMER_BATCH) {
    steps.push({ name: `customers_${from}`, run: uow => seedCustomers(uow, actor, from, from + CUSTOMER_BATCH) })
  }
  steps.push({ name: 'fleets', run: async uow => { const r = await seedFleets(uow, actor); return { fleetAccounts: r.accounts, fleetVehicles: r.vehicles } } })
  steps.push({ name: 'appointments', run: async uow => ({ appointments: await seedAppointments(uow, actor) }) })
  steps.push({ name: 'golden_repair_order', run: uow => seedGoldenRepairOrder(uow, actor) })
  steps.push({ name: 'parts_and_stock', run: uow => seedParts(uow, actor) })
  steps.push({ name: 'technicians', run: uow => seedLabor(uow, actor) })
  steps.push({ name: 'communications', run: uow => seedCommunications(uow, actor) })
  return steps
}

const add = (total: Counts, part: Counts) => {
  for (const [k, v] of Object.entries(part)) total[k] = (total[k] ?? 0) + v
  return total
}

/** Onboarding: load Northgate Auto Group. Idempotent per key and per record. */
export async function loadNorthgateSetup(_root: unknown, args: { idempotencyKey: string; scope?: SetupScope | null }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const created: Counts = {}
  let replay = true
  if (args.scope && !['spine', 'all'].includes(args.scope)) throw new DomainError(Codes.INVALID_INPUT, 'Scope is spine or all.', { field: 'scope' })
  for (const step of northgateSteps(actor, args.scope ?? 'all')) {
    const result = await command(context.prisma, { name: `setup.load_northgate.${step.name}`, actor, idempotencyKey: `${args.idempotencyKey}:${step.name}`, params: {} }, step.run)
    replay &&= result.replay
    add(created, result.value)
  }
  return { replay, created }
}
