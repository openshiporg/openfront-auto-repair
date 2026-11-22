/** Server start-up: the one-minute card payment sweep runs in the Node server, once per process. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { startCardSweep } = await import('./features/keystone/lib/cardSweep')
  startCardSweep()
}
