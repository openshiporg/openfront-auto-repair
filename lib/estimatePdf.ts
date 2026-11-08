import { MARGIN, PdfDoc } from './pdf'

/**
 * The estimate PDF, drawn only from a sent EstimateVersion's frozen snapshot, so the document always
 * matches what the customer was shown and authorized. Money arrives as integer minor-unit strings
 * and is formatted with string arithmetic.
 */

type Line = { kind: string; description: string; partNumber?: string; brand?: string; condition?: string | null; quantityMilli?: number; hours?: number | null; unitPriceMinor?: string; extendedMinor: string; taxMinor?: string; taxable?: boolean; sublet?: string | null; fee?: string | null }
type Job = { number: number; title: string; description?: string; urgency?: string; lines: Line[]; laborMinor: string; partsMinor: string; feesMinor: string; subtotalMinor: string; taxMinor: string; totalMinor: string; teardown?: { text?: string } | null; authorizedAlready?: boolean }
export type EstimateSnapshot = {
  roNumber: string; versionNumber: number; issuedAt: string
  shop: { name: string; legalName?: string; registrations?: Record<string, string> }
  customer: { name: string }
  vehicle: { label: string; vinLast8?: string } | null
  jobs: Job[]
  totals: { laborMinor: string; partsMinor: string; feesMinor: string; subtotalMinor: string; taxMinor: string; totalMinor: string }
  disclosures: { notices?: { key: string; text: string }[]; replacedPartsOffer?: string | null; nonReturnableNote?: string | null; consentText?: string }
}

