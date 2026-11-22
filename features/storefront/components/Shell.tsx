import Link from 'next/link'
import { Phone } from 'lucide-react'
import type { Storefront } from '../lib/data'
import { MobileMenu } from './MobileMenu'

const NAV = [
  { href: '/services', label: 'Services' },
  { href: '/prices', label: 'Prices' },
  { href: '/fleet', label: 'Fleet accounts' },
  { href: '/about', label: 'About' },
  { href: '/check', label: 'Check my repair' },
]

/** The faceted mark: a six-sided outline cut into facets, in the brand orange. */
export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="var(--sf-orange)" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 2.5 27.7 9.2v13.6L16 29.5 4.3 22.8V9.2L16 2.5Z" />
      <path d="M16 2.5 10.2 14.3 4.3 9.2M16 2.5l5.8 11.8 5.9-5.1M10.2 14.3h11.6L16 29.5 10.2 14.3ZM10.2 14.3 4.3 22.8M21.8 14.3l5.9 8.5" />
    </svg>
  )
}

/** The business name in lowercase: the first word in medium weight, the rest light. */
export function Wordmark({ name, className = '' }: { name: string; className?: string }) {
  const [first, ...rest] = name.toLowerCase().split(/\s+/).filter(Boolean)
  return (
    <span className={`whitespace-nowrap ${className}`} style={{ fontFamily: 'var(--font-sf-display)', letterSpacing: '0.01em' }}>
      <span style={{ fontWeight: 600 }}>{first}</span>
      {rest.length ? <span style={{ fontWeight: 300 }}> {rest.join(' ')}</span> : null}
    </span>
  )
}

export function Header({ store }: { store: Storefront }) {
  return (
    <header className="sticky top-0 z-30 border-b sf-hair lg:relative" style={{ background: 'var(--sf-bg)' }}>
      <div className="sf-wrap flex h-[52px] items-center justify-between gap-4 lg:h-[58px]">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3 no-underline" aria-label={`${store.shop.name} home`}>
          <Mark />
          <Wordmark name={store.shop.name} className="text-[22px] lg:text-[28px]" />
        </Link>

        <nav className="hidden items-center gap-10 lg:flex" aria-label="Main">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="py-3 text-[17px] no-underline hover:underline hover:underline-offset-8">{item.label}</Link>
          ))}
          <Link href="/book" className="sf-btn ml-3 !min-h-[40px] !px-5 !text-[17px]">Book a repair</Link>
        </nav>

        <MobileMenu items={NAV} phone={store.shop.phone} phoneHref={store.shop.phoneHref} />
      </div>
    </header>
  )
}

