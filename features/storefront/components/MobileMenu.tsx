'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

/** The phone menu: a full-height sheet under the header. Closes on a link, on Escape and on the close button. */
export function MobileMenu({ items, phone, phoneHref }: { items: { href: string; label: string }[]; phone: string; phoneHref: string }) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const button = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => { setOpen(false) }, [pathname])
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('keydown', onKey)
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = before }
  }, [open])

  return (
    <div className="lg:hidden">
      <button ref={button} type="button" className="sf-icon-btn -mr-2" aria-label={open ? 'Close menu' : 'Menu'} aria-expanded={open} aria-controls="sf-menu" onClick={() => setOpen(o => !o)}>
        {open ? <X size={28} strokeWidth={2.2} aria-hidden="true" /> : <Menu size={28} strokeWidth={2.2} aria-hidden="true" />}
      </button>
      {open ? (
        <nav id="sf-menu" aria-label="Main" className="fixed inset-x-0 bottom-0 top-[53px] z-40 flex flex-col overflow-y-auto px-5 pt-1" style={{ background: 'var(--sf-bg)', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
          <div className="sf-rows-soft">
            {[{ href: '/', label: 'Home' }, ...items].map(item => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={pathname === item.href ? 'page' : undefined} className="flex min-h-[52px] items-center text-[18px] no-underline aria-[current=page]:text-[var(--sf-orange)]">{item.label}</Link>
            ))}
          </div>
          <Link href="/book" onClick={() => setOpen(false)} className="sf-btn sf-btn-wide mt-5">Book a repair</Link>
          {phone ? <a href={phoneHref} className="sf-btn-line sf-num mt-3 w-full !text-[18px]">{phone}</a> : null}
        </nav>
      ) : null}
    </div>
  )
}
