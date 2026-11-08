import { q } from '../../lib/server';
import { money, milli, label, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { Act, SupplierInvoiceForm } from './PartsActions';

type Inv = {
  id: string; invoiceNumber: string; invoiceDate: string | null; totalMinor: string; status: string; exportReference: string;
  shop: { id: string; name: string } | null; supplier: { name: string } | null;
  lines: { id: string; partNumber: string; quantityMilli: number; unitCostMinor: string; coreCreditMinor: string; matchStatus: string }[];
  discrepancies: { id: string; kind: string; amountMinor: string; detail: string; status: string }[];
};

/** Three-way match: what was ordered, what was received, what the supplier billed. Open discrepancies block approval. */
export default async function SupplierInvoicesPage() {
  const d = await q<{ supplierInvoices: Inv[]; suppliers: { id: string; name: string; adapter: string }[]; shops: { id: string }[] }>(`{
    supplierInvoices(orderBy: { createdAt: desc }, take: 100) { id invoiceNumber invoiceDate totalMinor status exportReference shop { id name } supplier { name }
      lines { id partNumber quantityMilli unitCostMinor coreCreditMinor matchStatus } discrepancies { id kind amountMinor detail status } }
    suppliers(where: { active: { equals: true } }, orderBy: { name: asc }) { id name adapter }
    shops(where: { status: { equals: "active" } }, take: 1) { id } }`);
  const open = (i: Inv) => i.discrepancies.filter(x => x.status === 'open');
  const stuck = d.supplierInvoices.filter(i => open(i).length);
  const shopId = d.shops[0]?.id;
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
              <div className="flex items-center gap-3"><span className="font-mono text-sm">{money(i.totalMinor)}</span><Status value={i.status} /></div>
            </div>
            <ul className="space-y-1">{i.lines.map(l => <li key={l.id} className="min-w-0 break-words text-xs text-muted-foreground"><span className="font-mono">{l.partNumber}</span> × {milli(l.quantityMilli)} at {money(l.unitCostMinor)}{BigInt(l.coreCreditMinor) > 0n ? ` · core credit ${money(l.coreCreditMinor)}` : ''} · {label(l.matchStatus)}</li>)}</ul>
            {open(i).map(x => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 p-2 text-sm">
                <div className="min-w-0 break-words"><span className="font-mono text-xs uppercase">{label(x.kind)}</span> {money(x.amountMinor)} <Meta>{x.detail}</Meta></div>
                <Act op="resolveSupplierDiscrepancy" ask="How was it settled with the supplier?" askKey="resolution" vars={{ discrepancyId: x.id, outcome: 'resolved' }}>Resolve</Act>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {['received', 'discrepancy'].includes(i.status) ? <Act op="matchShopSupplierInvoice" vars={{ invoiceId: i.id }}>Match to orders</Act> : null}
              {i.status === 'matched' ? <Act primaryStyle op="approveShopSupplierInvoice" vars={{ invoiceId: i.id }}>Approve</Act> : null}
              {i.status === 'approved' ? <Act primaryStyle op="exportShopSupplierInvoice" vars={{ invoiceId: i.id }}>Export for the books</Act> : null}
            </div>
          </div>
        )) : <Empty>No supplier invoices yet.</Empty>}
      </Section>
    </Page>
  );
}