export function Footer({ store }: { store: Storefront }) {
  const { shop, otherShops, warranty } = store
  const also = otherShops.map(s => `${s.name} in ${s.city}`).join(', ')
  return (
    <footer className="mt-10 border-t sf-hair lg:mt-12" style={{ background: 'var(--sf-bg)' }}>
      {/* Desktop: one ruled row. */}
      <div className="sf-wrap hidden items-stretch gap-y-3 py-5 lg:flex lg:flex-wrap xl:flex-nowrap">
        <div className="pr-6">
          <p className="sf-label whitespace-nowrap text-[20px]">{shop.name}</p>
          <p className="whitespace-nowrap text-[15px]">{[shop.addressLine1, shop.cityLine].filter(Boolean).join(', ')}</p>
        </div>
        {also ? (
          <div className="flex min-w-0 items-center border-l border-[var(--sf-rule)] px-5 text-[15px]">
            <Link href="/about" className="no-underline hover:underline">Also at: {also}</Link>
          </div>
        ) : null}
        {shop.phone ? (
          <div className="flex items-center gap-2 border-l border-[var(--sf-rule)] px-5">
            <span className="sf-label text-[15px]">Phone</span>
            <a href={shop.phoneHref} className="sf-num whitespace-nowrap text-[18px] no-underline hover:underline">{shop.phone}</a>
          </div>
        ) : null}
        {shop.hours.length ? (
          <div className="border-l border-[var(--sf-rule)] px-5">
            <p className="sf-label text-[16px]">Hours</p>
            {shop.hours.map(h => <p key={h.days} className="whitespace-nowrap text-[15px]">{h.days}&nbsp; {h.time}</p>)}
          </div>
        ) : null}
        <div className="ml-auto whitespace-nowrap border-l border-[var(--sf-rule)] pl-6 text-[15px]">
          {warranty ? <p><span className="sf-label">Warranty</span>&nbsp; {warranty}</p> : null}
          {shop.barRegistration ? <p><span className="sf-label">BAR registration</span>&nbsp; {shop.barRegistration}</p> : null}
          <p><Link href="/dashboard" className="sf-dim text-[14px] no-underline hover:underline">Staff sign-in</Link></p>
        </div>
      </div>

      {/* Phone: one column. Name, address and phone, then ruled rows that never break a time range. */}
      <div className="sf-wrap py-6 lg:hidden">
        <p className="sf-label text-[19px]">{shop.name}</p>
        <p className="text-[16px]">{[shop.addressLine1, shop.cityLine].filter(Boolean).join(', ')}</p>
        {shop.phone ? (
          <a href={shop.phoneHref} className="mt-1 inline-flex min-h-11 items-center gap-2 no-underline">
            <Phone size={18} className="sf-accent" fill="currentColor" aria-hidden="true" />
            <span className="sf-num text-[18px]">{shop.phone}</span>
          </a>
        ) : null}
        <dl className="sf-rows-soft sf-rule-soft-top mt-3 text-[15px]">
          {shop.hours.map((h, i) => (
            <div key={h.days} className="flex justify-between gap-4 py-2"><dt>{i === 0 ? <span className="sr-only">Hours: </span> : null}{h.days}</dt><dd className="whitespace-nowrap text-right">{h.time}</dd></div>
          ))}
          {warranty ? <div className="flex justify-between gap-4 py-2"><dt>Warranty</dt><dd className="text-right">{warranty}</dd></div> : null}
          {shop.barRegistration ? <div className="flex justify-between gap-4 py-2"><dt>BAR registration</dt><dd className="sf-num text-right">{shop.barRegistration}</dd></div> : null}
        </dl>
        {also ? <Link href="/about" className="flex min-h-11 items-center text-[15px] no-underline">Also at: {also}</Link> : null}
        <Link href="/dashboard" className="sf-dim flex min-h-11 items-center text-[14px] no-underline">Staff sign-in</Link>
      </div>
    </footer>
  )
}

/** A plain inner page: a heading, an optional line under it, then the content. */
export function Page({ title, lead, children, narrow = false }: { title: React.ReactNode; lead?: React.ReactNode; children: React.ReactNode; narrow?: boolean }) {
  return (
    <main className="sf-wrap py-8 lg:py-12">
      <div className={narrow ? 'mx-auto max-w-[760px]' : ''}>
        <h1 className="sf-display text-[30px] lg:text-[44px]">{title}</h1>
        {lead ? <p className="mt-2 max-w-[62ch] text-[17px] lg:text-[19px]">{lead}</p> : null}
        <div className="mt-6 lg:mt-8">{children}</div>
      </div>
    </main>
  )
}

/** A link that no longer works, said plainly, with the way forward. */
export function LinkProblem({ store, message }: { store: Storefront; message?: string }) {
  return (
    <Page title="This link does not work" narrow>
      <p className="text-[17px]">{message && message !== 'This link is not valid.' ? message : 'It may be mistyped, expired, or replaced by a newer one.'}</p>
      <p className="mt-3 text-[17px]">
        Call {store.shop.name}{store.shop.phone ? <> on <a href={store.shop.phoneHref} className="sf-num sf-accent">{store.shop.phone}</a></> : null} and we will send you a new one.
      </p>
      <p className="mt-6"><Link href="/check" className="sf-btn-line">Check my repair</Link></p>
    </Page>
  )
}
