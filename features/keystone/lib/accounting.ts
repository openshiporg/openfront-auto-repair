import type { Tx } from './db'
import { Codes, DomainError } from './errors'
import { sumMinor } from './money'
import { actorUserId, type Actor } from './actor'
import { auditCreate, transition } from './cas'
import { payloadHash, sha256 } from './canonical'
import { nextShopReference } from './sequence'
import type { UnitOfWork } from './unitOfWork'
import { shopDay } from './flagging'

/*
 * Accounting export (SCHEMA §11.10, R§11.6). There is no internal general ledger: the shop's books live in
 * its accounting system. This builds one balanced daily journal from the sub-ledgers, stages it as
 * NOT_POSTED, writes a file a bookkeeper imports, and only a person recording the books' answer moves a batch
 * to POSTED. The QuickBooks Online adapter is designed in docs (INTEGRATIONS §11) and is not wired here.
 */

export type JournalLine = { sourceKey: string; side: 'debit' | 'credit'; amountMinor: string; description: string; accountCode?: string; accountName?: string }

export const SOURCE_KEYS = ['sales.labor', 'sales.parts', 'sales.fees', 'sales.sublet', 'sales.discounts', 'sales.tax', 'accounts_receivable', 'deposits', 'refunds', 'credit_memos', 'tender.cash', 'tender.check', 'tender.card', 'tender.ach', 'tender.financing', 'tender.other'] as const

const tenderKey = (tender: string) => (tender === 'cash' ? 'tender.cash' : tender === 'check' ? 'tender.check' : ['card_link', 'card_present', 'tap_to_pay'].includes(tender) ? 'tender.card' : tender === 'ach' ? 'tender.ach' : tender === 'financing' ? 'tender.financing' : 'tender.other')
const DAY = 86_400_000
const dayEdge = (date: string) => { const start = new Date(`${date}T00:00:00Z`); return { gte: start, lt: new Date(start.getTime() + DAY) } }

export function assertDate(value: unknown, field = 'businessDate') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new DomainError(Codes.INVALID_INPUT, 'Choose a day, as YYYY-MM-DD.', { field })
  return value
}

/** Net a signed amount onto a side: a credit-natured amount below zero is a debit. */
function put(lines: JournalLine[], sourceKey: string, nature: 'credit' | 'debit', amount: bigint, description: string) {
  if (amount === 0n) return
  const side = amount > 0n ? nature : nature === 'credit' ? 'debit' : 'credit'
  lines.push({ sourceKey, side, amountMinor: (amount < 0n ? -amount : amount).toString(), description })
}

