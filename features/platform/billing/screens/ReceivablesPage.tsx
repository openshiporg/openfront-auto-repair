import { q } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat, Status, Tabs } from '../../components/ui';

type Inv = { id: string; invoiceNumber: string; status: string; dueDate: string | null; totalMinor: string; balanceMinor: string; arStage: string; payerKind: string; customer: { displayName: string } | null; businessAccount: { name: string } | null; repairOrder: { id: string } | null }
const VIEWS: Record<string, string> = { open: 'Owing', overdue: 'Overdue' };
const day = (iso: string | null) => (iso ? when(`${iso.slice(0, 10)}T12:00:00Z`, 'UTC', 'day') : '');

/** Receivables: every invoice with a balance, with the overdue ones first. */
export default async function ReceivablesPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const view = (await searchParams)?.view === 'overdue' ? 'overdue' : 'open';
  const { invoices } = await q<{ invoices: Inv[] }>(`{ invoices(where: { balanceMinor: { gt: "0" } }, orderBy: { dueDate: asc }, take: 200) {
    id invoiceNumber status dueDate totalMinor balanceMinor arStage payerKind customer { displayName } businessAccount { name } repairOrder { id } } }`);
  const overdue = invoices.filter(i => i.arStage === 'overdue');
  const rows = view === 'overdue' ? overdue : invoices;
  const sum = (list: Inv[]) => list.reduce((s, i) => s + BigInt(i.balanceMinor), 0n).toString();
  return (
    <Page title="Receivables">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Owed" value={<span className="font-mono text-base">{money(sum(invoices))}</span>} />
        <Stat name="Overdue" value={<span className={`font-mono text-base ${overdue.length ? 'text-red-600' : ''}`}>{money(sum(overdue))}</span>} />
        <Stat name="Invoices open" value={<span className="font-mono text-base">{invoices.length}</span>} />
      </div>
      <Tabs active={view} items={[{ key: 'open', label: VIEWS.open, href: '/dashboard/platform/receivables', count: invoices.length }, { key: 'overdue', label: VIEWS.overdue, href: '/dashboard/platform/receivables?view=overdue', count: overdue.length }]} />
      <Section title={view === 'overdue' ? 'Past due' : 'Waiting to be paid'}>
        {rows.length ? rows.map(i => (
          <Row key={i.id} href={i.repairOrder ? `/dashboard/platform/repair-orders/${i.repairOrder.id}` : undefined}>
            <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{i.invoiceNumber}</span><span>{i.businessAccount?.name ?? i.customer?.displayName}</span></div><Meta>{i.dueDate ? `Due ${day(i.dueDate)}` : 'Due on receipt'}</Meta></div>
            <div className="flex items-center gap-4"><span className="font-mono text-sm">{money(i.balanceMinor)}</span><Status value={i.arStage === 'overdue' ? 'overdue' : i.status} /></div>
          </Row>
        )) : <Empty>{view === 'overdue' ? 'Nothing is overdue.' : 'Nothing is owed.'}</Empty>}
      </Section>
    </Page>
  );
}
