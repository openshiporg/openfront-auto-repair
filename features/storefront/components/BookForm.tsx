'use client'

import * as React from 'react'
import Link from 'next/link'
import { bookRepair, loadOpenDays, type BookingState } from '../actions/booking'
import type { OpenDay } from '../lib/availability'

type Shop = { id: string; name: string; city: string; phone: string }
type Service = { slug: string; name: string; priceLine: string; description: string; shopId: string | null }

const START: BookingState = { ok: false, message: '' }

/** The whole booking: vehicle, service, shop, wait or drop off, an open time, and who to call. One submit makes the appointment. */
export function BookForm({ shops, services, initial, initialDays }: {
  shops: Shop[]
  services: Service[]
  initial: { vehicle: string; service: string; kind: 'waiter' | 'drop_off'; at: string; shopId: string }
  initialDays: OpenDay[]
}) {
  const [state, action, pending] = React.useActionState(bookRepair, START)
  const [service, setService] = React.useState(initial.service)
  const [shopId, setShopId] = React.useState(initial.shopId)
  const [kind, setKind] = React.useState(initial.kind)
  const [days, setDays] = React.useState(initialDays)
  const [at, setAt] = React.useState(initialDays.some(d => d.times.some(t => t.iso === initial.at)) ? initial.at : initialDays[0]?.times[0]?.iso ?? '')
  const [loading, startLoading] = React.useTransition()
  // Typed values are kept in state so a refused submit does not clear them.
  const [typed, setTyped] = React.useState({ vehicle: initial.vehicle, concern: '', name: '', phone: '' })
  const type = (key: keyof typeof typed) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTyped(t => ({ ...t, [key]: e.target.value }))
  const first = React.useRef(true)

  const chosen = services.find(s => s.slug === service) ?? null
  const fixedShop = chosen?.shopId ?? null
  const shop = shops.find(s => s.id === (fixedShop ?? shopId)) ?? shops[0]

  React.useEffect(() => {
    if (fixedShop && fixedShop !== shopId) setShopId(fixedShop)
  }, [fixedShop, shopId])

  // Open times depend on the shop, the visit kind and how long the service takes.
  React.useEffect(() => {
    if (first.current) { first.current = false; return }
    startLoading(async () => {
      const next = await loadOpenDays({ shopId: shop.id, kind, serviceSlug: service })
      setDays(next)
      setAt(current => (next.some(d => d.times.some(t => t.iso === current)) ? current : next[0]?.times[0]?.iso ?? ''))
    })
  }, [shop.id, kind, service])

  // A refused time (someone else took it) reloads what is still open.
  React.useEffect(() => {
    if (state.ok || state.field !== 'startsAt') return
    startLoading(async () => setDays(await loadOpenDays({ shopId: shop.id, kind, serviceSlug: service })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  if (state.ok && state.booked) {
    const b = state.booked
    return (
      <div className="sf-panel sf-panel-accent px-5 py-6 lg:px-8" role="status">
        <h2 className="sf-display text-[28px] lg:text-[36px]">Appointment requested</h2>
        <p className="mt-2 text-[17px]">Your time is held. A service advisor at {b.shopName} confirms it with you by phone.</p>
        <dl className="sf-rows-soft mt-4 text-[17px]">
          <div className="flex justify-between gap-4 py-2"><dt className="sf-label">Reference</dt><dd className="sf-num text-right">{b.reference}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="sf-label">When</dt><dd className="text-right">{b.when}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="sf-label">Where</dt><dd className="text-right">{b.shopName}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="sf-label">Vehicle</dt><dd className="break-words text-right">{b.vehicle}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="sf-label">Service</dt><dd className="text-right">{b.service}</dd></div>
          <div className="flex justify-between gap-4 py-2"><dt className="sf-label">At the shop</dt><dd className="text-right">{b.kind === 'waiter' ? 'Wait at the shop' : 'Drop off'}</dd></div>
        </dl>
        <p className="mt-4 text-[16px]">Need to change it?{b.shopPhone ? <> Call <span className="sf-num">{b.shopPhone}</span> with your reference.</> : ' Call the shop with your reference.'}</p>
        <p className="mt-5"><Link href="/" className="sf-btn-line">Back to the home page</Link></p>
      </div>
    )
  }

  // The day whose times are shown: the day of the chosen time.
  const day = days.find(d => d.times.some(t => t.iso === at)) ?? days[0]
  const zone = days[0]?.times[0]?.time.match(/[AP]M ([A-Z]{1,5})$/)?.[1] ?? ''
  const bad = (field: string) => (state.field === field ? { 'aria-invalid': true as const } : {})

  return (
    <form action={action} className="sf-panel sf-panel-accent space-y-5 px-5 py-6 lg:px-8">
      <input type="hidden" name="shopId" value={shop.id} />
      <input type="hidden" name="startsAt" value={at} />

      <div>
        <label htmlFor="book-vehicle" className="sf-label mb-1 block text-[16px]">Vehicle</label>
        <input id="book-vehicle" name="vehicle" value={typed.vehicle} onChange={type('vehicle')} className="sf-field" placeholder="Year, make, model or licence plate" autoComplete="off" maxLength={120} required {...bad('vehicle')} />
      </div>

      <div>
        <label htmlFor="book-service" className="sf-label mb-1 block text-[16px]">Service</label>
        <select id="book-service" name="service" value={service} onChange={e => setService(e.target.value)} className="sf-field" {...bad('service')}>
          <option value="">Something else: I will describe it</option>
          {services.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        {chosen ? <p className="mt-1 text-[15px]">{chosen.priceLine}{chosen.description ? `. ${chosen.description}` : ''}</p> : null}
      </div>

      {shops.length > 1 ? (
        <div>
          <label htmlFor="book-shop" className="sf-label mb-1 block text-[16px]">Shop</label>
          <select id="book-shop" value={shop.id} onChange={e => setShopId(e.target.value)} disabled={!!fixedShop} className="sf-field">
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}, {s.city}</option>)}
          </select>
          {fixedShop ? <p className="mt-1 text-[15px]">{chosen?.name} is done at {shop.name} in {shop.city}.</p> : null}
        </div>
      ) : null}

      <fieldset>
        <legend className="sf-label text-[16px]">At the shop</legend>
        <div className="flex flex-wrap gap-x-10">
          <label className="sf-radio text-[17px]"><input type="radio" name="kind" value="waiter" checked={kind === 'waiter'} onChange={() => setKind('waiter')} />Wait at the shop</label>
          <label className="sf-radio text-[17px]"><input type="radio" name="kind" value="drop_off" checked={kind === 'drop_off'} onChange={() => setKind('drop_off')} />Drop off</label>
        </div>
      </fieldset>

      {/* The shop's zone is said once in the legend instead of on every time button. */}
      <fieldset aria-busy={loading}>
        <legend className="sf-label mb-1 text-[16px]">Appointment time{zone ? <span className="sf-dim font-normal"> ({zone}, the shop's time)</span> : null}</legend>
        {days.length ? (
          <div className={loading ? 'opacity-60' : ''}>
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Day">
              {days.map(d => (
                <button key={d.date} type="button" role="tab" aria-selected={d.date === day?.date} onClick={() => setAt(d.times[0].iso)} className="sf-btn-line whitespace-nowrap !px-2 text-[16px] sm:!px-3">{d.label}</button>
              ))}
            </div>
            {day ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={`Times on ${day.label}`}>
                {day.times.map(t => (
                  <button key={t.iso} type="button" role="radio" aria-checked={at === t.iso} onClick={() => setAt(t.iso)} className="sf-btn-line sf-num whitespace-nowrap !px-2" aria-label={t.time}>{zone ? t.time.replace(` ${zone}`, '') : t.time}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-[16px]">{loading ? 'Loading open times.' : <>No open times online for this choice in the next days. Try drop off, or call {shop.name}{shop.phone ? <> on <span className="sf-num">{shop.phone}</span></> : null}.</>}</p>
        )}
        {state.field === 'startsAt' && state.message ? <p role="alert" className="sf-error mt-2 text-[15px]">{state.message}</p> : null}
      </fieldset>

      <div>
        <label htmlFor="book-concern" className="sf-label mb-1 block text-[16px]">What is going on with the vehicle? <span className="sf-dim" style={{ fontWeight: 400 }}>(optional)</span></label>
        <textarea id="book-concern" name="concern" value={typed.concern} onChange={type('concern')} className="sf-field" maxLength={2000} placeholder="Noises, warning lights, when it happens" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="book-name" className="sf-label mb-1 block text-[16px]">Your name</label>
          <input id="book-name" name="name" value={typed.name} onChange={type('name')} className="sf-field" autoComplete="name" maxLength={120} required {...bad('name')} />
        </div>
        <div>
          <label htmlFor="book-phone" className="sf-label mb-1 block text-[16px]">Phone</label>
          <input id="book-phone" name="phone" value={typed.phone} onChange={type('phone')} type="tel" inputMode="tel" className="sf-field sf-num" autoComplete="tel" maxLength={30} required {...bad('phone')} />
        </div>
      </div>

      {state.message && state.field !== 'startsAt' ? <p role="alert" className="sf-error text-[16px]">{state.message}</p> : null}
      <button type="submit" className="sf-btn sf-btn-wide !text-[20px]" disabled={pending || !at}>{pending ? 'Booking' : 'Book'}</button>
      <p className="text-[15px]">Booking holds your time. A service advisor confirms it with you by phone. No payment is taken now: you approve the estimate before any work starts.</p>
    </form>
  )
}
