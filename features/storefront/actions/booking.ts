'use server'

import { systemActor } from '@/features/keystone/lib/actor'
import { normalizeContact } from '@/features/keystone/lib/customers'
import { isDomainError } from '@/features/keystone/lib/errors'
import { bookAppointment, type AppointmentKind } from '@/features/keystone/lib/scheduling'
import { runInTransaction } from '@/features/keystone/lib/unitOfWork'
import { openDays, type OpenDay } from '../lib/availability'
import { getStorefront, pickService, storefrontDb } from '../lib/data'
import { dateTimeAt } from '../lib/format'
import { caller, limited } from '../lib/guard'

/*
 * Online booking. The appointment is written by the same scheduling code the front counter uses
 * (bookAppointment: opening hours, booking rules and capacity under the day's lock), with the
 * source "storefront_api". It arrives as a request with the caller's name, phone and vehicle;
 * the shop matches it to a customer record and confirms it.
 */

const CUSTOMER = systemActor('storefront')
const kindOf = (value: unknown): AppointmentKind => (value === 'drop_off' ? 'drop_off' : 'waiter')

export type BookingState = {
  ok: boolean
  message: string
  field?: string
  booked?: { reference: string; when: string; shopName: string; shopPhone: string; service: string; kind: AppointmentKind; vehicle: string }
}

export async function loadOpenDays(input: { shopId: string; kind: string; serviceSlug: string }): Promise<OpenDay[]> {
  const store = await getStorefront()
  const shop = store?.shops.find(s => s.id === input.shopId)
  if (!store || !shop) return []
  const { ip } = await caller()
  if (limited('open-times', ip, 60)) return []
  const service = pickService(store, input.serviceSlug)
  return openDays({ shopId: shop.id, kind: kindOf(input.kind), centiHours: service?.centiHours ?? 100, days: 6 })
}

export async function bookRepair(_previous: BookingState, form: FormData): Promise<BookingState> {
  const value = (name: string) => String(form.get(name) ?? '').trim()
  const store = await getStorefront()
  if (!store) return { ok: false, message: 'Online booking is not open yet. Please call the shop.' }
  const { ip } = await caller()
  if (limited('book', ip, 6)) return { ok: false, message: 'Too many tries. Wait a minute and try again, or call the shop.' }

  const shop = store.shops.find(s => s.id === value('shopId')) ?? store.shop
  const service = pickService(store, value('service'))
  const name = value('name').slice(0, 120)
  const vehicle = value('vehicle').slice(0, 120)
  const concern = value('concern').slice(0, 2000)
  const startsAt = new Date(value('startsAt'))
  const kind = kindOf(value('kind'))

  if (!vehicle) return { ok: false, field: 'vehicle', message: 'Tell us the vehicle: year, make and model, or the licence plate.' }
  if (!service && !concern) return { ok: false, field: 'service', message: 'Choose a service, or describe what the vehicle needs.' }
  if (Number.isNaN(startsAt.getTime())) return { ok: false, field: 'startsAt', message: 'Choose a time.' }
  if (!name) return { ok: false, field: 'name', message: 'Enter your name.' }
  let phone = ''
  try {
    phone = normalizeContact('mobile', value('phone'))
  } catch {
    return { ok: false, field: 'phone', message: 'Enter a phone number we can reach you on: 10 digits.' }
  }

  try {
    const made = await runInTransaction(storefrontDb(), uow => bookAppointment(uow, CUSTOMER, {
      shopId: shop.id, startsAt, kind, estimatedCentiHours: service?.centiHours ?? 100,
      lead: { name, phone, vehicle }, concernText: concern, requestedServices: service ? [service.name] : [], source: 'storefront_api',
    }), { actorKind: 'system' })
    return {
      ok: true, message: 'Your appointment request is in.',
      booked: { reference: made.reference, when: dateTimeAt(startsAt, shop.timeZone), shopName: shop.name, shopPhone: shop.phone, service: service?.name ?? 'Described below', kind, vehicle },
    }
  } catch (error) {
    if (isDomainError(error)) return { ok: false, field: 'startsAt', message: error.message }
    console.error('[storefront] booking failed')
    return { ok: false, message: `Something went wrong and the appointment was not booked. Please try again or call ${shop.name}${shop.phone ? ` on ${shop.phone}` : ''}.` }
  }
}
