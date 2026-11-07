import { fixtureAdapter, FIXTURE_VINS } from '../../integrations/vehicle-data/fixtures'
import { withCheckDigit } from '../../integrations/vehicle-data/vin'
import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import { nextBusinessDay, zonedInstant } from '../lib/calendar'
import { createBusinessAccount, recordConsent, upsertCustomer } from '../lib/customers'
import { bookAppointment, loadShopCalendar } from '../lib/scheduling'
import type { UnitOfWork } from '../lib/unitOfWork'
import { recordOdometer, storeDecode, storeRecallCheck, upsertVehicle } from '../lib/vehicles'

/*
 * Customers, vehicles, fleets, booking rules and a few upcoming appointments (BUILD-PLAN §5).
 * Every name is fictitious; phone numbers are in the 555-01xx range kept for fiction; emails use
 * example.com. Built through the same commands staff use, with fixed ids, so a second load creates nothing.
 */

type VehicleSeed = { vin: string; year: number; make: string; model: string; trim?: string; color?: string; plate?: string; odometer: number }
type ConsentSeed = 'transactional' | 'marketing' | 'stopped' | 'email_only' | 'none'
type CustomerSeed = { first: string; last: string; shop: 'nga' | 'ngt'; consent: ConsentSeed; email?: boolean; vehicles: VehicleSeed[]; notes?: string }

/** A fictitious 17-character VIN with a correct check digit: 8-character prefix, model-year code, plant, serial. */
const vin = (prefix: string, yearCode: string, plant: string, serial: number) => withCheckDigit(`${prefix}0${yearCode}${plant}${String(serial).padStart(6, '0')}`)

