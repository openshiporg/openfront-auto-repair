import { keystoneContext } from '../context'
import { resolveOpen } from './cardFlow'
import { cardPaymentsConfigured } from './stripeGateway'
import type { Db } from './db'

const EVERY_MS = 60_000

/**
 * The shop's Stripe account has no webhook slot for this site, so a customer who pays and closes the
 * tab before the return page loads would leave the payment open. Once a minute this asks Stripe about
 * every open card payment and refund, through the same resolvePayment the return page uses, which
 * records each answer exactly once. One timer per process; a run never overlaps the last one.
 */
export function startCardSweep() {
  const state = globalThis as { __cardSweep?: ReturnType<typeof setInterval> }
  if (state.__cardSweep || !cardPaymentsConfigured()) return
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      const r = await resolveOpen(keystoneContext.sudo().prisma as unknown as Db)
      if (r.changed) console.log(`Card sweep: ${r.changed} payment(s) or refund(s) settled`)
    } catch (error) {
      console.error('Card sweep failed', error instanceof Error ? error.message : error)
    } finally {
      running = false
    }
  }
  state.__cardSweep = setInterval(run, EVERY_MS)
  state.__cardSweep.unref?.()
  setTimeout(run, 15_000).unref?.()
  console.log('Card sweep started (every 60 s)')
}
