import { timingSafeEqual } from 'node:crypto'
import { keystoneContext } from '@/features/keystone/context'
import { systemActor } from '@/features/keystone/lib/actor'
import { runInTransaction } from '@/features/keystone/lib/unitOfWork'
import { sweepTireRegistrations } from '@/features/keystone/lib/tires'

export const dynamic = 'force-dynamic'

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

/** Called once an hour by the Railway cron service. Open tire registrations past their due day, in each shop's own day, become overdue. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET ?? ''
  const given = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!secret || !same(given, secret)) return Response.json({ error: 'Not allowed.' }, { status: 401 })
  const overdue = await runInTransaction(keystoneContext.sudo().prisma as never, uow => sweepTireRegistrations(uow, systemActor('tire-sweep')), { actorKind: 'system' })
  // The scheduler's heartbeat: /api/health reports whether the hourly sweep is still running.
  const prisma = keystoneContext.sudo().prisma as any
  const expiresAt = new Date(Date.now() + 3 * 3_600_000)
  await prisma.lease.upsert({ where: { key: 'heartbeat:tire-sweep' }, create: { key: 'heartbeat:tire-sweep', owner: 'tire-sweep-cron', fencingToken: 1, expiresAt }, update: { owner: 'tire-sweep-cron', expiresAt } })
  return Response.json({ ok: true, overdue })
}
