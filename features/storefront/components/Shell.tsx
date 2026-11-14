import Link from 'next/link'
import { Clock, FileText, MapPin, Menu, Phone, ShieldCheck } from 'lucide-react'
import type { Storefront } from '../lib/data'

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
    <header className="relative z-30 border-b sf-hair" style={{ background: 'var(--sf-bg)' }}>
      <div className="sf-wrap flex h-[52px] items-center justify-between gap-4 lg:h-[58px]">
        <Link href="/" className="flex min-w-0 items-center gap-3 no-underline" aria-label={`${store.shop.name} home`}>
          <Mark />
          <Wordmark name={store.shop.name} className="text-[22px] lg:text-[28px]" />
        </Link>

        <nav className="hidden items-center gap-10 lg:flex" aria-label="Main">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="py-3 text-[17px] no-underline hover:underline hover:underline-offset-8">{item.label}</Link>
          ))}
          <Link href="/book" className="sf-btn ml-3 !min-h-[40px] !px-5 !text-[17px]">Book a repair</Link>
        </nav>

        <details className="group lg:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden" aria-label="Menu">
            <Menu size={30} strokeWidth={2.4} aria-hidden="true" />
          </summary>
          <nav className="absolute inset-x-0 top-full border-b sf-hair px-5 pb-5 pt-1" style={{ background: 'var(--sf-bg)' }} aria-label="Main">
            <div className="sf-rows-soft">
              {NAV.map(item => (
                <Link key={item.href} href={item.href} className="flex min-h-12 items-center text-[18px] no-underline">{item.label}</Link>
              ))}
            </div>
            <Link href="/book" className="sf-btn sf-btn-wide mt-4">Book a repair</Link>
            {store.shop.phone ? <a href={store.shop.phoneHref} className="sf-num mt-3 flex min-h-12 items-center justify-center text-[18px] no-underline">{store.shop.phone}</a> : null}
          </nav>
        </details>
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

      {/* Phone: warranty and the other shop, then address and hours. */}
      <div className="lg:hidden">
        {warranty || also ? (
          <div className="sf-wrap grid grid-cols-2 border-b sf-hair py-4">
            {warranty ? (
              <div className="flex items-center gap-3 pr-3">
                <ShieldCheck size={34} className="sf-accent shrink-0" aria-hidden="true" />
                <p className="text-[15px]"><span className="sf-label block text-[16px]">Warranty</span>{warranty}</p>
              </div>
            ) : <div />}
            {also ? (
              <Link href="/about" className="flex items-center gap-3 border-l sf-hair pl-4 no-underline">
                <MapPin size={34} className="sf-accent shrink-0" aria-hidden="true" />
                <span className="sf-label text-[15px]">{also}</span>
              </Link>
            ) : null}
          </div>
        ) : null}
        <div className="sf-wrap grid grid-cols-2 py-4">
          <div className="pr-3">
            <p className="sf-label text-[17px]">{shop.name}</p>
            <p className="text-[15px]">{shop.addressLine1}</p>
            <p className="text-[15px]">{shop.cityLine}</p>
            {shop.phone ? (
              <a href={shop.phoneHref} className="mt-1 flex min-h-11 items-center gap-2 no-underline">
                <Phone size={20} className="sf-accent" fill="currentColor" aria-hidden="true" />
                <span className="sf-num text-[18px]">{shop.phone}</span>
              </a>
            ) : null}
          </div>
          <div className="border-l sf-hair pl-4">
            {shop.hours.length ? (
              <div className="flex gap-2">
                <Clock size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="sf-label text-[16px]">Hours</p>
                  {shop.hours.map(h => <p key={h.days} className="text-[14px]">{h.days}&nbsp; {h.time}</p>)}
                </div>
              </div>
            ) : null}
            {shop.barRegistration ? (
              <p className="mt-3 flex gap-2 text-[14px]"><FileText size={20} className="shrink-0" aria-hidden="true" />BAR registration {shop.barRegistration}</p>
            ) : null}
            <Link href="/dashboard" className="sf-dim mt-2 flex min-h-11 items-center text-[14px] no-underline">Staff sign-in</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

/** A plain inner page: a heading, an optional line under it, then the content. */
export function Page({ title, lead, children, narrow = false }: { title: string; lead?: React.ReactNode; children: React.ReactNode; narrow?: boolean }) {
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
    <Page title="This link no longer works" narrow>
      <p className="text-[17px]">{message || 'The link may have expired or been replaced by a newer one.'}</p>
      <p className="mt-3 text-[17px]">
        Call {store.shop.name}{store.shop.phone ? <> on <a href={store.shop.phoneHref} className="sf-num sf-accent">{store.shop.phone}</a></> : null} and we will send you a new one.
      </p>
      <p className="mt-6"><Link href="/check" className="sf-btn-line">Check my repair</Link></p>
    </Page>
  )
}
