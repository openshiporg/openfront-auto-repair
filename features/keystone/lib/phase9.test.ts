import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseCsv, readTable } from './csv'
import { parseImport } from './importers'
import { normalizeWebhookEvents, normalizeWebhookUrl, nextWebhookAttempt, sign, topicOf, WEBHOOK_DELIVERY_MAX_ATTEMPTS, WEBHOOK_TOPICS } from './webhooks'
import { journalCsv } from './accounting'
import { REPORT_DEFINITIONS } from './reporting'
import { HUMAN_ONLY_MUTATIONS } from '../mcp-oauth/guard'

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, '../fixtures/imports', name), 'utf8')

describe('CSV reading', () => {
  it('handles quotes, doubled quotes, CRLF and a byte-order mark', () => {
    expect(parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n')).toEqual([['a', 'b'], ['x, y', 'say "hi"']])
    expect(() => parseCsv('a\n"open')).toThrow()
  })
  it('reads the Tekmetric fixture with file line numbers', () => {
    const t = readTable(fixture('tekmetric-customers.csv'))
    expect(t.headers.slice(0, 3)).toEqual(['customer_id', 'first_name', 'last_name'])
    expect(t.records.map(r => r.line)).toEqual([2, 3, 4, 5, 6])
    expect(t.records[1].values.notes).toBe('Drives for work, "fleet-like" mileage')
  })
})

describe('import parsing', () => {
  it('keeps each row\'s id from the old system as its identity', () => {
    const rows = parseImport('tekmetric_csv', 'customers', fixture('tekmetric-customers.csv'))
    expect(rows.map(r => r.externalId)).toEqual(['TM-1001', 'TM-1002', 'TM-1003', 'TM-1004', 'TM-1005'])
    expect(rows[2].data.company).toBe('Sierra Plumbing Co')
    const cars = parseImport('tekmetric_csv', 'vehicles', fixture('tekmetric-vehicles.csv'))
    expect(cars[0]).toMatchObject({ externalId: 'TMV-2001', data: { customerId: 'TM-1001', vin: '2HGFC2F69KH512345', state: 'CA' } })
  })
  it('refuses a file that is not that source or is empty', () => {
    expect(() => parseImport('tekmetric_csv', 'customers', 'name,phone\nA,1')).toThrow(/Customer ID|customer_id/)
    expect(() => parseImport('tekmetric_csv', 'customers', '  ')).toThrow(/empty/)
    expect(() => parseImport('quickbooks' as never, 'customers', 'a')).toThrow()
  })
  it('gives a generic file without ids a stable identity from its content', () => {
    const text = 'first_name,last_name,phone\nAnn,Lee,9165550101\n'
    expect(parseImport('generic_csv', 'customers', text)[0].externalId).toBe(parseImport('generic_csv', 'customers', text)[0].externalId)
  })
})

describe('webhooks out', () => {
  it('only accepts https (or local http outside production) and no embedded passwords', () => {
    expect(normalizeWebhookUrl('https://shop.example/hook')).toBe('https://shop.example/hook')
    expect(() => normalizeWebhookUrl('http://shop.example/hook')).toThrow(/https/)
    expect(() => normalizeWebhookUrl('https://u:p@shop.example/')).toThrow()
    expect(() => normalizeWebhookUrl('not a url')).toThrow()
  })
  it('knows exactly the topics of INTEGRATIONS §10 and refuses others', () => {
    expect(Object.keys(WEBHOOK_TOPICS).sort()).toEqual(['appointment.created', 'comeback.opened', 'estimate.sent', 'inspection.sent', 'invoice.finalized', 'job.authorized', 'job.declined', 'parts.received', 'payment.succeeded', 'repair_order.updated'].sort())
    expect(normalizeWebhookEvents(['job.declined', 'job.declined', 'estimate.sent'])).toEqual(['estimate.sent', 'job.declined'])
    expect(() => normalizeWebhookEvents(['customer.exported'])).toThrow()
    expect(() => normalizeWebhookEvents([])).toThrow()
    expect(topicOf('ro.in_service')).toBe('repair_order.updated')
    expect(topicOf('receipt.recorded')).toBe('parts.received')
    expect(topicOf('customer.updated')).toBeNull()
  })
  it('signs with HMAC-SHA256 and backs off then gives up', () => {
    expect(sign('k', '{"a":1}')).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(sign('k', 'x')).not.toBe(sign('j', 'x'))
    const t = 1_000_000
    expect(nextWebhookAttempt(1, t)!.getTime() - t).toBe(120_000)
    expect(nextWebhookAttempt(20, t)).toBeNull()
    expect(nextWebhookAttempt(WEBHOOK_DELIVERY_MAX_ATTEMPTS - 1, t)).not.toBeNull()
    expect(nextWebhookAttempt(WEBHOOK_DELIVERY_MAX_ATTEMPTS, t)).toBeNull()
  })
})

describe('accounting export file and report definitions', () => {
  it('writes debits and credits in dollars and neutralises spreadsheet formulas', () => {
    const csv = journalCsv('ACB-NGA-2026-000001', '2026-11-13', [
      { sourceKey: 'tender.cash', side: 'debit', amountMinor: '12345', description: '=HYPERLINK("x")', accountCode: '1000', accountName: 'Cash' },
      { sourceKey: 'sales.labor', side: 'credit', amountMinor: '12345', description: 'Labor sales', accountCode: '4000', accountName: 'Labor' },
    ])
    const lines = csv.trim().split('\r\n')
    expect(lines[1]).toContain('123.45,')
    expect(lines[1]).toContain("'=HYPERLINK")
    expect(lines[2].endsWith(',123.45')).toBe(true)
  })
  it('prints a definition for each report (C27)', () => {
    for (const key of ['car_count', 'aro', 'elr', 'gp_labor', 'gp_parts', 'tech_productivity', 'approval_rate', 'dvi_rate', 'comeback_rate', 'cycle_time']) expect(REPORT_DEFINITIONS[key].definition.length).toBeGreaterThan(40)
  })
  it('keeps money and integration commands away from connected assistants', () => {
    for (const n of ['stageAccountingBatch', 'exportAccountingBatch', 'recordAccountingResponse', 'applyDataImport', 'createWebhookEndpoint', 'saveIntegrationConnection']) expect(HUMAN_ONLY_MUTATIONS.has(n), n).toBe(true)
  })
})
