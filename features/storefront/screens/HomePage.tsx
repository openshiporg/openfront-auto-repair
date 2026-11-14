import Image from 'next/image'
import { redirect } from 'next/navigation'
import { BookPanel } from '../components/BookPanel'
import { CheckRepair } from '../components/CheckRepair'
import { ServiceRows, TeamLists } from '../components/Lists'
import { nextTimes, openDays } from '../lib/availability'
import { getStorefront, shopPhoto } from '../lib/data'

export default async function HomePage() {
  const store = await getStorefront()
  // A fresh install has no shop yet: the staff dashboard sets one up.
  if (!store) redirect('/dashboard')
  const { shop } = store
  const waiter = await openDays({ shopId: shop.id, kind: 'waiter', centiHours: 100, days: 2, perDay: 2 })
  const dropOff = await openDays({ shopId: shop.id, kind: 'drop_off', centiHours: 100, days: 2, perDay: 2 })
  const times = { waiter: nextTimes(waiter, 2), drop_off: nextTimes(dropOff, 2) }
  const bookable = store.services.filter(s => s.bookable && (!s.shopId || s.shopId === shop.id)).map(s => ({ slug: s.slug, name: s.name }))
  const tagline = shop.tagline || 'Honest service. Skilled technicians. Back on the road, faster.'
  const bay = shopPhoto('bay.jpg')
  const team = shopPhoto('team.jpg')
  const hasTeam = store.technicians.length + store.advisors.length > 0

  return (
    <main>
      {/* First paint: book a repair and check a repair, over the bay photograph on a wide screen. */}
      <section className="relative overflow-hidden">
        {bay ? <Image src={bay} alt="" fill priority sizes="(min-width: 1024px) 100vw, 1px" className="hidden object-cover object-center lg:block lg:origin-[52%_60%] lg:scale-[1.12]" /> : <div className="sf-bay absolute inset-0 hidden lg:block" aria-hidden="true" />}
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/45 via-transparent to-black/45 lg:block" aria-hidden="true" />
        <div className="sf-wrap relative grid gap-0 py-3 lg:grid-cols-[minmax(0,495px)_1fr_minmax(0,495px)] lg:items-start lg:py-6">
          <div className="pb-4 lg:pb-0">
            <BookPanel shopName={shop.name} shopPhone={shop.phone} services={bookable} times={times} />
          </div>
          <div className="hidden lg:block" />
          <div className="border-t sf-hair pt-4 lg:border-0 lg:pt-0">
            <div className="sf-panel-lg lg:px-7 lg:pb-6 lg:pt-3">
              <h2 className="sf-display text-[30px] lg:text-[38px]">Check my repair</h2>
              <p className="mb-3 hidden text-[18px] lg:block">Repair status, inspection results, and estimate.</p>
              <div className="mt-2 lg:mt-0"><CheckRepair idPrefix="home-check" /></div>
            </div>
          </div>
        </div>
      </section>

      {/* Phone: the bay photograph as a band under the two tasks. */}
      <section className="relative mt-5 h-[250px] overflow-hidden lg:hidden">
        {bay ? <Image src={bay} alt="" fill sizes="(min-width: 1024px) 1px, 100vw" className="object-cover object-[70%_center]" /> : <div className="sf-bay absolute inset-0" aria-hidden="true" />}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-center px-7">
          <p className="sf-display text-[32px] uppercase leading-[1.1]">Expert<br />auto repair<br />in {shop.city}</p>
          <p className="sf-note mt-3 max-w-[20rem] text-[16px] leading-snug">{tagline}</p>
        </div>
      </section>

      <section className="sf-wrap mt-3 grid gap-x-14 gap-y-6 lg:mt-10 lg:grid-cols-[minmax(0,636px)_minmax(0,1fr)]">
        <div>
          <h2 className="sf-display text-[26px] lg:text-[44px]">Services and prices</h2>
          <div className="mt-1 lg:mt-3"><ServiceRows services={store.services} compact /></div>
        </div>

        {hasTeam ? (
          <div>
            <h2 className="sf-display mb-2 text-[26px] lg:hidden">Our team</h2>
            <div className={team ? 'grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-x-4 lg:block' : ''}>
              {team ? (
                <div className="relative aspect-[400/150] overflow-hidden lg:aspect-[712/236]">
                  <Image src={team} alt={`The ${shop.name} team in the shop`} fill sizes="(min-width: 1024px) 712px, 55vw" className="object-cover object-[center_30%]" />
                </div>
              ) : null}
              <div className="lg:hidden"><TeamLists technicians={store.technicians} advisors={store.advisors} /></div>
              <div className={`hidden pt-2 lg:block lg:pl-4 ${team ? 'sf-rule-top mt-1' : 'lg:mt-[52px] sf-rule-top'}`}><TeamLists technicians={store.technicians} advisors={store.advisors} split /></div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}
