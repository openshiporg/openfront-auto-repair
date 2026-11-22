import { existsSync } from 'node:fs'
import path from 'node:path'
import { cache } from 'react'
import { keystoneContext } from '@/features/keystone/context'
import type { Db } from '@/features/keystone/lib/db'
import { clock, duration, money, phone, zoneLabel } from './format'

/*
 * What the customer site shows about the business. Everything is read from the shop's own records:
 * shops and their hours, registrations, published services, staff and warranty terms. Nothing is typed
 * into the pages.
 */

export const storefrontDb = (): Db => keystoneContext.sudo().prisma as Db

export type StoreShop = {
  id: string
  code: string
  name: string
  addressLine1: string
  cityLine: string
  city: string
  phone: string
  phoneHref: string
  timeZone: string
  zone: string
  hours: { days: string; time: string }[]
  barRegistration: string
  tagline: string
  about: string
}

export type StoreService = {
  slug: string
  name: string
  description: string
  price: string
  priceMinor: string | null
  time: string
  centiHours: number
  bookable: boolean
  shopId: string | null
  shopName: string
  /** Shown in the price column: a price with its time, or how to get one. */
  priceLine: string
}

export type StorePerson = { name: string; title: string; role: 'technician' | 'advisor' }

export type Storefront = {
  shop: StoreShop
  otherShops: StoreShop[]
  shops: StoreShop[]
  services: StoreService[]
  technicians: StorePerson[]
  advisors: StorePerson[]
  warranty: string
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** [{dow, open, close}] → "Mon–Fri 7:30 AM–6:00 PM PT", "Sat 8:00 AM–4:00 PM PT". Consecutive days with the same hours are joined. */
function hoursLines(weekly: unknown, zone: string) {
  const rows = (Array.isArray(weekly) ? weekly : [])
    .filter((r): r is { dow: number; open: string; close: string } => !!r && typeof r === 'object' && Number.isInteger((r as { dow?: unknown }).dow) && typeof (r as { open?: unknown }).open === 'string' && typeof (r as { close?: unknown }).close === 'string')
    // Week starts on Monday, the way a shop reads its hours.
    .sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7))
  const groups: { from: number; to: number; open: string; close: string }[] = []
  for (const r of rows) {
    const last = groups[groups.length - 1]
    if (last && last.open === r.open && last.close === r.close && (last.to + 1) % 7 === r.dow) last.to = r.dow
    else groups.push({ from: r.dow, to: r.dow, open: r.open, close: r.close })
  }
  return groups.map(g => ({
    days: g.from === g.to ? DAY_NAMES[g.from] : `${DAY_NAMES[g.from]}–${DAY_NAMES[g.to]}`,
    time: `${clock(g.open)}–${clock(g.close)} ${zone}`.trim(),
  }))
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const slugOf = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

function priceLine(priceMinor: bigint | null, time: string, bookable: boolean) {
  if (priceMinor === null) return bookable ? 'Request an estimate' : 'Call for a price'
  if (priceMinor === 0n) return time ? `Free (${time})` : 'Free'
  // The published figure is where the job starts; the estimate for the customer's own car is the price.
  return time ? `From ${money(priceMinor)} (${time})` : `From ${money(priceMinor)}`
}

