import type { Tx } from './db'
import { sumMinor } from './money'
import { dayTotals } from './settlement'

/*
 * Sub-ledger tie-outs (SCHEMA §21). There is no internal general ledger: the accounting system is the GL.
 * These checks prove the sub-ledgers agree with each other, computed when asked (never by a schedule).
 * Each check compares two independent sums; a mismatch names the records that differ.
 */

export type TieOut = { key: string; label: string; ok: boolean; expected: string; actual: string; differences: string[] }

const check = (key: string, label: string, expected: bigint | number, actual: bigint | number, differences: string[] = []): TieOut => ({
  key, label, ok: expected === actual && differences.length === 0, expected: String(expected), actual: String(actual), differences: differences.slice(0, 20),
})

const LIVE_INVOICE = { status: { notIn: ['draft', 'void'] } }

export async function runTieOuts(tx: Tx, shopId: string): Promise<TieOut[]> {
  const out: TieOut[] = []

  // AR: open balances equal totals less allocations less credits, per invoice and per account.
  const invoices = await tx.invoice.findMany({ where: { shopId, ...LIVE_INVOICE }, select: { id: true, invoiceNumber: true, totalMinor: true, paidMinor: true, creditedMinor: true, balanceMinor: true, businessAccountId: true } })
  const allocations = await tx.paymentAllocation.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: invoices.map(i => i.id) } }, _sum: { amountMinor: true } })
  const allocated = new Map(allocations.map(a => [a.invoiceId, a._sum.amountMinor ?? 0n]))
  const credits = await tx.creditMemo.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: invoices.map(i => i.id) }, status: 'issued' }, _sum: { totalMinor: true } })
  const credited = new Map(credits.map(c => [c.invoiceId, c._sum.totalMinor ?? 0n]))
  const arDiff: string[] = []
  for (const i of invoices) {
    const expected = i.totalMinor - (allocated.get(i.id) ?? 0n) - (credited.get(i.id) ?? 0n)
    if (expected !== i.balanceMinor) arDiff.push(`${i.invoiceNumber}: balance ${i.balanceMinor} but totals less allocations and credits is ${expected}`)
  }
  const accounts = new Map<string, bigint>()
  for (const i of invoices) if (i.businessAccountId) accounts.set(i.businessAccountId, (accounts.get(i.businessAccountId) ?? 0n) + i.balanceMinor)
  for (const [id, sum] of accounts) {
    const account = await tx.businessAccount.findUnique({ where: { id }, select: { openBalanceMinor: true, name: true } })
    if (account && account.openBalanceMinor !== sum) arDiff.push(`${account.name}: account balance ${account.openBalanceMinor} but its invoices add to ${sum}`)
  }
  out.push(check('ar', 'Accounts receivable', sumMinor(invoices.map(i => i.totalMinor - (allocated.get(i.id) ?? 0n) - (credited.get(i.id) ?? 0n))), sumMinor(invoices.map(i => i.balanceMinor)), arDiff))

  // Deposits: money taken as deposits less what has been applied or refunded is the liability.
  const deposits = await tx.payment.findMany({ where: { shopId, purpose: 'deposit', status: { in: ['succeeded', 'partially_refunded', 'refunded'] } }, select: { id: true, amountMinor: true, allocatedMinor: true, refundedMinor: true } })
  const depAlloc = await tx.paymentAllocation.groupBy({ by: ['paymentId'], where: { paymentId: { in: deposits.map(d => d.id) }, refundId: null }, _sum: { amountMinor: true } })
  const depApplied = new Map(depAlloc.map(a => [a.paymentId, a._sum.amountMinor ?? 0n]))
  const depDiff = deposits.filter(d => d.allocatedMinor > (depApplied.get(d.id) ?? 0n) || d.allocatedMinor + d.refundedMinor > d.amountMinor).map(d => `Deposit ${d.id}: applied ${d.allocatedMinor} does not match its allocations ${depApplied.get(d.id) ?? 0n}`)
  out.push(check('deposits', 'Deposits liability', sumMinor(deposits.map(d => d.amountMinor - d.refundedMinor - (depApplied.get(d.id) ?? 0n))), sumMinor(deposits.map(d => d.amountMinor - d.refundedMinor - d.allocatedMinor)), depDiff))

  // Stock: on-hand equals the sum of movements, item by item.
  const items = await tx.shopItem.findMany({ where: { shopId, stockId: { not: null } }, select: { id: true, sku: true, stock: { select: { onHandMilli: true, averageCostMinor: true } } } })
  const moves = await tx.stockMovement.groupBy({ by: ['shopItemId'], where: { shopItemId: { in: items.map(i => i.id) } }, _sum: { onHandDeltaMilli: true } })
  const moved = new Map(moves.map(m => [m.shopItemId, m._sum.onHandDeltaMilli ?? 0]))
  const stockDiff = items.filter(i => (i.stock?.onHandMilli ?? 0) !== (moved.get(i.id) ?? 0)).map(i => `${i.sku}: on hand ${i.stock?.onHandMilli} but movements add to ${moved.get(i.id) ?? 0}`)
  out.push(check('stock', 'Stock on hand', items.reduce((n, i) => n + (moved.get(i.id) ?? 0), 0), items.reduce((n, i) => n + (i.stock?.onHandMilli ?? 0), 0), stockDiff))

  // Cores: what is owed to suppliers (owed or returned, not yet credited) adds up per supplier and in total.
  const cores = await tx.coreObligation.findMany({ where: { shopId, status: { in: ['owed', 'returned'] } }, select: { id: true, coreChargeMinor: true, supplierId: true } })
  const bySupplier = await tx.coreObligation.groupBy({ by: ['supplierId'], where: { shopId, status: { in: ['owed', 'returned'] } }, _sum: { coreChargeMinor: true } })
  out.push(check('cores', 'Cores owed', sumMinor(cores.map(c => c.coreChargeMinor)), sumMinor(bySupplier.map(s => s._sum.coreChargeMinor ?? 0n)), cores.filter(c => c.coreChargeMinor < 0n).map(c => `Core ${c.id} has a negative charge`)))

  // Flagged hours: net flagged hours of a completed job equal its sold hours (reversals included).
  const jobs = await tx.job.findMany({ where: { repairOrder: { shopId }, status: 'completed' }, select: { id: true, number: true, repairOrder: { select: { roNumber: true } }, lines: { where: { kind: 'labor' }, select: { soldCentiHours: true } } } })
  const flags = await tx.flaggedHoursEntry.groupBy({ by: ['jobId'], where: { shopId, jobId: { in: jobs.map(j => j.id) } }, _sum: { centiHours: true } })
  const flagged = new Map(flags.map(f => [f.jobId, f._sum.centiHours ?? 0]))
  const flagDiff: string[] = []
  let soldTotal = 0, flaggedTotal = 0
  for (const j of jobs) {
    if (!flagged.has(j.id)) continue
    const sold = j.lines.reduce((n, l) => n + l.soldCentiHours, 0)
    soldTotal += sold
    flaggedTotal += flagged.get(j.id) ?? 0
    if (sold !== (flagged.get(j.id) ?? 0)) flagDiff.push(`${j.repairOrder?.roNumber} job ${j.number}: sold ${sold} but flagged ${flagged.get(j.id)}`)
  }
  out.push(check('flagged_hours', 'Flagged hours', soldTotal, flaggedTotal, flagDiff))

  // Day close: a closed day's tender totals equal what succeeded that day.
  const closes = await tx.businessDayClose.findMany({ where: { shopId, status: 'closed' }, select: { businessDate: true, tenderTotals: true } })
  const dayDiff: string[] = []
  let closedSum = 0n, liveSum = 0n
  for (const c of closes) {
    const date = c.businessDate!.toISOString().slice(0, 10)
    const live = await dayTotals(tx, shopId, date)
    const stored = (c.tenderTotals ?? {}) as Record<string, string>
    const keys = new Set([...Object.keys(stored), ...Object.keys(live.totals)])
    for (const k of keys) {
      const a = BigInt(stored[k] ?? '0'), b = live.totals[k] ?? 0n
      closedSum += a; liveSum += b
      if (a !== b) dayDiff.push(`${date} ${k}: closed at ${a} but payments add to ${b}`)
    }
  }
  out.push(check('day_close', 'Day close tender totals', closedSum, liveSum, dayDiff))

  // Fees payable: fee lines on invoices equal the fee subtotals, by fee code.
  const feeLines = await tx.invoiceLine.findMany({ where: { invoice: { shopId, ...LIVE_INVOICE }, kind: 'fee' }, select: { extendedMinor: true } })
  out.push(check('fees_payable', 'Fees payable (tire and battery)', sumMinor(invoices.length ? (await tx.invoice.findMany({ where: { shopId, ...LIVE_INVOICE }, select: { feesSubtotalMinor: true } })).map(i => i.feesSubtotalMinor) : []), sumMinor(feeLines.map(l => l.extendedMinor))))

  // Sales tax: invoice tax less credit-memo tax equals the line-level figures.
  const taxInvoices = await tx.invoice.findMany({ where: { shopId, ...LIVE_INVOICE }, select: { taxMinor: true } })
  const taxLines = await tx.invoiceLine.findMany({ where: { invoice: { shopId, ...LIVE_INVOICE } }, select: { taxMinor: true } })
  const memoTax = await tx.creditMemo.findMany({ where: { shopId, status: 'issued' }, select: { taxMinor: true } })
  const memoLineTax = await tx.creditMemoLine.findMany({ where: { creditMemo: { shopId, status: 'issued' } }, select: { taxMinor: true } })
  out.push(check('sales_tax', 'Sales tax payable', sumMinor(taxInvoices.map(i => i.taxMinor)) - sumMinor(memoTax.map(m => m.taxMinor)), sumMinor(taxLines.map(l => l.taxMinor)) - sumMinor(memoLineTax.map(l => l.taxMinor))))
  return out
}
