import { keystoneContext } from '../context'
import { resolveOpen } from './cardFlow'
import { cardPaymentsConfigured } from './stripeGateway'
import type { Db } from './db'

const EVERY_MS = 60_000
// The minute timer only runs for this long after the last card page opened, so an idle shop can sleep.
// A payment left open longer is still resolved by the run at the next server start, the pay page and the dashboard.
const ACTIVE_MS = 30 * 60_000

type SweepState = { __cardSweep?: ReturnType<typeof setInterval>; __cardSweepArm?: () => void }

/**
 * The shop's Stripe account has no webhook slot for this site, so a customer who pays and closes the
 * tab before the return page loads would leave the payment open. Once a minute this asks Stripe about
 * every open card payment and refund, through the same resolvePayment the return page uses, which
 * records each answer exactly once. One timer per process; a run never overlaps the last one.
 */
export function startCardSweep() {
  const state = globalThis as SweepState
  if (state.__cardSweepArm || !cardPaymentsConfigured()) return
  let running = false
  let armedAt = 0
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
      if (state.__cardSweep && Date.now() - armedAt > ACTIVE_MS) {
        clearInterval(state.__cardSweep)
        state.__cardSweep = undefined
      }
    }
  }
  state.__cardSweepArm = () => {
    armedAt = Date.now()
    if (state.__cardSweep) return
    state.__cardSweep = setInterval(run, EVERY_MS)
    state.__cardSweep.unref?.()
  }
  setTimeout(run, 15_000).unref?.()
  console.log('Card sweep started (at start-up, then every 60 s for 30 min after a card page opens)')
}