/** Build the day's journal from invoices, payments, refunds and credit memos. Pure read. */
export async function buildJournal(tx: Tx, shopId: string, date: string) {
  assertDate(date)
  const edge = dayEdge(date)
  const lines: JournalLine[] = []

  const invoices = await tx.invoice.findMany({ where: { shopId, invoiceDate: edge, finalizedAt: { not: null }, status: { notIn: ['draft', 'void'] } }, select: { totalMinor: true, laborSubtotalMinor: true, partsSubtotalMinor: true, feesSubtotalMinor: true, subletSubtotalMinor: true, discountMinor: true, taxMinor: true } })
  const sum = (pick: (i: (typeof invoices)[number]) => bigint) => sumMinor(invoices.map(pick))
  put(lines, 'sales.labor', 'credit', sum(i => i.laborSubtotalMinor), 'Labor sales')
  put(lines, 'sales.parts', 'credit', sum(i => i.partsSubtotalMinor), 'Parts and tire sales')
  put(lines, 'sales.fees', 'credit', sum(i => i.feesSubtotalMinor), 'Fees (tire, battery, shop)')
  put(lines, 'sales.sublet', 'credit', sum(i => i.subletSubtotalMinor), 'Sublet sales')
  put(lines, 'sales.discounts', 'credit', sum(i => i.discountMinor), 'Discounts')
  put(lines, 'sales.tax', 'credit', sum(i => i.taxMinor), 'Sales tax collected')
  put(lines, 'accounts_receivable', 'debit', sum(i => i.totalMinor), `Invoiced (${invoices.length})`)

  const payments = await tx.payment.findMany({ where: { shopId, businessDate: edge, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } }, select: { id: true, purpose: true, tender: true, amountMinor: true } })
  const byTender = new Map<string, { invoice: bigint; deposit: bigint }>()
  for (const p of payments) {
    const k = tenderKey(p.tender)
    const row = byTender.get(k) ?? { invoice: 0n, deposit: 0n }
    if (p.purpose === 'deposit') row.deposit += p.amountMinor
    else row.invoice += p.amountMinor
    byTender.set(k, row)
  }
  for (const [k, v] of [...byTender].sort(([a], [b]) => a.localeCompare(b))) {
    put(lines, k, 'debit', v.invoice + v.deposit, `Received ${k.replace('tender.', '')}`)
  }
  put(lines, 'accounts_receivable', 'credit', sumMinor(payments.filter(p => p.purpose !== 'deposit').map(p => p.amountMinor)), 'Customer payments applied')
  put(lines, 'deposits', 'credit', sumMinor(payments.filter(p => p.purpose === 'deposit').map(p => p.amountMinor)), 'Deposits received')
  // Deposits put onto invoices that day release the liability.
  const applied = await tx.paymentAllocation.findMany({ where: { at: edge, refundId: null, payment: { shopId, purpose: 'deposit' } }, select: { amountMinor: true } })
  put(lines, 'deposits', 'debit', sumMinor(applied.map(a => a.amountMinor)), 'Deposits applied to invoices')
  put(lines, 'accounts_receivable', 'credit', sumMinor(applied.map(a => a.amountMinor)), 'Deposits applied to invoices')

  const refunds = await tx.refund.findMany({ where: { businessDate: edge, status: 'succeeded', payment: { shopId } }, select: { amountMinor: true, payment: { select: { tender: true } } } })
  put(lines, 'refunds', 'debit', sumMinor(refunds.map(r => r.amountMinor)), 'Refunds paid')
  const refundByTender = new Map<string, bigint>()
  for (const r of refunds) refundByTender.set(tenderKey(r.payment!.tender), (refundByTender.get(tenderKey(r.payment!.tender)) ?? 0n) + r.amountMinor)
  for (const [k, v] of [...refundByTender].sort(([a], [b]) => a.localeCompare(b))) put(lines, k, 'credit', v, `Refunded ${k.replace('tender.', '')}`)

  const memos = await tx.creditMemo.findMany({ where: { shopId, issuedAt: edge, status: 'issued' }, select: { subtotalMinor: true, taxMinor: true, totalMinor: true } })
  put(lines, 'credit_memos', 'debit', sumMinor(memos.map(m => m.subtotalMinor)), 'Credit memos')
  put(lines, 'sales.tax', 'debit', sumMinor(memos.map(m => m.taxMinor)), 'Sales tax credited')
  put(lines, 'accounts_receivable', 'credit', sumMinor(memos.map(m => m.totalMinor)), 'Credit memos issued')

  // Fold repeated keys on the same side into one line each, in a stable order.
  const folded = new Map<string, JournalLine>()
  for (const l of lines) {
    const k = `${l.side}|${l.sourceKey}`
    const prior = folded.get(k)
    if (prior) { prior.amountMinor = (BigInt(prior.amountMinor) + BigInt(l.amountMinor)).toString(); if (!prior.description.includes(l.description)) prior.description += `; ${l.description}` }
    else folded.set(k, { ...l })
  }
  const out = [...folded.values()].sort((a, b) => (a.side === b.side ? a.sourceKey.localeCompare(b.sourceKey) : a.side === 'debit' ? -1 : 1))
  const debit = sumMinor(out.filter(l => l.side === 'debit').map(l => BigInt(l.amountMinor)))
  const credit = sumMinor(out.filter(l => l.side === 'credit').map(l => BigInt(l.amountMinor)))
  return { lines: out, debitTotalMinor: debit, creditTotalMinor: credit, invoices: invoices.length, payments: payments.length }
}

export async function mappingsFor(tx: Tx, shopId: string) {
  const rows = await tx.accountingMapping.findMany({ where: { shopId, active: true } })
  return new Map(rows.map(r => [r.sourceKey, r]))
}

export async function saveMappings(uow: UnitOfWork, actor: Actor, input: { shopId: string; mappings: { sourceKey: string; accountCode: string; accountName?: string | null }[] }) {
  if (!Array.isArray(input.mappings) || !input.mappings.length) throw new DomainError(Codes.INVALID_INPUT, 'Enter at least one account mapping.', { field: 'mappings' })
  let changed = 0
  for (const m of input.mappings) {
    const sourceKey = String(m.sourceKey ?? '').trim()
    const accountCode = String(m.accountCode ?? '').trim().slice(0, 40)
    if (!(SOURCE_KEYS as readonly string[]).includes(sourceKey)) throw new DomainError(Codes.INVALID_INPUT, `${sourceKey.slice(0, 40)} is not something the journal posts.`, { field: 'sourceKey' })
    if (!accountCode) throw new DomainError(Codes.INVALID_INPUT, `Enter the account code for ${sourceKey}.`, { field: 'accountCode' })
    const accountName = String(m.accountName ?? '').trim().slice(0, 120)
    const existing = await uow.tx.accountingMapping.findUnique({ where: { shopId_sourceKey: { shopId: input.shopId, sourceKey } } })
    if (existing) {
      if (existing.accountCode === accountCode && existing.accountName === accountName && existing.active) continue
      await uow.tx.accountingMapping.update({ where: { id: existing.id }, data: { accountCode, accountName, active: true, version: { increment: 1 } } })
      uow.audit({ eventType: 'accounting.mapping_changed', entityType: 'AccountingMapping', entityId: existing.id, actorUserId: actorUserId(actor), before: { accountCode: existing.accountCode }, after: { accountCode } })
    } else {
      const row = await uow.tx.accountingMapping.create({ data: { shopId: input.shopId, sourceKey, accountCode, accountName, side: 'credit' } })
      auditCreate(uow, actor, 'AccountingMapping', row.id, 'accounting.mapping_created', { sourceKey, accountCode })
    }
    changed += 1
  }
  return { changed }
}

