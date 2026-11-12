import { q, holds, orgTimeZone } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat } from '../../components/ui';
import { CloseRecommendation, MarkContacted } from './Actions';

type Rec = { id: string; title: string; urgency: string; decision: string; priceMinor: string; contactedCount: number; customer: { id: string; displayName: string } | null; vehicle: { year: number | null; make: string; model: string } | null; shop: { name: string } | null; repairOrder: string; step: number; steps: number; dueOn: string; daysLate: number; state: string; lastContactedAt: string | null };
type Rem = { cycleKey: string; kind: string; jobTitle: string; servicedOn: string; dueDate: string; dueAtOdometer: number | null; daysLate: number; state: string; customer: { id: string; displayName: string }; vehicle: { year: number | null; make: string; model: string }; shop: { name: string }; repairOrder: string };

const car = (v: { year: number | null; make: string; model: string } | null) => (v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '');
const lateText = (n: number) => (n > 0 ? `${n} day${n === 1 ? '' : 's'} late` : n === 0 ? 'Due today' : `Due in ${-n} day${n === -1 ? '' : 's'}`);
const KIND: Record<string, string> = { oil: 'Oil change', rotation: 'Tire rotation', inspection: 'Inspection' };

/** Work customers put off and services coming due. Worked out when this page loads; pressing "Mark contacted" records it once. */
export default async function FollowUpsPage() {
  const can = await holds(['canMessageCustomers', 'canManageCustomers', 'canManageCampaigns', 'canReadRepairOrders']);
  if (!Object.values(can).some(Boolean)) return <Page title="Follow-ups"><Empty>Your role is not allowed to view follow-ups.</Empty></Page>;
  const mayAct = can.canMessageCustomers || can.canManageCustomers || can.canManageCampaigns;
  const { followUpBoard } = await q<{ followUpBoard: { recommendations: Rec[]; reminders: Rem[] } }>(`{ followUpBoard(soonDays: 7) }`);
  const tz = await orgTimeZone();
  const { recommendations, reminders } = followUpBoard;
  const dueNow = recommendations.filter(r => r.state === 'due').length + reminders.filter(r => r.state === 'due').length;
  return (
    <Page title="Follow-ups">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Due now" value={<span className="font-mono text-base">{dueNow}</span>} />
        <Stat name="Work put off" value={<span className="font-mono text-base">{recommendations.length}</span>} />
        <Stat name="Services coming due" value={<span className="font-mono text-base">{reminders.length}</span>} />
      </div>
      <Section title="Work customers put off">
        {recommendations.length ? recommendations.map(r => (
          <Row key={r.id}>
            <div className="min-w-0 space-y-1">
              <div className="break-words font-medium">{r.title} <Meta>{money(r.priceMinor)}</Meta></div>
              <Meta>{r.customer?.displayName} · {car(r.vehicle)} · repair order {r.repairOrder}</Meta>
              <Meta>{label(r.decision)} {when(r.dueOn, tz, 'day') ? '' : ''}· contact {r.step} of {r.steps}, {lateText(r.daysLate).toLowerCase()} ({when(r.dueOn, tz, 'day')}){r.lastContactedAt ? ` · last contacted ${when(r.lastContactedAt, tz, 'day')}` : ''}</Meta>
            </div>
            {mayAct ? <div className="flex flex-wrap items-center gap-2"><MarkContacted op="markFollowUpContacted" vars={{ recommendationId: r.id, expectedContactedCount: r.contactedCount }} /><CloseRecommendation recommendationId={r.id} /></div> : null}
          </Row>
        )) : <Empty>Nothing put off is due for a follow-up.</Empty>}
      </Section>
      <Section title="Services coming due">
        {reminders.length ? reminders.map(r => (
          <Row key={r.cycleKey}>
            <div className="min-w-0 space-y-1">
              <div className="break-words font-medium">{KIND[r.kind] ?? label(r.kind)} · {car(r.vehicle)}</div>
              <Meta>{r.customer.displayName} · last done {when(r.servicedOn, tz, 'day')}{r.dueAtOdometer ? ` · due at ${r.dueAtOdometer.toLocaleString('en-US')} miles` : ''}</Meta>
              <Meta>{lateText(r.daysLate)} ({when(r.dueDate, tz, 'day')})</Meta>
            </div>
            {mayAct ? <MarkContacted op="markServiceReminderContacted" vars={{ cycleKey: r.cycleKey }} /> : null}
          </Row>
        )) : <Empty>No services are due.</Empty>}
      </Section>
    </Page>
  );
}
