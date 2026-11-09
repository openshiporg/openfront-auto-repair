import { q } from '../../lib/server';
import { money, milli, label, minorOrNull, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { Act, SupplierInvoiceForm } from './PartsActions';

type Inv = {
  id: string; invoiceNumber: string; invoiceDate: string | null; totalMinor: string | null; status: string; exportReference: string; reversalReason: string; version: number;
  shop: { id: string; name: string } | null; supplier: { name: string } | null;
  lines: { id: string; partNumber: string; quantityMilli: number; unitCostMinor: string | null; coreCreditMinor: string | null; matchStatus: string }[];
  discrepancies: { id: string; kind: string; amountMinor: string | null; detail: string; status: string }[];
};

/** Three-way match: what was ordered, what was received, what the supplier billed. Open discrepancies block approval. */
export default async function SupplierInvoicesPage() {
  const d = await q<{ supplierInvoices: Inv[]; suppliers: { id: string; name: string; adapter: string }[]; shops: { id: string }[] }>(`{
    supplierInvoices(orderBy: { createdAt: desc }, take: 100) { id invoiceNumber invoiceDate totalMinor status exportReference reversalReason version shop { id name } supplier { name }
      lines { id partNumber quantityMilli unitCostMinor coreCreditMinor matchStatus } discrepancies { id kind amountMinor detail status } }
    suppliers(where: { active: { equals: true } }, orderBy: { name: asc }) { id name adapter }
    shops(where: { status: { equals: "active" } }, take: 1) { id } }`);
  const open = (i: Inv) => i.discrepancies.filter(x => x.status === 'open');
  const stuck = d.supplierInvoices.filter(i => open(i).length);
  const shopId = d.shops[0]?.id;
  // Each line rounded to the cent, less its core credit; null when the reader cannot see cost (review r3 N1, N2).
  const linesTotal = (i: Inv) => {
    let t = 0n;
    for (const l of i.lines) {
      const unit = minorOrNull(l.unitCostMinor); const core = minorOrNull(l.coreCreditMinor);
      if (unit === null || core === null) return null;
      t += (BigInt(l.quantityMilli) * unit + 500n) / 1000n - core;
    }
    return t;
  };
  const mismatch = (i: Inv) => { const h = minorOrNull(i.totalMinor); const s = linesTotal(i); return h !== null && s !== null && (h > s ? h - s : s - h) > 1n; };
  return (
    <Page title="Supplier invoices">
      <PartsTabs active="invoices" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Invoices" value={<span className="font-mono text-base">{d.supplierInvoices.length}</span>} />
        <Stat name="With discrepancies" value={<span className={`font-mono text-base ${stuck.length ? 'text-amber-600' : ''}`}>{stuck.length}</span>} />
        <Stat name="Ready to approve" value={<span className="font-mono text-base">{d.supplierInvoices.filter(i => i.status === 'matched').length}</span>} />
      </div>
      {shopId ? <SupplierInvoiceForm shopId={shopId} suppliers={d.suppliers} /> : null}
      <Section title="Invoices">
        {d.supplierInvoices.length ? d.supplierInvoices.map(i => (
          <div key={i.id} className="min-w-0 space-y-2 border-b py-3 last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 break-words text-sm"><span className="font-mono">{i.invoiceNumber}</span> {i.supplier?.name} <Meta>{i.shop?.name}{i.invoiceDate ? ` · ${when(i.invoiceDate, 'UTC', 'day')}` : ''}{i.exportReference ? ` · ${i.exportReference}` : ''}</Meta></div>
              <div className="flex items-center gap-3">{i.totalMinor !== null ? <span className="font-mono text-sm">{money(i.totalMinor)}</span> : null}<Status value={i.status} /></div>
            </div>
            <ul className="space-y-1">{i.lines.map(l => <li key={l.id} className="min-w-0 break-words text-xs text-muted-foreground"><span className="font-mono">{l.partNumber}</span> × {milli(l.quantityMilli)}{l.unitCostMinor !== null ? ` at ${money(l.unitCostMinor)}` : ''}{(minorOrNull(l.coreCreditMinor) ?? 0n) > 0n ? ` · core credit ${money(l.coreCreditMinor)}` : ''} · {label(l.matchStatus)}</li>)}</ul>
            {mismatch(i) && i.status !== 'reversed' ? <p role="alert" className="text-sm text-red-600">The total is {money(i.totalMinor)} but the lines add up to {money(linesTotal(i))}. Do not pay it: reverse it and enter it again as billed.</p> : null}
            {i.status === 'reversed' && i.reversalReason ? <Meta>Reversed: {i.reversalReason}</Meta> : null}
            {open(i).map(x => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 p-2 text-sm">
                <div className="min-w-0 break-words"><span className="font-mono text-xs uppercase">{label(x.kind)}</span> {x.amountMinor !== null ? money(x.amountMinor) : null} <Meta>{x.detail}</Meta></div>
                {x.kind !== 'total_mismatch' ? <Act op="resolveSupplierDiscrepancy" ask="How was it settled with the supplier?" askKey="resolution" vars={{ discrepancyId: x.id, outcome: 'resolved' }}>Resolve</Act> : null}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {['received', 'discrepancy'].includes(i.status) ? <Act op="matchShopSupplierInvoice" vars={{ invoiceId: i.id }}>Match to orders</Act> : null}
              {i.status === 'matched' ? <Act primaryStyle op="approveShopSupplierInvoice" vars={{ invoiceId: i.id }}>Approve</Act> : null}
              {i.status === 'approved' && !mismatch(i) ? <Act primaryStyle op="exportShopSupplierInvoice" vars={{ invoiceId: i.id }}>Export for the books</Act> : null}
              {['received', 'matching', 'matched', 'discrepancy', 'approved'].includes(i.status) ? <Act op="reverseShopSupplierInvoice" ask="Why is this invoice being reversed?" vars={{ invoiceId: i.id, expectedVersion: i.version }} confirm="Reverse this invoice? It stays on file, and you can enter it again as billed.">Reverse</Act> : null}
            </div>
          </div>
        )) : <Empty>No supplier invoices yet.</Empty>}
      </Section>
    </Page>
  );
}
