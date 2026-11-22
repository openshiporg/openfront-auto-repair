import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CheckRepair } from '../components/CheckRepair'
import { ServiceRows, TeamLists } from '../components/Lists'
import { Page } from '../components/Shell'
import { getStorefront, shopPhoto, type Storefront, type StoreShop } from '../lib/data'

async function store(): Promise<Storefront> {
  const found = await getStorefront()
  if (!found) redirect('/dashboard')
  return found
}

/** Services: what each one is, what it costs, and a way to book it. */
export async function ServicesPage() {
  const s = await store()
  return (
    <Page title="Services" lead={`What we do at ${s.shop.name}${s.warranty ? `, covered by our ${s.warranty} warranty` : ''}.`}>
      {s.services.length ? (
        <ul className="sf-rows max-w-[980px]">
          {s.services.map(service => (
            <li key={service.slug} className="grid gap-x-8 gap-y-1 pb-4 pt-2 lg:py-4 lg:grid-cols-[minmax(0,1fr)_240px_auto] lg:items-baseline">
              <div className="min-w-0">
                <h2 className="sf-label text-[20px]"><Link href={`/services/${service.slug}`} className="inline-flex min-h-11 items-center no-underline hover:underline">{service.name}</Link></h2>
                {service.description ? <p className="mt-1 max-w-[60ch] text-[16px]">{service.description}</p> : null}
                {service.shopName && s.shops.length > 1 && service.shopId ? <p className="sf-dim mt-1 text-[15px]">At {service.shopName}</p> : null}
              </div>
              <p className="text-[17px]">{service.priceLine}</p>
              {service.bookable ? <Link href={`/book?service=${service.slug}`} className="sf-btn-line mt-2 justify-self-start lg:mt-0">Book</Link> : <span />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[17px]">Call {s.shop.name}{s.shop.phone ? ` on ${s.shop.phone}` : ''} and tell us what the vehicle needs.</p>
      )}
      <p className="mt-8"><Link href="/book" className="sf-btn">Book a repair</Link></p>
    </Page>
  )
}

export async function ServicePage({ slug }: { slug: string }) {
  const s = await store()
  const service = s.services.find(x => x.slug === slug)
  if (!service) notFound()
  const shop = s.shops.find(x => x.id === service.shopId) ?? s.shop
  return (
    <Page title={service.name} narrow>
      <p className="sf-num text-[26px]">{service.price ? (service.priceMinor === '0' ? 'Free' : `From ${service.price}`) : service.bookable ? 'Request an estimate' : 'Call for a price'}</p>
      {service.time ? <p className="text-[17px]">Takes about {service.time}.</p> : null}
      {service.description ? <p className="mt-4 max-w-[62ch] text-[18px]">{service.description}</p> : null}
      <dl className="sf-rows-soft mt-6 text-[17px]">
        <div className="flex justify-between gap-4 py-2.5"><dt className="sf-label">Where</dt><dd className="text-right">{shop.name}, {shop.city}</dd></div>
        {s.warranty ? <div className="flex justify-between gap-4 py-2.5"><dt className="sf-label">Warranty</dt><dd className="text-right">{s.warranty}</dd></div> : null}
        <div className="flex justify-between gap-4 py-2.5"><dt className="sf-label">Before any work</dt><dd className="text-right">A written estimate you approve job by job</dd></div>
      </dl>
      <div className="mt-7 flex flex-wrap gap-3">
        {service.bookable ? <Link href={`/book?service=${service.slug}`} className="sf-btn">Book this service</Link> : null}
        <Link href="/prices" className="sf-btn-line">All services and prices</Link>
      </div>
    </Page>
  )
}

export async function PricesPage() {
  const s = await store()
  return (
    <Page title="Services and prices" lead="Prices are before sales tax. Where a job depends on the vehicle, you get a written estimate first and approve each job separately.">
      <div className="max-w-[860px]"><ServiceRows services={s.services} /></div>
      <p className="mt-8"><Link href="/book" className="sf-btn">Book a repair</Link></p>
    </Page>
  )
}

function ShopBlock({ shop }: { shop: StoreShop }) {
  return (
    <div className="py-4">
      <h3 className="sf-label text-[20px]">{shop.name}</h3>
      <p className="text-[17px]">{[shop.addressLine1, shop.cityLine].filter(Boolean).join(', ')}</p>
      {shop.phone ? <p><a href={shop.phoneHref} className="sf-num inline-flex min-h-11 items-center text-[18px] no-underline hover:underline">{shop.phone}</a></p> : null}
      {shop.hours.map(h => <p key={h.days} className="text-[16px]">{h.days}&nbsp; {h.time}</p>)}
      {shop.barRegistration ? <p className="sf-dim text-[15px]">BAR registration {shop.barRegistration}</p> : null}
    </div>
  )
}

export async function AboutPage() {
  const s = await store()
  const team = shopPhoto('team.jpg')
  return (
    <Page title={`About ${s.shop.name}`} lead={s.shop.tagline || undefined}>
      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          {team ? (
            <div className="relative mb-1 aspect-[712/300] overflow-hidden">
              <Image src={team} alt={`The ${s.shop.name} team in the shop`} fill sizes="(min-width: 1024px) 660px, 100vw" className="object-cover object-[center_30%]" />
            </div>
          ) : <h2 className="sf-display mb-2 text-[26px]">Our team</h2>}
          {s.technicians.length + s.advisors.length ? (
            <div className="sf-rule-top pt-3"><TeamLists technicians={s.technicians} advisors={s.advisors} split /></div>
          ) : null}
        </div>
        <div>
          {s.shop.about ? <div className="sf-prose mb-6 whitespace-pre-line text-[18px]">{s.shop.about}</div> : null}
          <h2 className="sf-display text-[26px]">How we work</h2>
          <ul className="sf-rows-soft mt-2 text-[17px]">
            <li className="py-2.5">A digital inspection with photos: what needs attention now, what can wait, and what is good.</li>
            <li className="py-2.5">A written estimate before any work. You approve or decline each job on its own.</li>
            <li className="py-2.5">We never charge more than you approved without asking you first.</li>
            {s.warranty ? <li className="py-2.5">Repairs are covered for {s.warranty}.</li> : null}
          </ul>
          <h2 className="sf-display mt-8 text-[26px]">{s.shops.length > 1 ? 'Our shops' : 'Find us'}</h2>
          <div className="sf-rows-soft">{s.shops.map(shop => <ShopBlock key={shop.id} shop={shop} />)}</div>
          <p className="mt-6"><Link href="/book" className="sf-btn">Book a repair</Link></p>
        </div>
      </div>
    </Page>
  )
}

/** Fleet accounts: how a business account works here. The account pages themselves open from the link sent to each contact. */
export async function FleetInfoPage() {
  const s = await store()
  return (
    <Page title="Fleet accounts" lead="One account for your company vehicles: approvals by the right person, purchase orders, monthly statements and a card payment page.">
      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-2">
        <ul className="sf-rows text-[17px]">
          <li className="grid gap-x-6 py-3 sm:grid-cols-[200px_1fr]"><span className="sf-label">Your units</span><span>Every vehicle by unit number, with its driver and cost center.</span></li>
          <li className="grid gap-x-6 py-3 sm:grid-cols-[200px_1fr]"><span className="sf-label">Approvals</span><span>Each approver has a spending limit. They approve estimates job by job from their own link.</span></li>
          <li className="grid gap-x-6 py-3 sm:grid-cols-[200px_1fr]"><span className="sf-label">Purchase orders</span><span>If your company needs a PO number on every job, we do not start work without one.</span></li>
          <li className="grid gap-x-6 py-3 sm:grid-cols-[200px_1fr]"><span className="sf-label">Terms and statements</span><span>Invoices on your payment terms, a statement for each period as a spreadsheet file, and the open balance by age.</span></li>
          <li className="grid gap-x-6 py-3 sm:grid-cols-[200px_1fr]"><span className="sf-label">Paying</span><span>Pay any open invoice by card from the account page.</span></li>
        </ul>
        <div>
          <div className="sf-panel px-5 py-5 lg:px-7">
            <h2 className="sf-display text-[24px]">Already have an account?</h2>
            <p className="mt-2 text-[17px]">Open the account link we sent you. It shows your units, what is waiting for approval, invoices and statements. Lost it? Call us and we send a new one.</p>
            <h2 className="sf-display mt-6 text-[24px]">Open a fleet account</h2>
            <p className="mt-2 text-[17px]">Call {s.shop.name}{s.shop.phone ? <> on <a href={s.shop.phoneHref} className="sf-num sf-accent no-underline hover:underline">{s.shop.phone}</a></> : null} and ask for a service advisor. We set up your terms, approvers and units, and send each contact their link.</p>
          </div>
        </div>
      </div>
    </Page>
  )
}

export async function CheckPage() {
  const s = await store()
  return (
    <Page title="Check my repair" lead="Repair status, inspection results, and estimate." narrow>
      <div className="sf-panel px-5 py-5 lg:px-7"><CheckRepair idPrefix="check-page" big /></div>
      <p className="mt-5 text-[16px]">
        Have a link from us? It opens your inspection, your estimate or your invoice directly.
        {s.shop.phone ? <> Questions: <a href={s.shop.phoneHref} className="sf-num sf-accent no-underline hover:underline">{s.shop.phone}</a>.</> : null}
      </p>
    </Page>
  )
}
