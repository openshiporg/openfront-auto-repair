import type { IncomingMessage } from 'node:http'
import { keystoneContext } from '@/features/keystone/context'
import { renderInvoicePdf, type InvoiceDocument } from '@/lib/invoicePdf'

export const dynamic = 'force-dynamic'

const FIELDS = `invoiceNumber status invoiceDate dueDate odometerOut poNumber laborSubtotalMinor partsSubtotalMinor feesSubtotalMinor subletSubtotalMinor discountMinor taxMinor totalMinor paidMinor creditedMinor balanceMinor disclosures
  lines(orderBy: { sortOrder: asc }) { jobNumber jobTitle kind description partNumber brand quantityMilli centiHours unitPriceMinor extendedMinor }
  shop { name legalName phone addressLine1 city region postalCode }
  customer { displayName } businessAccount { name } repairOrder { roNumber vehicle { label } }`

/** The invoice PDF for staff, read through the session so shop scoping applies. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const context = await keystoneContext.withRequest({ headers: { cookie: request.headers.get('cookie') || '' }, method: 'GET', url: `/api/invoices/${id}/pdf` } as IncomingMessage)
  if (!context.session?.itemId) return new Response('Sign in to view invoices.', { status: 401 })
  const row = await context.query.Invoice.findOne({ where: { id }, query: FIELDS }).catch(() => null) as Record<string, any> | null
  if (!row) return new Response('Invoice not found.', { status: 404 })
  const doc: InvoiceDocument = {
    ...(row as unknown as InvoiceDocument),
    poNumber: row.poNumber ?? '',
    customerName: row.customer?.displayName ?? '',
    payerName: row.businessAccount?.name ?? row.disclosures?.payer?.name ?? '',
    roNumber: row.repairOrder?.roNumber ?? '',
    vehicle: row.repairOrder?.vehicle?.label ?? '',
  }
  return new Response(renderInvoicePdf(doc) as unknown as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${String(row.invoiceNumber).replace(/[^\w.-]+/g, '_')}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
