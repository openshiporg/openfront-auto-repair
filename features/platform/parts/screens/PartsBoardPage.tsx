import { q } from '../../lib/server';
import { money, milli, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { Act, OrderQuoteButton, PhoneQuoteForm, QuoteForm, TinForm } from './PartsActions';

type Line = { id: string; kind: string; partNumber: string; description: string; quantityMilli: number; isNewTire: boolean };
type Job = { id: string; number: number; title: string; repairOrder: { id: string; roNumber: string; shop: { id: string } } | null; lines: Line[]; currentAuthorization: { id: string } | null };
type Tire = { id: string; position: string; tin: string; job: { id: string } | null };
type Quote = { id: string; job: { id: string } | null; partNumber: string; status: string; unitCostMinor: string; coreChargeMinor: string; availability: string; source: string; version: number; supplier: { id: string; name: string } | null };
type OrderLine = { id: string; job: { id: string } | null; partNumber: string; quantityMilli: number; receivedQuantityMilli: number; order: { reference: string; status: string } | null };
type Supplier = { id: string; name: string; adapter: string };
type Item = { id: string; partNumber: string; sku: string; stock: { onHandMilli: number; committedMilli: number } | null };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** What every authorized job still needs: quote, order, receive, issue. Nothing is ordered for a job the customer has not approved. */
export default async function PartsBoardPage() {
  const d = await q<{ jobs: Job[]; partQuotes: Quote[]; supplierOrderLines: OrderLine[]; jobTires: Tire[]; suppliers: Supplier[]; shopItems: Item[] }>(`{
    jobs(where: { currentAuthorization: { id: { not: null } } }, orderBy: { updatedAt: desc }, take: 60) {
      id number title repairOrder { id roNumber shop { id } } lines { id kind partNumber description quantityMilli isNewTire } currentAuthorization { id } }
    jobTires(take: 400) { id position tin job { id } }
    partQuotes(where: { status: { in: ["offered", "selected"] } }, orderBy: { createdAt: desc }, take: 300) { id job { id } partNumber status unitCostMinor coreChargeMinor availability source version supplier { id name } }
    supplierOrderLines(where: { job: { id: { not: null } } }, take: 300) { id job { id } partNumber quantityMilli receivedQuantityMilli order { reference status } }
    suppliers(where: { active: { equals: true } }, orderBy: { name: asc }) { id name adapter }
    shopItems(where: { active: { equals: true } }, take: 300) { id partNumber sku stock { onHandMilli committedMilli } } }`);
  const jobs = d.jobs.filter(j => j.lines.some(l => l.kind === 'part' || l.kind === 'tire'));
  return (
    <Page title="Parts">
      <PartsTabs active="parts" />
      <Section title="Authorized jobs that need parts">
        {jobs.length ? jobs.map(job => (
          <div key={job.id} className="min-w-0 space-y-3 border-b py-4 last:border-b-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0 break-words text-sm font-medium">{job.repairOrder?.roNumber} · Job {job.number} · {job.title}</div>
              {job.repairOrder ? <a className="text-xs underline max-md:inline-flex max-md:min-h-11 max-md:items-center" href={`/dashboard/platform/repair-orders/${job.repairOrder.id}`}>Open the repair order</a> : null}
            </div>
            {job.lines.filter(l => l.kind === 'part' || l.kind === 'tire').map(line => {
              const quotes = d.partQuotes.filter(x => x.job?.id === job.id && norm(x.partNumber) === norm(line.partNumber));
              const orders = d.supplierOrderLines.filter(x => x.job?.id === job.id && norm(x.partNumber) === norm(line.partNumber));
              const shelf = d.shopItems.find(i => norm(i.partNumber) === norm(line.partNumber));
              const free = shelf?.stock ? shelf.stock.onHandMilli - shelf.stock.committedMilli : 0;
              const shopId = job.repairOrder?.shop.id ?? '';
              return (
                <div key={line.id} className="min-w-0 space-y-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 break-words text-sm"><span className="font-mono">{line.partNumber || 'no part number'}</span> {line.description} <Meta>× {milli(line.quantityMilli)}</Meta></div>
                    {orders.length ? <Meta>{orders.map(o => `${o.order?.reference} ${label(o.order?.status)}, ${milli(o.receivedQuantityMilli)} of ${milli(o.quantityMilli)} in`).join('; ')}</Meta> : null}
                  </div>
                  {shelf ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Meta>On the shelf: {milli(shelf.stock?.onHandMilli ?? 0)}, free {milli(free)}</Meta>
                      {free >= line.quantityMilli ? <Act op="reserveJobPart" vars={{ jobId: job.id, shopItemId: shelf.id, quantityMilli: line.quantityMilli }}>Reserve from stock</Act> : null}
                      {(shelf.stock?.committedMilli ?? 0) > 0 ? <Act primaryStyle op="issueJobPart" vars={{ jobId: job.id, shopItemId: shelf.id, quantityMilli: line.quantityMilli }}>Issue to the job</Act> : null}
                    </div>
                  ) : null}
                  {quotes.length ? quotes.map(x => (
                    <Row key={x.id}>
                      <div className="min-w-0"><span className="text-sm">{x.supplier?.name}</span> <Meta>{label(x.availability)} · {x.source}{BigInt(x.coreChargeMinor) > 0n ? ` · core ${money(x.coreChargeMinor)}` : ''}</Meta></div>
                      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{money(x.unitCostMinor)}</span><Status value={x.status} />
                        {x.status === 'offered' ? <Act op="selectSupplierQuote" vars={{ quoteId: x.id, expectedVersion: x.version }}>Pick</Act> : null}
                        {x.status === 'selected' && x.supplier ? <OrderQuoteButton shopId={shopId} supplierId={x.supplier.id} quoteId={x.id} jobId={job.id} quantityMilli={line.quantityMilli} /> : null}
                      </div>
                    </Row>
                  )) : null}
                  {line.partNumber ? <QuoteForm shopId={shopId} jobId={job.id} partNumber={line.partNumber} quantityMilli={line.quantityMilli} suppliers={d.suppliers} /> : null}
                  {line.partNumber ? <PhoneQuoteForm shopId={shopId} jobId={job.id} partNumber={line.partNumber} suppliers={d.suppliers} /> : null}
                  {line.isNewTire ? <div className="space-y-2 border-t pt-2"><Meta>DOT numbers recorded: {d.jobTires.filter(t => t.job?.id === job.id).map(t => `${t.position} ${t.tin}`).join(', ') || 'none yet'}</Meta><TinForm jobId={job.id} /></div> : null}
                </div>
              );
            })}
          </div>
        )) : <Empty>No authorized job needs a part right now.</Empty>}
      </Section>
    </Page>
  );
}
