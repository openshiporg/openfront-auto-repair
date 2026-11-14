import { headers } from 'next/headers'

/** The caller's address and browser, as the customer link APIs record them. */
export async function caller() {
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || ''
  return { ip, userAgent: h.get('user-agent') ?? '' }
}

/** A request the public handlers can read the caller from, for pages that call them on the server. */
export async function callerRequest(path: string) {
  const { ip, userAgent } = await caller()
  return new Request(`http://internal${path}`, { headers: { 'x-forwarded-for': ip || 'storefront-page', 'user-agent': userAgent } })
}

// A small per-address limit so a public form can't be hammered. Per process; one replica runs.
const hits = new Map<string, { n: number; reset: number }>()
export function limited(bucket: string, ip: string, perMinute: number) {
  const key = `${bucket}:${ip}`
  const now = Date.now()
  const row = hits.get(key)
  if (!row || row.reset < now) {
    hits.set(key, { n: 1, reset: now + 60_000 })
    if (hits.size > 5000) hits.clear()
    return false
  }
  row.n += 1
  return row.n > perMinute
}
