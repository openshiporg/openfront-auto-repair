import { q } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Row, Empty, Meta, Section, Status } from '../../components/ui';
import { CreditMemoForm, FinalizeForm, PayLinkButton, PaymentForm, RefundForm, ReleaseForm } from './BillingForms';
import { Refresher } from './Refresher';

type Totals = Record<string, string>;
type Preview = { problems: string[]; invoices: { payerKind: string; payerName: string; lines: number; totals: Totals }[] };
type Inv = {
  id: string; invoiceNumber: string; status: string; payerKind: string; invoiceDate: string | null; dueDate: string | null; totalMinor: string; paidMinor: string; creditedMinor: string; balanceMinor: string; arStage: string
  businessAccount: { name: string } | null; lines: { id: string; description: string; extendedMinor: string; kind: string }[]
  creditMemos: { id: string; reference: string; totalMinor: string; reason: string }[]
};
type Pay = {
  id: string; purpose: string; tender: string; amountMinor: string; refundedMinor: string; allocatedMinor: string; status: string; createdAt: string; payerName: string; checkNumber: string; cardBrand: string; cardLast4: string; failureMessage: string
  refunds: { id: string; amountMinor: string; status: string; reason: string }[]
};

const TENDER: Record<string, string> = { cash: 'Cash', check: 'Check', card_present: 'Card on the terminal', card_link: 'Card by link', tap_to_pay: 'Tap to pay', ach: 'Bank transfer', financing: 'Financing', store_credit: 'Store credit', gift_card: 'Gift card', account_credit: 'Account credit' };
const KIND: Record<string, string> = { customer: 'Customer', business_account: 'Business account', service_contract: 'Service contract', insurer: 'Insurer', manufacturer: 'Manufacturer' };
const SETTLED = ['succeeded', 'partially_refunded'];
const WAITING = ['initiated', 'pending', 'unknown'];