export function usd(minor: string | number | bigint | null | undefined) {
  const s = String(minor ?? '0')
  if (!/^-?\d+$/.test(s)) return ''
  const neg = s.startsWith('-')
  const abs = s.replace('-', '').padStart(3, '0')
  const whole = abs.slice(0, -2).replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}$${whole}.${abs.slice(-2)}`
}
const qty = (milli?: number) => { if (!milli) return ''; const w = Math.trunc(milli / 1000); const f = String(milli % 1000).padStart(3, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : String(w) }
const hrs = (centi?: number | null) => (centi ? `${Math.trunc(centi / 100)}.${String(centi % 100).padStart(2, '0')} h` : '')

export function renderEstimatePdf(s: EstimateSnapshot, reference: string, issuedLabel: string) {
  const pdf = new PdfDoc()
  const right = MARGIN + pdf.width
  const col = { qty: right - 200, each: right - 120, amount: right }
  pdf.footer = (p, n) => `${reference} · ${s.shop.name} · page ${p} of ${n}`

  pdf.text(s.shop.legalName || s.shop.name, MARGIN, 16, 'bold')
  pdf.text('ESTIMATE', right, 16, 'bold', 'right')
  pdf.y += 22
  const regs = s.shop.registrations ?? {}
  pdf.text([regs.barArd ? `BAR ARD ${regs.barArd}` : '', regs.epaId ? `EPA ${regs.epaId}` : ''].filter(Boolean).join(' · '), MARGIN, 9, 'regular', 'left', 0.35)
  pdf.text(`${reference} · version ${s.versionNumber}`, right, 9, 'regular', 'right', 0.35)
  pdf.y += 14
  pdf.text(`Repair order ${s.roNumber}`, MARGIN, 9, 'regular', 'left', 0.35)
  pdf.text(issuedLabel, right, 9, 'regular', 'right', 0.35)
  pdf.y += 22
  pdf.text(s.customer.name, MARGIN, 11, 'bold')
  pdf.y += 15
  if (s.vehicle) { pdf.text(`${s.vehicle.label}${s.vehicle.vinLast8 ? ` · VIN …${s.vehicle.vinLast8}` : ''}`, MARGIN, 10); pdf.y += 18 }
  pdf.rule(0.2, 1)
  pdf.y += 10

  for (const job of s.jobs) {
    pdf.need(70)
    pdf.text(`${job.number}. ${job.title}`, MARGIN, 11, 'bold')
    pdf.text(usd(job.totalMinor), right, 11, 'bold', 'right')
    pdf.y += 16
    if (job.authorizedAlready) { pdf.text('Already authorized; shown for completeness.', MARGIN, 8, 'regular', 'left', 0.4); pdf.y += 12 }
    if (job.description) pdf.paragraph(job.description, 9, 'regular', 0.3)
    pdf.y += 2
    pdf.text('Qty / hours', col.qty, 8, 'regular', 'right', 0.45)
    pdf.text('Each', col.each, 8, 'regular', 'right', 0.45)
    pdf.text('Amount', col.amount, 8, 'regular', 'right', 0.45)
    pdf.y += 12
    for (const l of job.lines) {
      pdf.need(26)
      const detail = [l.kind === 'labor' ? 'Labor' : l.kind === 'fee' ? 'Fee' : l.kind === 'sublet' ? `Sublet${l.sublet ? ` by ${l.sublet}` : ''}` : [l.brand, l.partNumber].filter(Boolean).join(' '), l.condition ? `${l.condition.replaceAll('_', ' ')} part` : '', l.taxable === false ? 'not taxed' : ''].filter(Boolean).join(' · ')
      pdf.text(l.description, MARGIN + 10, 9.5)
      pdf.text(l.kind === 'labor' ? hrs(l.hours) : qty(l.quantityMilli), col.qty, 9.5, 'regular', 'right')
      if (l.kind !== 'labor' && l.unitPriceMinor) pdf.text(usd(l.unitPriceMinor), col.each, 9.5, 'regular', 'right')
      pdf.text(usd(l.extendedMinor), col.amount, 9.5, 'regular', 'right')
      pdf.y += 12
      if (detail) { pdf.text(detail, MARGIN + 10, 8, 'regular', 'left', 0.45); pdf.y += 11 }
    }
    pdf.y += 2
    pdf.text(`Labor ${usd(job.laborMinor)} · Parts ${usd(job.partsMinor)}${job.feesMinor !== '0' ? ` · Fees ${usd(job.feesMinor)}` : ''} · Tax ${usd(job.taxMinor)}`, right, 8.5, 'regular', 'right', 0.35)
    pdf.y += 14
    if (job.teardown?.text) pdf.paragraph(job.teardown.text, 8.5, 'regular', 0.2)
    pdf.rule()
    pdf.y += 10
  }

  pdf.need(90)
  const totals: [string, string][] = [['Labor', s.totals.laborMinor], ['Parts', s.totals.partsMinor], ['Fees', s.totals.feesMinor], ['Subtotal', s.totals.subtotalMinor], ['Sales tax', s.totals.taxMinor]]
  for (const [k, v] of totals) {
    if (k === 'Fees' && v === '0') continue
    pdf.text(k, right - 150, 10, 'regular', 'left'); pdf.text(usd(v), right, 10, 'regular', 'right'); pdf.y += 14
  }
  pdf.text('Estimate total', right - 150, 12, 'bold'); pdf.text(usd(s.totals.totalMinor), right, 12, 'bold', 'right')
  pdf.y += 26

  const d = s.disclosures
  for (const n of d.notices ?? []) { pdf.paragraph(n.text, 8.5, 'regular', 0.2); pdf.y += 4 }
  if (d.replacedPartsOffer) { pdf.paragraph(d.replacedPartsOffer, 8.5, 'regular', 0.2); pdf.y += 4 }
  if (d.nonReturnableNote) { pdf.paragraph(d.nonReturnableNote, 8.5, 'regular', 0.2); pdf.y += 4 }
  if (d.consentText) { pdf.y += 4; pdf.paragraph(d.consentText, 8.5, 'bold', 0.1) }
  return pdf.toBytes({ title: `Estimate ${reference}`, author: s.shop.name })
}
