import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { renderEstimatePdf, type EstimateSnapshot } from '@/lib/estimatePdf'

export const dynamic = 'force-dynamic'

/** The estimate PDF for staff: read through the session (shop scoping applies), drawn from the frozen snapshot. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await keystoneContext.withRequest({ headers: { cookie: request.headers.get('cookie') || '' }, method: 'GET', url: `/api/estimates/${id}/pdf` } as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in to view estimates.', { status: 401 })
  const row = await context.query.EstimateVersion.findOne({ where: { id }, query: 'reference status snapshot sentAt repairOrder { shop { timeZone } }' }).catch(() => null) as { reference: string; status: string; snapshot: EstimateSnapshot | null; sentAt: string | null; repairOrder: { shop: { timeZone: string } | null } | null } | null
  if (!row?.snapshot || row.status === 'draft') return new Response('Estimate not found.', { status: 404 })
  const tz = row.repairOrder?.shop?.timeZone || 'America/Los_Angeles'
  const issued = row.sentAt ? new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.sentAt)) : ''
  const bytes = renderEstimatePdf(row.snapshot, row.reference, issued ? `Sent ${issued}${row.status === 'superseded' ? ' · superseded' : ''}` : '')
  return new Response(bytes as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${row.reference.replace(/[^\w.-]+/g, '_')}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
