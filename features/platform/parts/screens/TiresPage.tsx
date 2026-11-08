import { q } from '../../lib/server';
import { when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { PartsTabs } from './PartsTabs';
import { TireCompleteForm, Act } from './PartsActions';

type Ob = { id: string; tireDescription: string; tins: string[] | null; dueAt: string | null; status: string; method: string | null; purchaserName: string; invoice: { id: string; invoiceNumber: string; repairOrder: { id: string } | null } | null };

/** New-tire sales owe a registration within 30 days. A late one turns Overdue by itself. */
export default async function TiresPage() {
  const { tireRegistrationObligations } = await q<{ tireRegistrationObligations: Ob[] }>(`{ tireRegistrationObligations(orderBy: { dueAt: asc }, take: 200) {
    id tireDescription tins dueAt status method purchaserName invoice { id invoiceNumber repairOrder { id } } } }`);
  const all = tireRegistrationObligations;
  const active = all.filter(o => ['open', 'overdue'].includes(o.status));
  const waiting = all.filter(o => ['handed_over', 'submitted'].includes(o.status));
  const closed = all.filter(o => ['confirmed', 'waived'].includes(o.status));
  const row = (o: Ob) => (
    <div key={o.id} className="min-w-0 space-y-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 break-words text-sm">{o.tireDescription} <Meta>{o.purchaserName} · {o.invoice?.invoiceNumber}{o.dueAt ? ` · due ${when(o.dueAt, undefined, 'day')}` : ''}</Meta></div>
        <Status value={o.status} />
      </div>
      <Meta>DOT numbers: {(o.tins ?? []).join(', ') || 'none recorded'}</Meta>
      <div className="flex flex-wrap gap-2">
        {['open', 'overdue'].includes(o.status) ? <TireCompleteForm obligationId={o.id} /> : null}
        {['handed_over', 'submitted'].includes(o.status) ? <Act primaryStyle op="confirmShopTireRegistration" vars={{ obligationId: o.id }}>Confirm it was registered</Act> : null}
      </div>
    </div>
  );
  return (
    <Page title="Tire registrations">
      <PartsTabs active="tires" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="To register" value={<span className="font-mono text-base">{active.length}</span>} />
        <Stat name="Overdue" value={<span className={`font-mono text-base ${all.some(o => o.status === 'overdue') ? 'text-red-600' : ''}`}>{all.filter(o => o.status === 'overdue').length}</span>} />
        <Stat name="Waiting for confirmation" value={<span className="font-mono text-base">{waiting.length}</span>} />
      </div>
      <Section title="To register">{active.length ? active.map(row) : <Empty>No tire registrations are waiting.</Empty>}</Section>
      {waiting.length ? <Section title="Sent, waiting to be confirmed">{waiting.map(row)}</Section> : null}
      {closed.length ? <Section title="Done">{closed.slice(0, 20).map(row)}</Section> : null}
    </Page>
  );
}
