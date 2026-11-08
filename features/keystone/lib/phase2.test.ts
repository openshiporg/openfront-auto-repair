import { describe, expect, it } from 'vitest'
import { deriveCondition, type MeasurementSpec } from './inspections'
import { parseLines } from './repairOrders'
import { deriveToken, hashToken, isTokenShape } from './publicTokens'
import { boardStage, promisedRisk } from '../../../lib/board'
import { renderEstimatePdf, usd, type EstimateSnapshot } from '../../../lib/estimatePdf'
import { textWidth, wrap } from '../../../lib/pdf'

const PADS: MeasurementSpec = { unit: 'mm', positions: ['LF', 'RF'], thresholds: [{ max: 3, condition: 'red' }, { max: 5, condition: 'yellow' }] }

describe('DVI condition from measurements', () => {
  it('takes the worst reading', () => {
    expect(deriveCondition(PADS, [{ position: 'LF', value: 8 }, { position: 'RF', value: 7 }])).toBe('green')
    expect(deriveCondition(PADS, [{ position: 'LF', value: 5 }, { position: 'RF', value: 7 }])).toBe('yellow')
    expect(deriveCondition(PADS, [{ position: 'LF', value: 4 }, { position: 'RF', value: 2 }])).toBe('red')
  })
  it('says nothing without a spec or readings', () => {
    expect(deriveCondition(null, [{ value: 1 }])).toBeNull()
    expect(deriveCondition(PADS, [])).toBeNull()
  })
})

describe('job line input', () => {
  it('parses money as cents and refuses fractions of a cent', () => {
    const [l] = parseLines([{ kind: 'part', description: 'Pad set', quantityMilli: 1000, unitCostMinor: '4800', condition: 'new' }])
    expect(l.unitCostMinor).toBe(4800n)
    expect(l.condition).toBe('new')
    expect(() => parseLines([{ kind: 'part', unitCostMinor: '48.5' }])).toThrow()
    expect(() => parseLines([{ kind: 'part', unitCostMinor: 48.5 }])).toThrow()
  })
  it('refuses unknown kinds and long jobs', () => {
    expect(() => parseLines([{ kind: 'magic' }])).toThrow(/unknown kind/)
    expect(() => parseLines(Array.from({ length: 61 }, () => ({ kind: 'labor' })))).toThrow(/Sixty/)
    expect(() => parseLines('x')).toThrow(/list/)
  })
  it('keeps a chosen labor-guide variant', () => {
    const [l] = parseLines([{ kind: 'labor', operationCode: 'BRK-PAD-F', variant: 'With wear sensor (RWD)' }]) as { variant?: string }[]
    expect(l.variant).toBe('With wear sensor (RWD)')
  })
})

describe('customer link tokens', () => {
  it('derive from the row id; only the hash is stored', () => {
    const t = deriveToken('authorization', 'row-1')
    expect(isTokenShape(t)).toBe(true)
    expect(t).toBe(deriveToken('authorization', 'row-1'))
    expect(t).not.toBe(deriveToken('inspection', 'row-1'))
    expect(t).not.toBe(deriveToken('authorization', 'row-2'))
    const h = hashToken('authorization', t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(t)
    expect(hashToken('inspection', t)).not.toBe(h)
  })
})

describe('work board', () => {
  it('ranks waiting on the customer above everything in service', () => {
    expect(boardStage({ status: 'in_service', jobs: [{ status: 'in_progress' }, { status: 'offered' }], inspections: [] })).toBe('awaiting_authorization')
    expect(boardStage({ status: 'in_service', jobs: [{ status: 'needs_reauthorization' }], inspections: [] })).toBe('awaiting_authorization')
    expect(boardStage({ status: 'in_service', jobs: [{ status: 'in_progress' }], inspections: [] })).toBe('in_progress')
    expect(boardStage({ status: 'in_service', jobs: [], inspections: [{ status: 'in_progress' }] })).toBe('inspecting')
    expect(boardStage({ status: 'on_hold', jobs: [{ status: 'offered' }], inspections: [] })).toBe('on_hold')
  })
  it('flags late and due-soon promises', () => {
    const now = new Date('2026-11-07T18:00:00Z')
    expect(promisedRisk('2026-11-07T17:59:00Z', now, false)).toBe('late')
    expect(promisedRisk('2026-11-07T18:30:00Z', now, false)).toBe('due_soon')
    expect(promisedRisk('2026-11-07T21:00:00Z', now, false)).toBe('ok')
    expect(promisedRisk('2026-11-07T17:00:00Z', now, true)).toBe('none')
  })
})

describe('estimate PDF', () => {
  const snapshot: EstimateSnapshot = {
    roNumber: 'NGA-RO-000012', versionNumber: 2, issuedAt: '2026-11-07T18:00:00Z',
    shop: { name: 'Northgate Auto Care', registrations: { barArd: 'ARD-000000' } },
    customer: { name: 'Robert Okafor' }, vehicle: { label: '2019 Toyota Camry', vinLast8: 'KU123456' },
    jobs: [{
      number: 1, title: 'Front brake pads and rotors', description: 'Replace the front pads and rotors.',
      lines: [
        { kind: 'labor', description: 'Front brakes, replace', hours: 160, extendedMinor: '26400', taxable: false },
        { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', condition: 'new', quantityMilli: 1000, unitPriceMinor: '9600', extendedMinor: '9600', taxable: true },
      ],
      laborMinor: '26400', partsMinor: '9600', feesMinor: '0', subtotalMinor: '36000', taxMinor: '840', totalMinor: '36840',
    }],
    totals: { laborMinor: '26400', partsMinor: '9600', feesMinor: '0', subtotalMinor: '36000', taxMinor: '840', totalMinor: '36840' },
    disclosures: { replacedPartsOffer: 'Do you want your replaced parts returned?', consentText: 'By approving, I authorize the work.' },
  }
  it('formats cents exactly', () => {
    expect(usd('36840')).toBe('$368.40')
    expect(usd('5')).toBe('$0.05')
    expect(usd('123456789')).toBe('$1,234,567.89')
    expect(usd('-700')).toBe('-$7.00')
  })
  it('writes a well-formed PDF with the totals and the condition of each part', () => {
    const bytes = renderEstimatePdf(snapshot, 'NGA-RO-000012-E2', 'Sent Nov 7, 2026')
    const text = Buffer.from(bytes).toString('latin1')
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('($368.40)')
    expect(text).toContain('new part')
    expect(text).toContain('BAR ARD ARD-000000')
    // The xref offsets point at the objects.
    const xref = Number(text.match(/startxref\n(\d+)/)![1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const first = Number(text.slice(xref).split('\n')[3].slice(0, 10))
    expect(text.slice(first, first + 7)).toBe('1 0 obj')
  })
  it('wraps long text inside the width', () => {
    const lines = wrap('word '.repeat(80), 200, 10)
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.every(l => textWidth(l, 10) <= 200)).toBe(true)
  })
})