/** Invoice, payments, deposits and release for one repair order. Reads through the session, so shop scoping applies. */
export async function BillingSection({ ro, zone, odometerHint, cardReady }: {
  ro: { id: string; status: string; version: number; customer: { displayName: string } | null; businessAccount?: { poRequired: boolean } | null }; zone: string; odometerHint: number | null; cardReady: boolean;
}) {
  const invoiced = ['invoiced', 'closed'].includes(ro.status);
  const ready = ['in_service', 'ready_to_invoice'].includes(ro.status);
  const data = await q<{ invoices: Inv[]; payments: Pay[] }>(`query($ro: ID!) {
    invoices(where: { repairOrder: { id: { equals: $ro } } }, orderBy: { invoiceNumber: asc }) {
      id invoiceNumber status payerKind invoiceDate dueDate totalMinor paidMinor creditedMinor balanceMinor arStage businessAccount { name }
      lines(orderBy: { sortOrder: asc }) { id description extendedMinor kind } creditMemos { id reference totalMinor reason } }
    payments(where: { repairOrder: { id: { equals: $ro } } }, orderBy: { createdAt: asc }) {
      id purpose tender amountMinor refundedMinor allocatedMinor status createdAt payerName checkNumber cardBrand cardLast4 failureMessage refunds { id amountMinor status reason } }
  }`, { ro: ro.id }).catch(() => ({ invoices: [] as Inv[], payments: [] as Pay[] }));

  // A card page that was opened and not yet settled: ask the processor, which settles it exactly once.
  let payments = data.payments;
  const waiting = payments.filter(p => WAITING.includes(p.status));
  if (waiting.length) {
    await Promise.all(waiting.map(p => q(`mutation($id: ID!) { checkShopPayment(paymentId: $id) }`, { id: p.id }).catch(() => null)));
    payments = (await q<{ payments: Pay[] }>(`query($ro: ID!) { payments(where: { repairOrder: { id: { equals: $ro } } }, orderBy: { createdAt: asc }) {
      id purpose tender amountMinor refundedMinor allocatedMinor status createdAt payerName checkNumber cardBrand cardLast4 failureMessage refunds { id amountMinor status reason } } }`, { ro: ro.id }).catch(() => ({ payments }))).payments;
  }
  const stillWaiting = payments.some(p => WAITING.includes(p.status));
  const preview = ready ? await q<{ previewShopInvoice: Preview }>(`query($ro: ID!) { previewShopInvoice(repairOrderId: $ro) }`, { ro: ro.id }).then(d => d.previewShopInvoice).catch(() => null) : null;
  const owing = data.invoices.filter(i => BigInt(i.balanceMinor) > 0n);
  const deposits = payments.filter(p => p.purpose === 'deposit' && SETTLED.includes(p.status));
  const unspent = deposits.reduce((s, p) => s + BigInt(p.amountMinor) - BigInt(p.refundedMinor) - BigInt(p.allocatedMinor), 0n);

  if (!invoiced && !ready && !payments.length) return null;
  return (
    <Section title="Invoice and payments">
      {stillWaiting ? <Refresher /> : null}

      {ready && preview ? (
        <div className="space-y-3 rounded-lg border p-4">
          {preview.problems.length ? (
            <div role="note" className="space-y-1 rounded-md border border-amber-500/60 bg-amber-500/5 p-3 text-sm">{preview.problems.map(p => <div key={p}>{p}</div>)}</div>
          ) : (
            <>
              {preview.invoices.map((i, n) => (
                <Row key={n}>
                  <div className="min-w-0 space-y-1"><div className="font-medium">{i.payerName || KIND[i.payerKind] || label(i.payerKind)}</div><Meta>{i.lines} lines · tax {money(i.totals.taxMinor)}{unspent > 0n && n === 0 ? ` · ${money(unspent.toString())} deposit applies` : ''}</Meta></div>
                  <span className="font-mono text-sm">{money(i.totals.totalMinor)}</span>
                </Row>
              ))}
              <FinalizeForm repairOrderId={ro.id} version={ro.version} odometerHint={odometerHint} poRequired={!!ro.businessAccount?.poRequired} />
            </>
          )}
        </div>
      ) : null}

      {data.invoices.map(inv => (
        <div key={inv.id} className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{inv.invoiceNumber}</span><span className="font-medium">{inv.businessAccount?.name ?? KIND[inv.payerKind] ?? label(inv.payerKind)}</span></div>
              <Meta>{inv.invoiceDate ? `Invoiced ${when(`${inv.invoiceDate}T12:00:00Z`, 'UTC', 'day')}` : ''}{inv.dueDate ? ` · due ${when(`${inv.dueDate}T12:00:00Z`, 'UTC', 'day')}` : ''}</Meta>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-mono text-sm">{money(inv.totalMinor)}</span>
              <Status value={inv.arStage === 'overdue' ? 'overdue' : inv.status} />
              <a className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/api/invoices/${inv.id}/pdf`}>Invoice PDF</a>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
            <span>PAID {money(inv.paidMinor)}</span>{BigInt(inv.creditedMinor) > 0n ? <span>CREDITED {money(inv.creditedMinor)}</span> : null}<span className="text-foreground">BALANCE {money(inv.balanceMinor)}</span>
          </div>
          {inv.creditMemos.map(m => <Meta key={m.id}>{m.reference} · {money(m.totalMinor)} off · {m.reason}</Meta>)}
          <div className="flex flex-wrap items-start gap-2">
            {BigInt(inv.balanceMinor) > 0n ? <PaymentForm purpose="invoice" invoiceIds={[inv.id]} balanceMinor={inv.balanceMinor} cardReady={cardReady} defaultPayer={ro.customer?.displayName ?? ''} /> : null}
            {BigInt(inv.balanceMinor) > 0n ? <PayLinkButton invoiceId={inv.id} /> : null}
            {BigInt(inv.balanceMinor) > 0n ? <CreditMemoForm invoiceId={inv.id} lines={inv.lines.filter(l => l.kind !== 'discount')} /> : null}
          </div>
        </div>
      ))}

      {ro.status === 'invoiced' && owing.length ? (
        <div className="flex flex-wrap items-start gap-3">
          <ReleaseForm repairOrderId={ro.id} />
          <Meta>The order closes by itself once everything is paid.</Meta>
        </div>
      ) : null}

      {!invoiced ? (
        <div className="flex flex-wrap items-start gap-3">
          <PaymentForm purpose="deposit" repairOrderId={ro.id} cardReady={cardReady} defaultPayer={ro.customer?.displayName ?? ''} />
          {unspent > 0n ? <Meta>{money(unspent.toString())} held as a deposit; it applies to the invoice when it is finalized.</Meta> : null}
        </div>
      ) : null}

      {payments.length ? payments.map(p => (
        <div key={p.id} className="space-y-2 border-b py-3 text-sm last:border-b-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="min-w-0 space-y-1">
              <div>{p.purpose === 'deposit' ? 'Deposit' : 'Payment'} · {TENDER[p.tender] ?? label(p.tender)}{p.cardLast4 ? ` ${p.cardBrand} ${p.cardLast4}` : ''}{p.checkNumber ? ` #${p.checkNumber}` : ''}</div>
              <Meta>{when(p.createdAt, zone)}{p.payerName ? ` · ${p.payerName}` : ''}{p.failureMessage ? ` · ${p.failureMessage}` : ''}{BigInt(p.refundedMinor) > 0n ? ` · ${money(p.refundedMinor)} refunded` : ''}</Meta>
            </div>
            <div className="flex items-center gap-4"><span className="font-mono">{money(p.amountMinor)}</span><Status value={p.status} /></div>
          </div>
          {SETTLED.includes(p.status) && BigInt(p.amountMinor) - BigInt(p.refundedMinor) > 0n ? <RefundForm paymentId={p.id} maxMinor={(BigInt(p.amountMinor) - BigInt(p.refundedMinor)).toString()} /> : null}
          {p.refunds.filter(r => r.status !== 'succeeded').map(r => <Meta key={r.id}>Refund {money(r.amountMinor)} · {label(r.status)} · {r.reason}</Meta>)}
        </div>
      )) : invoiced ? <Empty>No payments yet.</Empty> : null}
    </Section>
  );
}
