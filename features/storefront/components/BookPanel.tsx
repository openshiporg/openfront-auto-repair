'use client'

import * as React from 'react'
import Link from 'next/link'
import { Calendar, Car, Wrench } from 'lucide-react'

type Time = { iso: string; label: string }

/**
 * The booking start on the home page: vehicle, service, wait or drop off, and the next open times.
 * "Book" carries the choices to /book, where the name and phone are taken and the appointment is made.
 */
export function BookPanel({ shopName, shopPhone, services, times }: {
  shopName: string
  shopPhone: string
  services: { slug: string; name: string }[]
  times: { waiter: Time[]; drop_off: Time[] }
}) {
  const [kind, setKind] = React.useState<'waiter' | 'drop_off'>(times.waiter.length || !times.drop_off.length ? 'waiter' : 'drop_off')
  const offered = times[kind]
  const [at, setAt] = React.useState(offered[0]?.iso ?? '')
  React.useEffect(() => {
    if (!offered.some(t => t.iso === at)) setAt(offered[0]?.iso ?? '')
  }, [offered, at])

  return (
    <form action="/book" method="get" className="sf-panel-lg-accent lg:px-8 lg:pb-4 lg:pt-3">
      <h2 className="sf-display text-[30px] lg:text-[42px]">Book a repair</h2>
      <p className="mt-1 hidden text-[19px] lg:block">Schedule service at {shopName}.</p>

      <div className="mt-3 space-y-2 lg:mt-3 lg:space-y-3">
        <div>
          <label htmlFor="home-vehicle" className="sf-label sr-only mb-1 block text-[16px] lg:not-sr-only">Vehicle</label>
          <div className="relative">
            <Car size={26} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 lg:hidden" aria-hidden="true" />
            <input id="home-vehicle" name="vehicle" className="sf-field !pl-[60px] lg:!pl-3" placeholder="Year, make, model or licence plate" autoComplete="off" maxLength={120} />
          </div>
        </div>

        <div>
          <label htmlFor="home-service" className="sf-label sr-only mb-1 block text-[16px] lg:not-sr-only">Service</label>
          <div className="relative">
            <Wrench size={26} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 lg:hidden" aria-hidden="true" />
            <select id="home-service" name="service" defaultValue="" className="sf-field !pl-[60px] lg:!pl-3">
              <option value="">Select a service</option>
              {services.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </div>
        </div>

        {/* Phone order: open times, then wait or drop off. Desktop order: the other way round. */}
        <div className="flex flex-col gap-2 lg:flex-col-reverse lg:gap-2">
          <fieldset className="rounded border border-[#aab1b8] px-4 py-2 lg:border-0 lg:p-0">
            <legend className="sf-label sr-only text-[16px] lg:not-sr-only lg:mb-1">Appointment time</legend>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Calendar size={26} className="shrink-0 lg:hidden" aria-hidden="true" />
              <span className="mr-auto whitespace-nowrap text-[17px] lg:hidden" aria-hidden="true">Next open times</span>
              {offered.length ? (
                <div className="flex min-w-0 max-w-full flex-col gap-1 lg:w-full lg:flex-row lg:gap-3" role="radiogroup" aria-label="Appointment time">
                  {offered.map(t => (
                    <button key={t.iso} type="button" role="radio" aria-checked={at === t.iso} onClick={() => setAt(t.iso)} className="sf-btn-line !px-3 text-[16px] lg:flex-1 lg:whitespace-nowrap lg:text-[17px]">{t.label}</button>
                  ))}
                </div>
              ) : (
                <p className="text-[15px]">No open times online this week.{shopPhone ? <> Call <span className="sf-num">{shopPhone}</span>.</> : null}</p>
              )}
            </div>
            <input type="hidden" name="at" value={at} />
          </fieldset>

          <fieldset className="rounded border border-[#aab1b8] px-4 lg:border-0 lg:p-0">
            <legend className="sf-label sr-only text-[16px] lg:not-sr-only">At the shop</legend>
            <div className="flex gap-8 lg:gap-10">
              <label className="sf-radio text-[17px]"><input type="radio" name="kind" value="waiter" checked={kind === 'waiter'} onChange={() => setKind('waiter')} />Wait at the shop</label>
              <label className="sf-radio text-[17px]"><input type="radio" name="kind" value="drop_off" checked={kind === 'drop_off'} onChange={() => setKind('drop_off')} />Drop off</label>
            </div>
          </fieldset>
        </div>

        <button type="submit" className="sf-btn sf-btn-wide !text-[20px]">Book</button>
        <p className="!mt-0 text-center text-[15px]"><Link href="/book" className="inline-flex min-h-11 items-center hover:underline">See all open times</Link></p>
      </div>
    </form>
  )
}
