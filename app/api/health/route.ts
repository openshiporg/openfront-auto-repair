import { NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'

export const dynamic = 'force-dynamic'

/**
 * Readiness is this process and PostgreSQL. Background jobs report through heartbeat rows they write when they run, so the
 * site never stops serving because a scheduler is late, but a late or missing one is visible here.
 *  - tireSweep: the hourly Railway cron (a heartbeat is valid for 3 hours).
 *  - outbox: the age of the oldest message still waiting for delivery.
 */
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  const db = keystoneContext.prisma as any
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers })
  }
  let tireSweep: 'fresh' | 'stale' | 'never_run' | 'unknown' = 'unknown'
  let outboxOldestPendingSeconds: number | null = null
  try {
    const beat = await db.lease.findUnique({ where: { key: 'heartbeat:tire-sweep' } })
    tireSweep = !beat ? 'never_run' : beat.expiresAt.getTime() > Date.now() ? 'fresh' : 'stale'
    const oldest = await db.outboxEvent.findFirst({ where: { status: { in: ['pending', 'failed'] } }, orderBy: { nextAttemptAt: 'asc' }, select: { nextAttemptAt: true } })
    outboxOldestPendingSeconds = oldest ? Math.max(0, Math.round((Date.now() - oldest.nextAttemptAt.getTime()) / 1000)) : 0
  } catch { /* the site is up; job status stays unknown */ }
  return NextResponse.json({ status: 'ok', database: 'ok', jobs: { tireSweep }, outboxOldestPendingSeconds }, { status: 200, headers })
}
