import { actorFromSession, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import { Codes, DomainError } from '../lib/errors'
import type { UnitOfWork } from '../lib/unitOfWork'
import { CUSTOMERS, seedAppointments, seedBookingRules, seedCustomers, seedFleets } from '../seed/customers'
import { seedOrgPlatform, seedRolesAndRules } from '../seed/platform'
import { auditCreate } from '../lib/cas'
import { normalizeContact } from '../lib/customers'
import { decOrNull, toScale } from '../lib/decimal'
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

export type OwnShopInput = {
  name: string; code: string; legalName?: string; addressLine1: string; city: string; region: string; postalCode: string; phone: string; email?: string
  timeZone?: string; opens?: string; closes?: string; saturday?: boolean; laborRate: string; taxRate: string
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Checks the setup form; the message names the field so the dialog can show it in plain words. */
export function readOwnShop(input: OwnShopInput) {
  const bad = (field: string, message: string) => new DomainError(Codes.INVALID_INPUT, message, { field })
  const text = (v: unknown) => String(v ?? '').trim()
  const name = text(input.name)
  if (!name || name.length > 80) throw bad('name', 'Put in your shop name.')
  const code = text(input.code).toUpperCase()
  if (!/^[A-Z]{2,5}$/.test(code)) throw bad('code', 'The short code is 2 to 5 letters, for example MAIN. It starts every RO and invoice number.')
  const addressLine1 = text(input.addressLine1), city = text(input.city), postalCode = text(input.postalCode)
  if (!addressLine1 || !city || !postalCode) throw bad('addressLine1', 'Put in the street, city and ZIP code.')
  const region = text(input.region).toUpperCase()
  if (!/^[A-Z]{2}$/.test(region)) throw bad('region', 'The state is two letters, for example CA.')
  const phone = normalizeContact('landline', input.phone)
  const email = text(input.email) ? normalizeContact('email', input.email) : ''
  const opens = text(input.opens) || '08:00', closes = text(input.closes) || '17:30'
  if (!TIME.test(opens) || !TIME.test(closes) || closes <= opens) throw bad('opens', 'Opening hours are like 08:00 to 17:30.')
  const rate = decOrNull(text(input.laborRate).replace(/^\$/, ''))
  if (!rate || rate.lte(0) || rate.gt(1000) || rate.decimalPlaces() > 2) throw bad('laborRate', 'Put in your hourly labor rate, for example 165.')
  const tax = decOrNull(text(input.taxRate).replace(/%$/, ''))
  if (!tax || tax.lt(0) || tax.gte(20) || tax.decimalPlaces() > 4) throw bad('taxRate', 'Put in your sales tax rate in percent, for example 8.75.')
  return {
    name, code, legalName: text(input.legalName) || name, addressLine1, city, region, postalCode, phone, email,
    timeZone: text(input.timeZone) || 'America/Los_Angeles', opens, closes, saturday: Boolean(input.saturday),
    laborRateMinor: BigInt(toScale(rate.times(100), 0)), taxRate: toScale(tax.div(100), 'pct'),
  }
}

const OWN_RULES: [string, unknown][] = [['slot_minutes', 30], ['max_dropoffs_per_day', 12], ['waiter_slots_per_hour', 2], ['lead_time_hours', 2]]

/**
 * Onboarding, the default: start with the owner's own shop. Creates one shop from the form, the roles and
 * approval rules, the state rules, the shop's posted rate and tax, booking rules and the job catalog.
 * No example customers or staff. Idempotent per key; a second shop with the same code is refused.
 */
export async function startOwnShop(_root: unknown, args: { input: OwnShopInput; idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const shop = readOwnShop(args.input ?? ({} as OwnShopInput))
  const id = `shop_${shop.code.toLowerCase()}`
  const steps: { name: string; run: (uow: UnitOfWork) => Promise<Counts> }[] = [
    { name: 'shop', run: async uow => {
      const { tx, now } = uow
      if (await tx.shop.findFirst({ where: { OR: [{ id }, { code: shop.code }] }, select: { id: true } })) throw new DomainError(Codes.INVALID_INPUT, `A shop with code ${shop.code} already exists. Pick another code.`, { field: 'code' })
      if (!(await tx.organizationSettings.findUnique({ where: { id: 1 } }))) await tx.organizationSettings.create({ data: { id: 1, legalName: shop.legalName, displayName: shop.name, defaultTimeZone: shop.timeZone } })
      const weeklyHours = [1, 2, 3, 4, 5, ...(shop.saturday ? [6] : [])].map(dow => ({ dow, open: shop.opens, close: shop.closes }))
      const calendar = await tx.shopCalendar.create({ data: { id: `${id}_calendar`, name: `${shop.name} hours`, weeklyHours, coverageThrough: new Date(Date.UTC(now.getUTCFullYear() + 1, 11, 31)) } })
      await tx.shop.create({
        data: {
          id, code: shop.code, name: shop.name, legalName: shop.legalName, addressLine1: shop.addressLine1, city: shop.city, region: shop.region, postalCode: shop.postalCode,
          phone: shop.phone, email: shop.email, timeZone: shop.timeZone, registrations: {}, isPublished: true, calendarId: calendar.id,
        },
      })
      await tx.bay.createMany({ data: [1, 2, 3].map(n => ({ id: `${id}_b${n}`, shopId: id, code: `B${n}`, name: `Bay ${n}`, kind: 'general', active: true })) })
      if (actor.kind === 'user') await tx.shopMembership.create({ data: { id: `${actor.userId}_${id}`, userId: actor.userId, shopId: id, isDefault: true, status: 'active', startedAt: now } })
      for (const [kind, value] of OWN_RULES) await tx.bookingRule.create({ data: { id: `${id}_rule_${kind}`, shopId: id, kind, value: value as never, appliesToDays: [], active: true } })
      auditCreate(uow, actor, 'Shop', id, 'shop.created', { code: shop.code, name: shop.name, region: shop.region, bays: 3 })
      return { shops: 1, bays: 3, bookingRules: OWN_RULES.length }
    } },
    { name: 'roles', run: uow => seedRolesAndRules(uow, actor) },
    { name: 'jurisdictions', run: uow => seedJurisdictions(uow, actor) },
    { name: 'state_rules', run: async uow => {
      // The shop follows its state's published rules; a state without a pack is set under Policies.
      const pack = await uow.tx.jurisdictionPack.findFirst({ where: { region: shop.region }, select: { id: true } })
      const law = pack ? await uow.tx.jurisdictionPolicyVersion.findFirst({ where: { packId: pack.id, status: 'published' }, orderBy: { versionNumber: 'desc' }, select: { id: true } }) : null
      if (!pack) return { stateRules: 0 }
      await uow.tx.shop.update({ where: { id }, data: { jurisdictionPackId: pack.id, jurisdictionPolicyId: law?.id ?? null, version: { increment: 1 } } })
      return { stateRules: law ? 1 : 0 }
    } },
    { name: 'policy', run: uow => seedShopPolicy(uow, actor, id, { id, code: shop.code, region: shop.region, taxRate: shop.taxRate, rates: [{ code: 'general', name: 'General repair', rateMinor: shop.laborRateMinor, isDefault: true }, { code: 'diagnostic', name: 'Diagnostic', rateMinor: shop.laborRateMinor }] }) },
    { name: 'service_catalog', run: uow => seedServiceCatalog(uow, actor) },
  ]
  const created: Counts = {}
  for (const step of steps) {
    const result = await command(context.prisma, { name: `setup.own_shop.${step.name}`, actor, idempotencyKey: `${args.idempotencyKey}:${step.name}`, params: step.name === 'shop' ? { code: shop.code } : {} }, step.run)
    add(created, result.value)
  }
  return { shopId: id, created }
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
