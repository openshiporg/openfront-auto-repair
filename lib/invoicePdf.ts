import { MARGIN, PdfDoc } from './pdf'
import { usd } from './estimatePdf'

/**
 * The invoice PDF, drawn from the finalized invoice rows and the disclosures frozen with them, so a
 * reprint years later reads the same. Money arrives as integer minor-unit strings.
 */

export type InvoiceDocument = {
  invoiceNumber: string; status: string; invoiceDate: string | null; dueDate: string | null; odometerOut: number | null; poNumber: string
  laborSubtotalMinor: string; partsSubtotalMinor: string; feesSubtotalMinor: string; subletSubtotalMinor: string; discountMinor: string
  taxMinor: string; totalMinor: string; paidMinor: string; creditedMinor: string; balanceMinor: string
  lines: { jobNumber: number | null; jobTitle: string; kind: string; description: string; partNumber: string; brand: string; quantityMilli: number; centiHours: number; unitPriceMinor: string; extendedMinor: string }[]
  disclosures: {
    registrations?: Record<string, string>; notices?: { key: string; text: string }[]; replacedParts?: string | null; nonReturnableNote?: string | null; thirdPartyNotice?: string | null
    odometer?: { in: number | null; out: number | null }; declinedSafetyItems?: { job: number; title: string; urgency: string }[]; warranty?: { job: number; name?: string; text?: string }[]
    taxExemption?: { kind: string; number: string; issuingState: string; expiresAt: string | null } | null
    payer?: { kind: string; name?: string; authorizationNumber?: string; claimNumber?: string }
  } | null
  shop: { name: string; legalName: string; phone: string; addressLine1: string; city: string; region: string; postalCode: string } | null
  customerName: string; payerName: string; roNumber: string; vehicle: string
}

const qty = (milli: number) => { const w = Math.trunc(milli / 1000); const f = String(milli % 1000).padStart(3, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : String(w) }
const hrs = (c: number) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')} h`
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : '')