const V = {
  accord18: (n: number, extra: Partial<VehicleSeed> = {}): VehicleSeed => ({ vin: n === 1 ? FIXTURE_VINS.clean : vin('1HGCV1F3', 'J', 'A', 100 + n), year: 2018, make: 'Honda', model: 'Accord', trim: 'LX', odometer: 61_200 + n * 731, ...extra }),
  camry16: (n: number): VehicleSeed => ({ vin: vin('4T1BF1FK', 'G', 'U', 200 + n), year: 2016, make: 'Toyota', model: 'Camry', trim: 'SE', odometer: 98_400 + n * 913 }),
  f150_19: (n: number): VehicleSeed => ({ vin: vin('1FTEW1E5', 'K', 'F', 300 + n), year: 2019, make: 'Ford', model: 'F-150', trim: 'XLT', odometer: 74_050 + n * 1_207 }),
  model3_20: (n: number): VehicleSeed => ({ vin: vin('5YJ3E1EA', 'L', 'F', 400 + n), year: 2020, make: 'Tesla', model: 'Model 3', trim: 'Standard Range Plus', odometer: 41_900 + n * 517 }),
  bmw328_14: (n: number): VehicleSeed => ({ vin: vin('WBA3A5C5', 'E', 'J', 500 + n), year: 2014, make: 'BMW', model: '328i', odometer: 121_300 + n * 640 }),
  sienna12: (n: number): VehicleSeed => ({ vin: vin('5TDKK3DC', 'C', 'S', 600 + n), year: 2012, make: 'Toyota', model: 'Sienna', trim: 'LE', odometer: 156_700 + n * 388 }),
  sportage17: (n: number): VehicleSeed => ({ vin: vin('KNDPM3AC', 'H', '7', 700 + n), year: 2017, make: 'Kia', model: 'Sportage', trim: 'LX', odometer: 88_900 + n * 455 }),
  civic21: (n: number): VehicleSeed => ({ vin: vin('2HGFC2F5', 'M', 'H', 800 + n), year: 2021, make: 'Honda', model: 'Civic', trim: 'Sport', odometer: 33_100 + n * 702 }),
  rav4_19: (n: number): VehicleSeed => ({ vin: vin('2T3P1RFV', 'K', 'W', 900 + n), year: 2019, make: 'Toyota', model: 'RAV4', trim: 'XLE', odometer: 58_300 + n * 377 }),
  silverado15: (n: number): VehicleSeed => ({ vin: vin('3GCUKREC', 'F', 'G', 1000 + n), year: 2015, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT', odometer: 142_800 + n * 991 }),
  outback18: (n: number): VehicleSeed => ({ vin: vin('4S4BSANC', 'J', '3', 1100 + n), year: 2018, make: 'Subaru', model: 'Outback', trim: '2.5i Premium', odometer: 79_500 + n * 288 }),
  a4_17: (n: number): VehicleSeed => ({ vin: vin('WAUENAF4', 'H', 'N', 1200 + n), year: 2017, make: 'Audi', model: 'A4', trim: 'Premium', odometer: 87_600 + n * 503 }),
  odyssey20: (n: number): VehicleSeed => ({ vin: vin('5FNRL6H7', 'L', 'B', 1300 + n), year: 2020, make: 'Honda', model: 'Odyssey', trim: 'EX-L', odometer: 52_700 + n * 619 }),
  wrangler16: (n: number): VehicleSeed => ({ vin: vin('1C4BJWDG', 'G', 'L', 1400 + n), year: 2016, make: 'Jeep', model: 'Wrangler Unlimited', trim: 'Sahara', odometer: 104_200 + n * 822 }),
  prius13: (n: number): VehicleSeed => ({ vin: vin('JTDKN3DU', 'D', '5', 1500 + n), year: 2013, make: 'Toyota', model: 'Prius', trim: 'Two', odometer: 187_400 + n * 260 }),
}

export const CUSTOMERS: CustomerSeed[] = [
  { first: 'Maria', last: 'Gonzalez', shop: 'nga', consent: 'marketing', vehicles: [V.accord18(1, { color: 'Lunar Silver', plate: '8ABC123' })], notes: 'Prefers texts. Usually waits for oil changes.' },
  { first: 'James', last: 'Whitaker', shop: 'nga', consent: 'transactional', vehicles: [V.camry16(1)] },
  { first: 'Linda', last: 'Nguyen', shop: 'nga', consent: 'stopped', email: true, vehicles: [V.sienna12(1)], notes: 'Replied STOP to texts. Email only.' },
  { first: 'Robert', last: 'Okafor', shop: 'nga', consent: 'transactional', vehicles: [V.f150_19(1), V.camry16(2)] },
  { first: 'Patricia', last: 'Lindqvist', shop: 'nga', consent: 'marketing', vehicles: [V.bmw328_14(1)] },
  { first: 'Michael', last: 'Brennan', shop: 'nga', consent: 'transactional', vehicles: [V.model3_20(1)] },
  { first: 'Jennifer', last: 'Castillo', shop: 'nga', consent: 'transactional', vehicles: [V.sportage17(1)], notes: 'Kia Sportage: open recall with a park-outside warning.' },
  { first: 'David', last: 'Kowalski', shop: 'nga', consent: 'none', vehicles: [V.silverado15(1)] },
  { first: 'Elizabeth', last: 'Moreno', shop: 'nga', consent: 'marketing', vehicles: [V.rav4_19(1)] },
  { first: 'William', last: 'Tanaka', shop: 'nga', consent: 'transactional', vehicles: [V.a4_17(1)] },
  { first: 'Barbara', last: 'Fitzgerald', shop: 'nga', consent: 'email_only', email: true, vehicles: [V.outback18(1)] },
  { first: 'Richard', last: 'Haddad', shop: 'nga', consent: 'transactional', vehicles: [V.wrangler16(1)] },
  { first: 'Susan', last: 'Abernathy', shop: 'nga', consent: 'transactional', vehicles: [V.odyssey20(1)] },
  { first: 'Joseph', last: 'Delacroix', shop: 'nga', consent: 'marketing', vehicles: [V.prius13(1)] },
  { first: 'Jessica', last: 'Romero', shop: 'nga', consent: 'transactional', vehicles: [V.civic21(1)] },
  { first: 'Thomas', last: 'Sorensen', shop: 'nga', consent: 'transactional', vehicles: [V.accord18(2)] },
  { first: 'Sarah', last: 'Mbeki', shop: 'nga', consent: 'transactional', vehicles: [V.camry16(3)] },
  { first: 'Charles', last: 'Ferreira', shop: 'nga', consent: 'none', vehicles: [V.f150_19(2)] },
  { first: 'Karen', last: 'Iwasaki', shop: 'nga', consent: 'marketing', vehicles: [V.bmw328_14(2)] },
  { first: 'Christopher', last: 'Novak', shop: 'nga', consent: 'transactional', vehicles: [V.model3_20(2)] },
  { first: 'Nancy', last: 'Barrios', shop: 'nga', consent: 'transactional', vehicles: [V.sienna12(2)] },
  { first: 'Daniel', last: 'Achterberg', shop: 'nga', consent: 'transactional', vehicles: [V.a4_17(2)] },
  { first: 'Lisa', last: 'Petrosyan', shop: 'nga', consent: 'email_only', email: true, vehicles: [V.rav4_19(2)] },
  { first: 'Matthew', last: 'Oyelaran', shop: 'nga', consent: 'transactional', vehicles: [V.outback18(2)] },
  { first: 'Betty', last: 'Villanueva', shop: 'nga', consent: 'transactional', vehicles: [V.prius13(2)] },
  { first: 'Anthony', last: 'Gallagher', shop: 'nga', consent: 'marketing', vehicles: [V.silverado15(2)] },
  { first: 'Margaret', last: 'Chen', shop: 'nga', consent: 'transactional', vehicles: [V.odyssey20(2)] },
  { first: 'Mark', last: 'Esposito', shop: 'nga', consent: 'transactional', vehicles: [V.wrangler16(2)] },
  { first: 'Sandra', last: 'Kaur', shop: 'ngt', consent: 'transactional', vehicles: [V.civic21(2)] },
  { first: 'Donald', last: 'Reyes', shop: 'ngt', consent: 'marketing', vehicles: [V.f150_19(3)] },
  { first: 'Ashley', last: 'Brandt', shop: 'ngt', consent: 'transactional', vehicles: [V.rav4_19(3)] },
  { first: 'Steven', last: 'Mwangi', shop: 'ngt', consent: 'transactional', vehicles: [V.camry16(4)] },
  { first: 'Kimberly', last: 'Lund', shop: 'ngt', consent: 'none', vehicles: [V.outback18(3)] },
  { first: 'Paul', last: 'Arroyo', shop: 'ngt', consent: 'transactional', vehicles: [V.silverado15(3)] },
  { first: 'Emily', last: 'Rasmussen', shop: 'ngt', consent: 'marketing', vehicles: [V.model3_20(3)] },
  { first: 'Andrew', last: 'Takahashi', shop: 'ngt', consent: 'transactional', vehicles: [V.accord18(3)] },
  { first: 'Donna', last: 'Ellison', shop: 'ngt', consent: 'transactional', vehicles: [V.sienna12(3)] },
  { first: 'Joshua', last: 'Obi', shop: 'ngt', consent: 'transactional', vehicles: [V.wrangler16(3)] },
  { first: 'Michelle', last: 'Vasquez', shop: 'ngt', consent: 'email_only', email: true, vehicles: [V.civic21(3)] },
  { first: 'Kevin', last: 'Duarte', shop: 'ngt', consent: 'transactional', vehicles: [V.sportage17(2)] },
]

const VANS: VehicleSeed[] = [
  ...Array.from({ length: 7 }, (_, i) => ({ vin: vin('1GCWGAFP', 'K', '1', 2000 + i), year: 2019, make: 'Chevrolet', model: 'Express 2500', trim: 'Cargo', color: 'White', plate: `CVP${String(i + 1).padStart(3, '0')}`, odometer: 96_000 + i * 6_350 })),
  ...Array.from({ length: 5 }, (_, i) => ({ vin: vin('1FTBR1C8', 'L', 'K', 2100 + i), year: 2020, make: 'Ford', model: 'Transit 250', trim: 'Cargo', color: 'White', plate: `CVP${String(i + 8).padStart(3, '0')}`, odometer: 71_000 + i * 5_120 })),
]
const LIBRARY_VEHICLES: VehicleSeed[] = [
  { vin: vin('1FMCU0F6', 'N', 'U', 3001), year: 2022, make: 'Ford', model: 'Escape', trim: 'SE Hybrid', color: 'White', plate: 'E123456', odometer: 28_400 },
  { vin: vin('1FTBR1C8', 'N', 'K', 3002), year: 2022, make: 'Ford', model: 'Transit 250', trim: 'Bookmobile', color: 'Blue', plate: 'E123457', odometer: 19_900 },
]

export const FLEETS = [
  { id: 'seed_acct_cvp', customerId: 'seed_cust_fleet_cvp', name: 'Capital Valley Plumbing', termsDays: 30, poRequired: true, creditLimitMinor: 1_500_000n, billingMode: 'statement_monthly' as const, email: 'fleet@capitalvalleyplumbing.example', phone: '+19165550190', shop: 'nga' as const, vehicles: VANS, note: 'Net 30, PO required. Approvers: $750 (fleet coordinator) and $3,000 (operations manager) - fleet approval rules arrive in Phase 6.' },
  { id: 'seed_acct_sacl', customerId: 'seed_cust_fleet_sacl', name: 'Sac County Library Services', termsDays: 30, poRequired: false, creditLimitMinor: 500_000n, billingMode: 'per_invoice' as const, email: 'facilities@saclibrary.example', phone: '+19165550191', shop: 'nga' as const, vehicles: LIBRARY_VEHICLES, note: 'Government account. Tax-exempt certificate on file in Phase 6.' },
]

export const BOOKING_RULES: Record<'nga' | 'ngt', [string, unknown][]> = {
  nga: [['slot_minutes', 30], ['max_dropoffs_per_day', 18], ['waiter_slots_per_hour', 2], ['max_bay_hours_per_day', 5700], ['no_waiters_after', '15:00'], ['lead_time_hours', 2]],
  ngt: [['slot_minutes', 30], ['max_dropoffs_per_day', 14], ['waiter_slots_per_hour', 3], ['max_bay_hours_per_day', 4000], ['no_waiters_after', '16:00'], ['lead_time_hours', 1]],
}

const SHOP_ID = { nga: 'seed_shop_nga', ngt: 'seed_shop_ngt' } as const
/** 916-555-0100 to 0139: the 555-01xx block is reserved for fiction. */
const phone = (n: number) => `+19165550${100 + n}`
const email = (c: CustomerSeed) => `${c.first}.${c.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com'
export const customerId = (i: number) => `seed_cust_${String(i + 1).padStart(2, '0')}`
const vehicleId = (owner: string, j: number) => `seed_veh_${owner.replace(/^seed_cust_/, '')}_${j + 1}`

export async function seedBookingRules(uow: UnitOfWork, actor: Actor) {
  let created = 0
  for (const [shop, rules] of Object.entries(BOOKING_RULES) as ['nga' | 'ngt', [string, unknown][]][]) {
    if (!(await uow.tx.shop.findUnique({ where: { id: SHOP_ID[shop] }, select: { id: true } }))) continue
    for (const [kind, value] of rules) {
      const id = `seed_rule_${shop}_${kind}`
      if (await uow.tx.bookingRule.findUnique({ where: { id } })) continue
      await uow.tx.bookingRule.create({ data: { id, shopId: SHOP_ID[shop], kind, value: value as never, appliesToDays: [], active: true } })
      auditCreate(uow, actor, 'BookingRule', id, 'booking_rule.created', { shopId: SHOP_ID[shop], kind, value }, { metadata: { seed: true } })
      created += 1
    }
  }
  return created
}

const RECALL_FIXTURES = [{ make: 'Honda', model: 'Accord', year: 2018 }, { make: 'Kia', model: 'Sportage', year: 2017 }]

/**
 * Recorded NHTSA responses for the fixture vehicles: the decode for the fixture VIN and the recall
 * check for the fixture make/model/years. The fixture adapter runs in memory (live calls never run inside a
 * transaction). Each is added once: a vehicle that already has one is left alone.
 */
async function seedVehicleData(uow: UnitOfWork, actor: Actor, vehicleId: string, v: Pick<VehicleSeed, 'vin' | 'make' | 'model' | 'year'>) {
  const fixtures = fixtureAdapter()
  if (v.vin === FIXTURE_VINS.clean && !(await uow.tx.vehicleDecode.count({ where: { vehicleId } }))) {
    const decoded = await fixtures.decodeVin(v.vin)
    if (decoded.kind === 'ok') await storeDecode(uow, actor, vehicleId, decoded.value, uow.now, true)
  }
  if (RECALL_FIXTURES.some(f => f.make === v.make && f.model === v.model && f.year === v.year) && !(await uow.tx.recallCheck.count({ where: { vehicleId } }))) {
    const query = { make: v.make, model: v.model, modelYear: v.year }
    const recalls = await fixtures.recallsByVehicle(query)
    if (recalls.kind === 'ok') await storeRecallCheck(uow, actor, vehicleId, query, recalls.value, uow.now, true)
  }
}

/** Fill the recorded NHTSA data for seeded vehicles that don't have it yet (also repairs earlier partial loads). */
export async function seedRecordedVehicleData(uow: UnitOfWork, actor: Actor) {
  const before = await uow.tx.recallCheck.count() + await uow.tx.vehicleDecode.count()
  const vehicles = await uow.tx.vehicle.findMany({ where: { id: { startsWith: 'seed_veh_' }, OR: [{ vin: FIXTURE_VINS.clean }, ...RECALL_FIXTURES.map(f => ({ make: f.make, model: f.model, year: f.year }))] }, select: { id: true, vin: true, make: true, model: true, year: true } })
  for (const v of vehicles) await seedVehicleData(uow, actor, v.id, { vin: v.vin, make: v.make, model: v.model, year: v.year ?? 0 })
  return (await uow.tx.recallCheck.count()) + (await uow.tx.vehicleDecode.count()) - before
}

async function seedVehicle(uow: UnitOfWork, actor: Actor, id: string, v: VehicleSeed, owner: { customerId?: string; businessAccountId?: string }) {
  if (await uow.tx.vehicle.findUnique({ where: { id }, select: { id: true } })) return false
  const { id: savedId } = await upsertVehicle(uow, actor, {
    createId: id, vin: v.vin, year: v.year, make: v.make, model: v.model, trim: v.trim ?? '', color: v.color ?? '',
    customerId: owner.customerId ?? null, businessAccountId: owner.businessAccountId ?? null,
    plate: v.plate ? { plate: v.plate, state: 'CA' } : null,
  })
  await recordOdometer(uow, actor, { vehicleId: savedId, value: v.odometer, source: 'import' })
  await seedVehicleData(uow, actor, savedId, v)
  return true
}

/** Customers [from, to) with contacts, consent history and vehicles. */
export async function seedCustomers(uow: UnitOfWork, actor: Actor, from = 0, to = CUSTOMERS.length) {
  const created = { customers: 0, vehicles: 0, consents: 0 }
  for (let i = from; i < Math.min(to, CUSTOMERS.length); i += 1) {
    const c = CUSTOMERS[i]
    const id = customerId(i)
    if (!(await uow.tx.shop.findUnique({ where: { id: SHOP_ID[c.shop] }, select: { id: true } }))) continue
    if (!(await uow.tx.customer.findUnique({ where: { id }, select: { id: true } }))) {
      const contacts = [{ kind: 'mobile' as const, value: phone(i), isPrimary: true }, ...(c.email || c.consent === 'marketing' || i % 3 === 0 ? [{ kind: 'email' as const, value: email(c), isPrimary: true }] : [])]
      await upsertCustomer(uow, actor, {
        createId: id, firstName: c.first, lastName: c.last, homeShopId: SHOP_ID[c.shop], notes: c.notes ?? '',
        preferredChannel: c.consent === 'stopped' || c.consent === 'email_only' ? 'email' : 'sms', contacts,
      })
      created.customers += 1
      const rows = await uow.tx.customerContact.findMany({ where: { customerId: id }, select: { id: true, kind: true } })
      const mobile = rows.find(r => r.kind === 'mobile')!
      const mail = rows.find(r => r.kind === 'email')
      const grant = async (contactId: string, channel: 'sms' | 'email', purpose: 'transactional' | 'marketing', written: boolean) => {
        await recordConsent(uow, actor, { contactId, channel, purpose, action: 'granted', method: written ? 'in_person_form' : 'staff_recorded', writtenConsent: written, evidence: { source: 'Northgate check-in form', seed: true } })
        created.consents += 1
      }
      if (c.consent !== 'none' && c.consent !== 'email_only') await grant(mobile.id, 'sms', 'transactional', false)
      if (c.consent === 'marketing') await grant(mobile.id, 'sms', 'marketing', true)
      if (mail && c.consent !== 'none') await grant(mail.id, 'email', 'transactional', false)
      if (mail && c.consent === 'marketing') await grant(mail.id, 'email', 'marketing', false)
      if (c.consent === 'stopped') {
        // The customer replied STOP: every text stops; email stays the fallback.
        await recordConsent(uow, actor, { contactId: mobile.id, channel: 'sms', purpose: 'all', action: 'revoked', method: 'keyword_reply', evidence: { keyword: 'STOP', seed: true } })
        created.consents += 1
      }
    }
    for (const [j, v] of c.vehicles.entries()) if (await seedVehicle(uow, actor, vehicleId(id, j), v, { customerId: id })) created.vehicles += 1
  }
  return created
}

export async function seedFleets(uow: UnitOfWork, actor: Actor) {
  const created = { accounts: 0, vehicles: 0 }
  for (const f of FLEETS) {
    if (!(await uow.tx.businessAccount.findUnique({ where: { id: f.id }, select: { id: true } }))) {
      await createBusinessAccount(uow, actor, { createId: f.id, name: f.name, termsDays: f.termsDays, poRequired: f.poRequired, creditLimitMinor: f.creditLimitMinor, billingMode: f.billingMode })
      created.accounts += 1
    }
    if (!(await uow.tx.customer.findUnique({ where: { id: f.customerId }, select: { id: true } }))) {
      await upsertCustomer(uow, actor, {
        createId: f.customerId, kind: 'business', companyName: f.name, homeShopId: SHOP_ID[f.shop], preferredChannel: 'email', notes: f.note,
        contacts: [{ kind: 'email', value: f.email, isPrimary: true }, { kind: 'landline', value: f.phone, isPrimary: true }],
      })
      await uow.tx.customer.update({ where: { id: f.customerId }, data: { businessAccountId: f.id, version: { increment: 1 } } })
      auditCreate(uow, actor, 'Customer', f.customerId, 'customer.business_account_linked', { businessAccountId: f.id }, { metadata: { seed: true } })
      const mail = await uow.tx.customerContact.findFirst({ where: { customerId: f.customerId, kind: 'email' }, select: { id: true } })
      if (mail) await recordConsent(uow, actor, { contactId: mail.id, channel: 'email', purpose: 'transactional', action: 'granted', method: 'staff_recorded', evidence: { source: 'Fleet agreement', seed: true } })
    }
    for (const [j, v] of f.vehicles.entries()) if (await seedVehicle(uow, actor, `seed_veh_${f.id.replace(/^seed_acct_/, '')}_${String(j + 1).padStart(2, '0')}`, v, { businessAccountId: f.id })) created.vehicles += 1
  }
  return created
}

/**
 * A few upcoming appointments on the next business days, so the schedule isn't empty on a fresh load.
 * Dates follow today, so they're created once (when no seeded customer has an appointment yet).
 */
export async function seedAppointments(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  if (await tx.appointment.count({ where: { customerId: { startsWith: 'seed_cust_' } } })) return 0
  const plan: { shop: 'nga' | 'ngt'; dayOffset: number; at: string; kind: 'drop_off' | 'waiter'; customer: number; services: string[]; concern: string; hours: number; confirm: boolean }[] = [
    { shop: 'nga', dayOffset: 0, at: '07:30', kind: 'drop_off', customer: 0, services: ['Oil and filter change', 'Tire rotation'], concern: '', hours: 100, confirm: true },
    { shop: 'nga', dayOffset: 0, at: '08:00', kind: 'drop_off', customer: 6, services: ['Recall check'], concern: 'Recall letter came in the mail. Also a check engine light since last week.', hours: 150, confirm: true },
    { shop: 'nga', dayOffset: 0, at: '09:00', kind: 'waiter', customer: 1, services: ['Oil and filter change'], concern: '', hours: 75, confirm: true },
    { shop: 'nga', dayOffset: 0, at: '10:30', kind: 'drop_off', customer: 4, services: ['Brake inspection'], concern: 'Grinding noise from the front when braking.', hours: 200, confirm: false },
    { shop: 'nga', dayOffset: 1, at: '08:00', kind: 'drop_off', customer: 3, services: ['60k service'], concern: '', hours: 300, confirm: true },
    { shop: 'nga', dayOffset: 1, at: '13:00', kind: 'drop_off', customer: 9, services: ['Diagnosis'], concern: 'Coolant smell after driving; temperature gauge reads normal.', hours: 150, confirm: false },
    { shop: 'ngt', dayOffset: 0, at: '08:30', kind: 'waiter', customer: 28, services: ['Four new tires', 'Alignment'], concern: '', hours: 150, confirm: true },
    { shop: 'ngt', dayOffset: 1, at: '10:00', kind: 'waiter', customer: 29, services: ['Oil and filter change'], concern: '', hours: 50, confirm: false },
  ]
  let created = 0
  for (const p of plan) {
    const shopId = SHOP_ID[p.shop]
    const customer = customerId(p.customer)
    const vehicle = await tx.vehicleOwnership.findFirst({ where: { customerId: customer, endedAt: null }, select: { vehicleId: true } })
    if (!vehicle) continue
    const { calendar } = await loadShopCalendar(tx, shopId)
    let date = nextBusinessDay(calendar, now.toISOString().slice(0, 10))
    for (let k = 0; k < p.dayOffset; k += 1) date = nextBusinessDay(calendar, date)
    const startsAt = zonedInstant(calendar.timeZone, date, p.at)
    await bookAppointment(uow, actor, {
      shopId, startsAt, kind: p.kind, estimatedCentiHours: p.hours, customerId: customer, vehicleId: vehicle.vehicleId,
      concernText: p.concern, requestedServices: p.services, source: 'staff', confirm: p.confirm,
    })
    created += 1
  }
  return created
}