export const getStorefront = cache(async (): Promise<Storefront | null> => {
  const db = storefrontDb()
  const rows = await db.shop.findMany({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, include: { calendar: true } })
  if (!rows.length) return null
  // When the owner has marked shops as published, only those are on the site.
  const published = rows.filter(r => r.isPublished)
  const visible = published.length ? published : rows

  const shops: StoreShop[] = visible.map(r => {
    const zone = zoneLabel(r.timeZone)
    const profile = (r.publicProfile && typeof r.publicProfile === 'object' ? r.publicProfile : {}) as Record<string, unknown>
    const registrations = (r.registrations && typeof r.registrations === 'object' ? r.registrations : {}) as Record<string, unknown>
    return {
      id: r.id, code: r.code, name: r.name, addressLine1: [r.addressLine1, r.addressLine2].filter(Boolean).join(', '),
      cityLine: [r.city, [r.region, r.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', '), city: r.city,
      phone: phone(r.phone), phoneHref: r.phone ? `tel:${r.phone.replace(/[^\d+]/g, '')}` : '',
      timeZone: r.timeZone, zone, hours: hoursLines(r.calendar?.weeklyHours, zone),
      barRegistration: text(registrations.barArd), tagline: text(profile.tagline), about: text(profile.about),
    }
  })
  const shop = shops[0]
  const shopIds = shops.map(s => s.id)
  const shopName = (id: string | null) => shops.find(s => s.id === id)?.name ?? ''

  const listed = await db.publishedService.findMany({ where: { isPublished: true, shopId: { in: shopIds } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
  let services: StoreService[] = listed.map(s => {
    const time = duration(s.estimatedCentiHours)
    return {
      slug: s.slug || slugOf(s.name), name: s.name, description: s.description, price: s.fromPriceMinor === null ? '' : money(s.fromPriceMinor), priceMinor: s.fromPriceMinor?.toString() ?? null,
      time, centiHours: s.estimatedCentiHours && s.estimatedCentiHours > 0 ? s.estimatedCentiHours : 100, bookable: s.bookable, shopId: s.shopId, shopName: shopName(s.shopId),
      priceLine: priceLine(s.fromPriceMinor, time, s.bookable),
    }
  })
  if (!services.length) {
    // No published price list yet: the shop's own job catalog is what it sells, priced per vehicle on an estimate.
    const jobs = await db.cannedJob.findMany({
      where: { active: true, currentVersionId: { not: null }, OR: [{ shopId: null }, { shopId: { in: shopIds } }] },
      orderBy: [{ category: 'asc' }, { name: 'asc' }], include: { currentVersion: { select: { customerDescription: true } } },
    })
    services = jobs.map(j => ({
      slug: slugOf(j.code || j.name), name: j.name, description: j.currentVersion?.customerDescription ?? '', price: '', priceMinor: null, time: '', centiHours: 100, bookable: true,
      shopId: j.shopId, shopName: shopName(j.shopId), priceLine: 'Request an estimate',
    }))
  }
  // One row per slug: the first shop's entry wins when two shops publish the same service.
  services = services.filter((s, i) => s.slug && services.findIndex(o => o.slug === s.slug) === i)

  const members = await db.shopMembership.findMany({
    where: { shopId: { in: shopIds }, status: 'active', user: { kind: 'staff' } },
    orderBy: { createdAt: 'asc' }, select: { user: { select: { id: true, name: true, role: { select: { name: true } } } }, role: { select: { name: true } } },
  })
  const seen = new Set<string>()
  const technicians: StorePerson[] = []
  const advisors: StorePerson[] = []
  for (const m of members) {
    if (!m.user || seen.has(m.user.id)) continue
    // A membership can carry its own role for that shop; otherwise the person's role applies.
    const role = m.role?.name ?? m.user.role?.name ?? ''
    // Only the role is shown. Staff titles carry internal notes (certificate dates) that are not for customers.
    const person = { name: m.user.name, title: /lead/i.test(role) ? 'Lead technician' : '' }
    if (/technician/i.test(role)) { seen.add(m.user.id); if (/lead/i.test(role)) technicians.unshift({ ...person, role: 'technician' }); else technicians.push({ ...person, role: 'technician' }) }
    else if (/advisor/i.test(role)) { seen.add(m.user.id); advisors.push({ ...person, role: 'advisor' }) }
  }

  let warranty = ''
  const primary = visible[0]
  if (primary.warrantyTermSetId) {
    const terms = await db.warrantyTerm.findMany({ where: { termSetId: primary.warrantyTermSetId }, orderBy: [{ months: 'desc' }, { miles: 'desc' }], take: 1 })
    const best = terms[0]
    if (best && best.months > 0) warranty = `${best.months} months / ${best.miles.toLocaleString('en-US')} miles`
  }

  return { shop, otherShops: shops.slice(1), shops, services, technicians, advisors, warranty }
})

/** The service a booking is for, and the shop that does it. */
export function pickService(store: Storefront, slug: string | null | undefined) {
  return store.services.find(s => s.slug === slug) ?? null
}

/**
 * The shop's own photographs live in public/storefront (bay.jpg behind the booking panels, team.jpg by
 * the staff names). A page shows a photograph only when the file is there, and lays out cleanly without it.
 */
export function shopPhoto(name: 'bay.jpg' | 'team.jpg') {
  return existsSync(path.join(process.cwd(), 'public', 'storefront', name)) ? `/storefront/${name}` : null
}