/** Stage the day's journal. Same content gives the same batch; changed content replaces an unposted batch; a posted day is never replaced. */
export async function stageJournal(uow: UnitOfWork, actor: Actor, input: { shopId: string; businessDate: string }) {
  const { tx, now } = uow
  const date = assertDate(input.businessDate)
  const shop = await tx.shop.findUnique({ where: { id: input.shopId }, select: { code: true, timeZone: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (date > shopDay(now, shop.timeZone).toISOString().slice(0, 10)) throw new DomainError(Codes.GUARD_FAILED, 'That day has not happened yet.', { field: 'businessDate' })
  const journal = await buildJournal(tx, input.shopId, date)
  if (!journal.lines.length) throw new DomainError(Codes.GUARD_FAILED, 'Nothing was invoiced or received on that day.', { field: 'businessDate' })
  if (journal.debitTotalMinor !== journal.creditTotalMinor) throw new DomainError(Codes.GUARD_FAILED, 'The day does not balance, so it was not staged. Run the tie-outs to find the difference.', { field: 'businessDate' })
  const maps = await mappingsFor(tx, input.shopId)
  const unmapped = [...new Set(journal.lines.filter(l => !maps.has(l.sourceKey)).map(l => l.sourceKey))]
  if (unmapped.length) throw new DomainError(Codes.GUARD_FAILED, `Map these to accounts first: ${unmapped.join(', ')}.`, { field: 'mappings' })
  const lines = journal.lines.map(l => ({ ...l, accountCode: maps.get(l.sourceKey)!.accountCode, accountName: maps.get(l.sourceKey)!.accountName }))
  const sourceHash = payloadHash({ date, lines })
  const businessDate = new Date(`${date}T00:00:00Z`)

  const prior = await tx.accountingBatch.findMany({ where: { shopId: input.shopId, businessDate, status: { in: ['staged', 'exported', 'confirmed'] } } })
  const same = prior.find(b => b.sourceHash === sourceHash)
  if (same) return { id: same.id, reference: same.reference, existing: true, postingStatus: same.postingStatus }
  if (prior.some(b => b.status === 'confirmed')) throw new DomainError(Codes.GUARD_FAILED, 'This day is already posted to the books with different figures. Fix it there with an adjusting entry; it is not restaged.', { field: 'businessDate' })

  const reference = await nextShopReference(tx, 'ACB', shop.code.toUpperCase(), now)
  const batch = await tx.accountingBatch.create({
    data: { shopId: input.shopId, reference, businessDate, status: 'staged', postingStatus: 'NOT_POSTED', lines: lines as never, debitTotalMinor: journal.debitTotalMinor, creditTotalMinor: journal.creditTotalMinor, sourceHash, unmapped: [] as never, stagedById: actorUserId(actor) ?? '' },
  })
  for (const p of prior) {
    await transition(uow, { model: 'AccountingBatch', id: p.id, from: ['staged', 'exported'], to: 'voided', actor, eventType: 'accounting.batch_superseded', data: { supersededBy: batch.id }, metadata: { by: reference } })
  }
  auditCreate(uow, actor, 'AccountingBatch', batch.id, 'accounting.batch_staged', { reference, businessDate: date, debitTotalMinor: journal.debitTotalMinor, creditTotalMinor: journal.creditTotalMinor, lines: lines.length })
  return { id: batch.id, reference, existing: false, postingStatus: 'NOT_POSTED' }
}

const cell = (value: unknown) => {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}
const dollars = (minor: bigint) => `${(minor < 0n ? -minor : minor) / 100n}.${((minor < 0n ? -minor : minor) % 100n).toString().padStart(2, '0')}`

export function journalCsv(reference: string, date: string, lines: JournalLine[]) {
  const rows = [['Date', 'Journal', 'Account', 'Account name', 'Description', 'Debit', 'Credit']]
  for (const l of lines) rows.push([date, reference, l.accountCode ?? '', l.accountName ?? '', l.description, l.side === 'debit' ? dollars(BigInt(l.amountMinor)) : '', l.side === 'credit' ? dollars(BigInt(l.amountMinor)) : ''])
  return rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Write the file a bookkeeper imports. The batch stays NOT_POSTED. */
export async function exportBatch(uow: UnitOfWork, actor: Actor, input: { batchId: string }) {
  const { tx, now } = uow
  const batch = await tx.accountingBatch.findUnique({ where: { id: input.batchId } })
  if (!batch) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (batch.status === 'exported' && batch.exportJobId) {
    const job = await tx.exportJob.findUnique({ where: { id: batch.exportJobId } })
    return { exportJobId: job!.id, fileName: job!.fileName, sha256: job!.sha256, rowCount: job!.rowCount, postingStatus: batch.postingStatus, existing: true }
  }
  if (batch.status !== 'staged') throw new DomainError(Codes.INVALID_TRANSITION, `This batch is ${batch.status}.`, { currentStatus: batch.status })
  const shop = await tx.shop.findUnique({ where: { id: batch.shopId! }, select: { code: true } })
  const date = batch.businessDate!.toISOString().slice(0, 10)
  const content = journalCsv(batch.reference, date, batch.lines as unknown as JournalLine[])
  const reference = await nextShopReference(tx, 'EXP', shop!.code.toUpperCase(), now)
  const job = await tx.exportJob.create({
    data: { shopId: batch.shopId, reference, kind: 'accounting_journal', status: 'ready', periodStart: batch.businessDate, periodEnd: batch.businessDate, fileName: `${batch.reference}.csv`, contentType: 'text/csv', content, sha256: sha256(content), rowCount: (batch.lines as unknown as unknown[]).length, requestedById: actorUserId(actor) ?? '' },
  })
  auditCreate(uow, actor, 'ExportJob', job.id, 'export.created', { reference, kind: 'accounting_journal', batch: batch.reference, sha256: job.sha256 })
  await transition(uow, { model: 'AccountingBatch', id: batch.id, from: ['staged'], to: 'exported', actor, eventType: 'accounting.batch_exported', data: { exportJobId: job.id } })
  return { exportJobId: job.id, fileName: job.fileName, sha256: job.sha256, rowCount: job.rowCount, postingStatus: 'NOT_POSTED', existing: false }
}

/** Record what the books said. Only an accepted answer, recorded by a person, makes a batch POSTED. */
export async function recordProviderResponse(uow: UnitOfWork, actor: Actor, input: { batchId: string; outcome: 'accepted' | 'rejected' | 'partial' | 'error'; providerRef?: string | null; message?: string | null; payload?: unknown }) {
  const { tx, now } = uow
  if (!['accepted', 'rejected', 'partial', 'error'].includes(input.outcome)) throw new DomainError(Codes.INVALID_INPUT, 'Choose what the books said.', { field: 'outcome' })
  const batch = await tx.accountingBatch.findUnique({ where: { id: input.batchId } })
  if (!batch) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (batch.status !== 'exported') throw new DomainError(Codes.INVALID_TRANSITION, `Export the batch first. It is ${batch.status}.`, { currentStatus: batch.status })
  const providerRef = String(input.providerRef ?? '').trim().slice(0, 120)
  if (input.outcome === 'accepted' && !providerRef) throw new DomainError(Codes.INVALID_INPUT, 'Enter the journal number the books gave this entry.', { field: 'providerRef' })
  const message = String(input.message ?? '').trim().slice(0, 500)
  const payload = (input.payload && typeof input.payload === 'object' ? input.payload : {}) as object
  const contentHash = payloadHash({ batch: batch.id, outcome: input.outcome, providerRef, message, payload })
  const response = await tx.accountingProviderResponse.create({ data: { batchId: batch.id, outcome: input.outcome, providerRef, message, payload: payload as never, contentHash, receivedAt: now, recordedById: actorUserId(actor) ?? '' } })
  auditCreate(uow, actor, 'AccountingProviderResponse', response.id, 'accounting.response_recorded', { batch: batch.reference, outcome: input.outcome, providerRef })
  if (input.outcome === 'accepted') {
    await transition(uow, { model: 'AccountingBatch', id: batch.id, from: ['exported'], to: 'confirmed', actor, eventType: 'accounting.batch_posted', data: { postingStatus: 'POSTED', providerRef, confirmedById: actorUserId(actor) ?? '', confirmedAt: now } })
    return { responseId: response.id, status: 'confirmed', postingStatus: 'POSTED' }
  }
  if (input.outcome === 'rejected') {
    await transition(uow, { model: 'AccountingBatch', id: batch.id, from: ['exported'], to: 'rejected', actor, eventType: 'accounting.batch_rejected', reason: message || null })
    return { responseId: response.id, status: 'rejected', postingStatus: 'NOT_POSTED' }
  }
  return { responseId: response.id, status: 'exported', postingStatus: 'NOT_POSTED' }
}
