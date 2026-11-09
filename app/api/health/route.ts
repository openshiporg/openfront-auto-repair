import { NextResponse } from 'next/server'
import { keystoneContext } from '@/features/keystone/context'

export const dynamic = 'force-dynamic'

/** Readiness is this process and PostgreSQL. There are no background jobs: tire registration overdue is computed on read. */
export async function GET() {
  const headers = { 'cache-control': 'no-store' }
  const db = keystoneContext.prisma as any
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers })
  }
  return NextResponse.json({ status: 'ok', database: 'ok' }, { status: 200, headers })
}
