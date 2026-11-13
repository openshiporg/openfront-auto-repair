import { DomainError, Codes } from './errors'

/*
 * Card payments through Stripe (the key decides test or live). No webhook endpoint:
 * the account is out of webhook slots, so every payment and refund is settled by asking Stripe
 * (the "unknown" resolver and the polling the pay page does). Network calls never run inside a
 * database transaction. A call that fails without a clear answer leaves the payment "unknown"
 * and is retried with the same idempotency key, which Stripe answers with the original result.
 */

export type CheckoutSessionInput = {
  amountMinor: bigint
  currency: string
  description: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string | null
  metadata: Record<string, string>
  idempotencyKey: string
}
export type CheckoutSession = { id: string; url: string | null; paymentStatus: 'paid' | 'unpaid' | 'no_payment_required'; status: 'open' | 'complete' | 'expired'; paymentIntentId: string | null; cardBrand: string; cardLast4: string }
export type RefundResult = { id: string; status: 'succeeded' | 'pending' | 'failed' | 'canceled' | 'requires_action'; failureReason: string }

export interface StripeGateway {
  readonly name: string
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>
  retrieveCheckoutSession(id: string): Promise<CheckoutSession>
  createRefund(input: { paymentIntentId: string; amountMinor: bigint; idempotencyKey: string; reason: string; metadata: Record<string, string> }): Promise<RefundResult>
  retrieveRefund(id: string): Promise<RefundResult>
}

/** Stripe answered and said no (a 4xx): the payment definitely did not happen. Anything else is unknown. */
export class StripeRejected extends Error {
  constructor(message: string, readonly code: string | null, readonly httpStatus: number) { super(message) }
}

const API = 'https://api.stripe.com/v1'

function form(data: Record<string, unknown>, prefix = '', out: URLSearchParams = new URLSearchParams()) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const name = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(value)) value.forEach((v, i) => (typeof v === 'object' ? form(v as Record<string, unknown>, `${name}[${i}]`, out) : out.append(`${name}[${i}]`, String(v))))
    else if (typeof value === 'object') form(value as Record<string, unknown>, name, out)
    else out.append(name, String(value))
  }
  return out
}

function realGateway(secret: string): StripeGateway {
  async function call(method: 'GET' | 'POST', path: string, data: Record<string, unknown> = {}, idempotencyKey?: string): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2024-06-20' }
    let url = `${API}${path}`
    let body: string | undefined
    if (method === 'POST') { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = form(data).toString() }
    else if (Object.keys(data).length) url += `?${form(data).toString()}`
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    const response = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20_000) })
    const json = (await response.json().catch(() => null)) as any
    if (!response.ok) {
      const message = String(json?.error?.message ?? `Stripe returned ${response.status}`)
      // 4xx other than a rate limit or an idempotency conflict is a firm no.
      if (response.status >= 400 && response.status < 500 && response.status !== 429 && response.status !== 409) throw new StripeRejected(message, json?.error?.code ?? null, response.status)
      throw new Error(`Stripe unavailable: ${response.status}`)
    }
    return json
  }
  const toSession = (s: any): CheckoutSession => {
    const charge = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent.latest_charge : null
    const card = charge && typeof charge === 'object' ? charge.payment_method_details?.card : null
    return {
      id: s.id, url: s.url ?? null, paymentStatus: s.payment_status, status: s.status,
      paymentIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
      cardBrand: String(card?.brand ?? ''), cardLast4: String(card?.last4 ?? ''),
    }
  }
  const toRefund = (r: any): RefundResult => ({ id: r.id, status: r.status, failureReason: String(r.failure_reason ?? '') })
  return {
    name: 'stripe',
    async createCheckoutSession(input) {
      const s = await call('POST', '/checkout/sessions', {
        mode: 'payment', payment_method_types: ['card'], customer_email: input.customerEmail || undefined,
        success_url: input.successUrl, cancel_url: input.cancelUrl, expires_at: Math.floor(Date.now() / 1000) + 3600,
        line_items: [{ quantity: 1, price_data: { currency: input.currency.toLowerCase(), unit_amount: input.amountMinor.toString(), product_data: { name: input.description } } }],
        metadata: input.metadata, payment_intent_data: { metadata: input.metadata, description: input.description },
      }, input.idempotencyKey)
      return toSession(s)
    },
    async retrieveCheckoutSession(id) {
      return toSession(await call('GET', `/checkout/sessions/${encodeURIComponent(id)}`, { expand: ['payment_intent.latest_charge'] }))
    },
    async createRefund(input) {
      const r = await call('POST', '/refunds', { payment_intent: input.paymentIntentId, amount: input.amountMinor.toString(), reason: 'requested_by_customer', metadata: { ...input.metadata, note: input.reason.slice(0, 200) } }, input.idempotencyKey)
      return toRefund(r)
    },
    async retrieveRefund(id) { return toRefund(await call('GET', `/refunds/${encodeURIComponent(id)}`)) },
  }
}

let override: StripeGateway | null = null
/** Test seam: tests install a double; null restores the real gateway. */
export function setStripeGateway(gateway: StripeGateway | null) { override = gateway }

export function stripeGateway(): StripeGateway {
  if (override) return override
  const key = process.env.STRIPE_SECRET_KEY ?? ''
  if (!key) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'Card payments are not set up on this server yet.')
  // The mode follows the key (test keys on demo deployments, live keys in production): one code path.
  return realGateway(key)
}
export const cardPaymentsConfigured = () => !!override || /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY ?? '')
