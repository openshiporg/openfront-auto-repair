import { q } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { Act } from './PartsActions';

type Core = { id: string; partNumber: string; coreChargeMinor: string; status: string; dueAt: string | null; returnedAt: string | null; owedTo: string; supplier: { name: string } | null; job: { number: number; repairOrder: { roNumber: string } | null } | null };

/** Cores owed back to suppliers, with the day each return window closes. A returned core with no credit becomes a discrepancy at invoice match. */
export default async function CoresPage() {
  const { coreObligations } = await q<{ coreObligations: Core[] }>(`{ coreObligations(orderBy: { dueAt: asc }, take: 200) {
    id partNumber coreChargeMinor status dueAt returnedAt owedTo supplier { name } job { number repairOrder { roNumber } } } }`);
  const owed = coreObligations.filter(c => c.status === 'owed');
  const now = Date.now();
  const late = owed.filter(c => c.dueAt && new Date(c.dueAt).getTime() < now);
  const waiting = coreObligations.filter(c => c.status === 'returned');
  const closed = coreObligations.filter(c => ['credited', 'written_off'].includes(c.status));
  const sum = (l: Core[]) => l.reduce((s, c) => s + BigInt(c.coreChargeMinor), 0n).toString();
  const row = (c: Core) => (
    <div key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3 text-sm last:border-b-0">
      <div className="min-w-0 break-words"><span className="font-mono">{c.partNumber}</span> {c.supplier?.name} <Meta>{c.job ? `${c.job.repairOrder?.roNumber ?? ''} job ${c.job.number}` : 'from stock'}{c.dueAt ? ` · due ${when(c.dueAt, undefined, 'day')}` : ''}</Meta></div>
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono">{money(c.coreChargeMinor)}</span><Status value={c.dueAt && c.status === 'owed' && new Date(c.dueAt).getTime() < now ? 'overdue' : c.status} />
        {c.status === 'owed' ? <Act primaryStyle op="markShopCoreReturned" vars={{ coreId: c.id }}>Mark returned</Act> : null}
        {c.status === 'owed' ? <Act op="writeOffShopCore" ask="Why is the core being written off?" vars={{ coreId: c.id }}>Write off</Act> : null}
      </div>
    </div>
  );
  return (
    <Page title="Cores">
      <PartsTabs active="cores" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Owed back" value={<span className="font-mono text-base">{money(sum(owed))}</span>} />
        <Stat name="Past the window" value={<span className={`font-mono text-base ${late.length ? 'text-red-600' : ''}`}>{late.length}</span>} />
        <Stat name="Returned, awaiting credit" value={<span className="font-mono text-base">{waiting.length}</span>} />
      </div>
      <Section title="Owed back to suppliers">{owed.length ? owed.map(row) : <Empty>No cores are owed.</Empty>}</Section>
      {waiting.length ? <Section title="Returned, waiting for the credit">{waiting.map(row)}</Section> : null}
      {closed.length ? <Section title="Closed">{closed.slice(0, 20).map(row)}</Section> : null}
    </Page>
  );
}
