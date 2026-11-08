import { q } from '../../lib/server';
import { money, milli, when } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status, Stat } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { Act, PhoneOrderForm, ReceiveForm } from './PartsActions';

type Line = { id: string; partNumber: string; description: string; quantityMilli: number; receivedQuantityMilli: number; unitCostMinor: string };
type Order = { id: string; reference: string; status: string; kind: string; placedVia: string | null; supplierConfirmation: string; totalMinor: string; placedAt: string | null; supplier: { name: string; adapter: string } | null; lines: Line[]; version: number };

const OPEN = ['draft', 'placing', 'placed', 'confirmed', 'partially_received', 'unknown', 'failed'];

/** Supplier purchase orders. An order whose send timed out is Unknown: it is never sent again until a person settles it. */
export default async function OrdersPage() {
  const { supplierOrders } = await q<{ supplierOrders: Order[] }>(`{ supplierOrders(orderBy: { createdAt: desc }, take: 100) {
    id reference status kind placedVia supplierConfirmation totalMinor placedAt version supplier { name adapter } lines { id partNumber description quantityMilli receivedQuantityMilli unitCostMinor } } }`);
  const unknown = supplierOrders.filter(o => o.status === 'unknown');
  const open = supplierOrders.filter(o => OPEN.includes(o.status));
  const done = supplierOrders.filter(o => !OPEN.includes(o.status));
  const card = (o: Order) => (
    <div key={o.id} className="min-w-0 space-y-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 break-words text-sm"><span className="font-mono">{o.reference}</span> {o.supplier?.name} <Meta>{o.kind === 'stock' ? 'stock order' : 'for a job'}{o.placedAt ? ` · placed ${when(o.placedAt, undefined, 'day')}` : ''}{o.supplierConfirmation ? ` · ${o.supplierConfirmation}` : ''}</Meta></div>
        <div className="flex items-center gap-3"><span className="font-mono text-sm">{money(o.totalMinor)}</span><Status value={o.status} /></div>
      </div>
      <ul className="space-y-1">{o.lines.map(l => <li key={l.id} className="min-w-0 break-words text-xs text-muted-foreground"><span className="font-mono">{l.partNumber}</span> {l.description} · {milli(l.receivedQuantityMilli)} of {milli(l.quantityMilli)} in · {money(l.unitCostMinor)} each</li>)}</ul>
      {o.status === 'unknown' ? <p className="text-sm text-amber-700 dark:text-amber-400">The send timed out and we do not know if the supplier has it. Check with them, then settle it here. It will not be sent again.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {o.status === 'draft' && o.supplier?.adapter !== 'manual' ? <Act primaryStyle op="placeSupplierOrder" vars={{ orderId: o.id }}>Place the order</Act> : null}
        {o.status === 'draft' && o.supplier?.adapter === 'manual' ? <PhoneOrderForm orderId={o.id} /> : null}
        {o.status === 'unknown' ? <Act primaryStyle op="resolveUnknownSupplierOrder" ask="What did the supplier say?" askKey="note" vars={{ orderId: o.id }}>Settle: ask the supplier</Act> : null}
        {['placed', 'confirmed', 'partially_received'].includes(o.status) ? <ReceiveForm orderId={o.id} lines={o.lines.filter(l => l.quantityMilli > l.receivedQuantityMilli).map(l => ({ id: l.id, partNumber: l.partNumber, left: l.quantityMilli - l.receivedQuantityMilli }))} /> : null}
        {['draft', 'placed', 'confirmed', 'unknown', 'failed'].includes(o.status) ? <Act op="cancelShopSupplierOrder" ask="Why is it cancelled?" vars={{ orderId: o.id }} confirm="Cancel this order?">Cancel</Act> : null}
      </div>
    </div>
  );
  return (
    <Page title="Supplier orders">
      <PartsTabs active="orders" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Open" value={<span className="font-mono text-base">{open.length}</span>} />
        <Stat name="Unknown" value={<span className={`font-mono text-base ${unknown.length ? 'text-amber-600' : ''}`}>{unknown.length}</span>} />
        <Stat name="Closed" value={<span className="font-mono text-base">{done.length}</span>} />
      </div>
      <Section title="Open orders">{open.length ? open.map(card) : <Empty>No orders are open.</Empty>}</Section>
      {done.length ? <Section title="Received and closed">{done.slice(0, 20).map(o => (
        <Row key={o.id}><div className="min-w-0 break-words text-sm"><span className="font-mono">{o.reference}</span> {o.supplier?.name}</div><div className="flex items-center gap-3"><span className="font-mono text-sm">{money(o.totalMinor)}</span><Status value={o.status} /></div></Row>
      ))}</Section> : null}
      <Meta>Orders for a job are placed only after the customer has approved it.</Meta>
    </Page>
  );
}