export function renderInvoicePdf(inv: InvoiceDocument) {
  const pdf = new PdfDoc()
  const right = MARGIN + pdf.width
  const col = { qty: right - 200, each: right - 120, amount: right }
  const d = inv.disclosures ?? {}
  pdf.footer = (p, n) => `${inv.invoiceNumber} · ${inv.shop?.name ?? ''} · page ${p} of ${n}`

  pdf.text(inv.shop?.legalName || inv.shop?.name || '', MARGIN, 16, 'bold')
  pdf.text('INVOICE', right, 16, 'bold', 'right')
  pdf.y += 20
  const regs = d.registrations ?? {}
  pdf.text([regs.barArd ? `BAR ARD ${regs.barArd}` : '', regs.epaId ? `EPA ${regs.epaId}` : ''].filter(Boolean).join(' · '), MARGIN, 9, 'regular', 'left', 0.35)
  pdf.text(inv.invoiceNumber, right, 9, 'regular', 'right', 0.35)
  pdf.y += 12
  const address = [inv.shop?.addressLine1, [inv.shop?.city, inv.shop?.region].filter(Boolean).join(', '), inv.shop?.postalCode].filter(Boolean).join(' ')
  pdf.text([address, inv.shop?.phone].filter(Boolean).join(' · '), MARGIN, 9, 'regular', 'left', 0.35)
  pdf.text(`Repair order ${inv.roNumber}`, right, 9, 'regular', 'right', 0.35)
  pdf.y += 12
  pdf.text(inv.invoiceDate ? `Invoiced ${day(inv.invoiceDate)}${inv.dueDate ? ` · due ${day(inv.dueDate)}` : ''}` : '', right, 9, 'regular', 'right', 0.35)
  pdf.y += 14
  pdf.text(inv.payerName || inv.customerName, MARGIN, 11, 'bold')
  pdf.y += 15
  if (inv.payerName && inv.payerName !== inv.customerName) { pdf.text(`Customer ${inv.customerName}`, MARGIN, 9.5); pdf.y += 13 }
  if (inv.vehicle) { pdf.text(inv.vehicle, MARGIN, 10); pdf.y += 14 }
  const odo = d.odometer
  if (odo && (odo.in !== null || odo.out !== null)) {
    pdf.text(`Odometer in ${odo.in !== null ? odo.in.toLocaleString('en-US') : 'not recorded'} · out ${odo.out !== null ? odo.out.toLocaleString('en-US') : 'not recorded'}`, MARGIN, 9.5)
    pdf.y += 14
  }
  if (inv.poNumber) { pdf.text(`PO ${inv.poNumber}`, MARGIN, 9.5); pdf.y += 14 }
  if (d.taxExemption) {
    pdf.text(`Tax exempt: ${d.taxExemption.kind} certificate ${d.taxExemption.number}${d.taxExemption.issuingState ? `, ${d.taxExemption.issuingState}` : ''}${d.taxExemption.expiresAt ? `, valid until ${d.taxExemption.expiresAt}` : ''}`, MARGIN, 9.5)
    pdf.y += 14
  }
  if (d.payer?.authorizationNumber || d.payer?.claimNumber) {
    pdf.text([d.payer.authorizationNumber ? `Authorization ${d.payer.authorizationNumber}` : '', d.payer.claimNumber ? `Claim ${d.payer.claimNumber}` : ''].filter(Boolean).join(' · '), MARGIN, 9.5)
    pdf.y += 14
  }
  pdf.rule(0.2, 1)
  pdf.y += 10

  let lastJob: number | null | undefined
  for (const l of inv.lines) {
    pdf.need(40)
    if (l.jobNumber !== lastJob) {
      lastJob = l.jobNumber
      pdf.y += 4
      pdf.text(l.jobNumber ? `${l.jobNumber}. ${l.jobTitle}` : l.jobTitle || 'Other charges', MARGIN, 11, 'bold')
      pdf.y += 15
      pdf.text('Qty / hours', col.qty, 8, 'regular', 'right', 0.45); pdf.text('Each', col.each, 8, 'regular', 'right', 0.45); pdf.text('Amount', col.amount, 8, 'regular', 'right', 0.45)
      pdf.y += 12
    }
    pdf.text(l.description, MARGIN + 10, 9.5)
    pdf.text(l.kind === 'labor' ? hrs(l.centiHours) : qty(l.quantityMilli), col.qty, 9.5, 'regular', 'right')
    if (l.kind !== 'labor' && l.unitPriceMinor !== '0') pdf.text(usd(l.unitPriceMinor), col.each, 9.5, 'regular', 'right')
    pdf.text(usd(l.extendedMinor), col.amount, 9.5, 'regular', 'right')
    pdf.y += 12
    const detail = [l.kind === 'labor' ? 'Labor' : l.kind === 'fee' ? 'Fee' : [l.brand, l.partNumber].filter(Boolean).join(' ')].filter(Boolean).join('')
    if (detail) { pdf.text(detail, MARGIN + 10, 8, 'regular', 'left', 0.45); pdf.y += 11 }
  }
  pdf.rule()
  pdf.y += 12

  pdf.need(120)
  const rows: [string, string][] = [['Labor', inv.laborSubtotalMinor], ['Parts', inv.partsSubtotalMinor], ['Fees', inv.feesSubtotalMinor], ['Sublet', inv.subletSubtotalMinor], ['Discount', inv.discountMinor], ['Sales tax', inv.taxMinor]]
  for (const [k, v] of rows) {
    if (k !== 'Labor' && k !== 'Parts' && k !== 'Sales tax' && v === '0') continue
    pdf.text(k, right - 150, 10); pdf.text(usd(v), right, 10, 'regular', 'right'); pdf.y += 14
  }
  pdf.text('Invoice total', right - 150, 12, 'bold'); pdf.text(usd(inv.totalMinor), right, 12, 'bold', 'right'); pdf.y += 18
  if (inv.paidMinor !== '0') { pdf.text('Paid', right - 150, 10); pdf.text(usd(inv.paidMinor), right, 10, 'regular', 'right'); pdf.y += 14 }
  if (inv.creditedMinor !== '0') { pdf.text('Credited', right - 150, 10); pdf.text(usd(inv.creditedMinor), right, 10, 'regular', 'right'); pdf.y += 14 }
  pdf.text('Balance due', right - 150, 12, 'bold'); pdf.text(usd(inv.balanceMinor), right, 12, 'bold', 'right'); pdf.y += 26

  for (const n of d.notices ?? []) { pdf.paragraph(n.text, 8.5, 'regular', 0.2); pdf.y += 4 }
  for (const text of [d.replacedParts, d.nonReturnableNote, d.thirdPartyNotice]) if (text) { pdf.paragraph(text, 8.5, 'regular', 0.2); pdf.y += 4 }
  for (const w of d.warranty ?? []) if (w.text) { pdf.paragraph(`Job ${w.job}${w.name ? `, ${w.name}` : ''}: ${w.text}`, 8.5, 'regular', 0.2); pdf.y += 4 }
  if (d.declinedSafetyItems?.length) {
    pdf.y += 4
    pdf.paragraph(`Recommended and declined: ${d.declinedSafetyItems.map(x => `${x.title} (${x.urgency === 'safety' ? 'safety' : 'soon'})`).join('; ')}.`, 8.5, 'bold', 0.15)
  }
  return pdf.toBytes({ title: `Invoice ${inv.invoiceNumber}`, author: inv.shop?.name ?? '' })
}
