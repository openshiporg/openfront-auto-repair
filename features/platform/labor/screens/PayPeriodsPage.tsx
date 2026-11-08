import { orgTimeZone, q } from '../../lib/server';
import { zonedDate } from '@/lib/zonedTime';
import { hours, label, money, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { LaborTabs, ShopSwitch, pickShop } from './LaborTabs';
import { Act, ExportButton } from './LaborActions';

type Shop = { id: string; code: string; name: string; timeZone?: string };
type Period = { id: string; startsOn: string; endsOn: string; status: string; closedAt: string | null; exportedAt: string | null; closedBy: { name: string } | null; approvedBy: { name: string } | null };
type Tech = { id: string; displayName: string; payPlan: string; flatRateMinor: string | null; hourlyRateMinor: string | null };
type Entry = { id: string; technician: { id: string } | null; centiHours: number; kind: string; reason: string | null; flaggedAt: string; job: { number: number; title: string; repairOrder: { roNumber: string } | null } | null };

const day = (iso: string) => when(iso, 'UTC', 'day');
const PLAN: Record<string, string> = { flat_rate: 'Flat rate', hourly: 'Hourly', salary_plus_bonus: 'Salary plus bonus' };
const KIND: Record<string, string> = { flag: 'Flagged', reversal: 'Taken back', adjustment: 'Adjusted' };

/** Flagged hours by technician for each two-week period, the close that a second person approves, and the pay file. */
export default async function PayPeriodsPage({ searchParams }: { searchParams?: Promise<{ shop?: string; period?: string }> }) {
  const params = await searchParams;
  const base = await q<{ shops: Shop[] }>(`{ shops(where: { status: { equals: "active" } }, orderBy: { code: asc }) { id code name timeZone } }`);
  const shop = pickShop(base.shops, params?.shop);
  if (!shop) return <Page title="Pay periods"><LaborTabs active="pay" /><Empty>No shop is set up yet.</Empty></Page>;
  const tz = await orgTimeZone();
  const list = await q<{ payPeriods: Period[] }>(`{ payPeriods(where: { shop: { id: { equals: "${shop.id}" } } }, orderBy: { startsOn: desc }, take: 12) { id startsOn endsOn status closedAt exportedAt closedBy { name } approvedBy { name } } }`);
  const period = list.payPeriods.find(p => p.id === params?.period) ?? list.payPeriods.find(p => p.status === 'open') ?? list.payPeriods[0];
  const d = period ? await q<{ technicianProfiles: Tech[]; flaggedHoursEntries: Entry[] }>(`{
    technicianProfiles(where: { shop: { id: { equals: "${shop.id}" } } }, orderBy: { displayName: asc }) { id displayName payPlan flatRateMinor hourlyRateMinor }
    flaggedHoursEntries(where: { payPeriod: { id: { equals: "${period.id}" } } }, orderBy: { flaggedAt: asc }, take: 500) { id technician { id } centiHours kind reason flaggedAt job { number title repairOrder { roNumber } } }
  }`) : { technicianProfiles: [], flaggedHoursEntries: [] };
  const rows = d.technicianProfiles.map(t => {
    const mine = d.flaggedHoursEntries.filter(e => e.technician?.id === t.id);
    const centi = mine.reduce((n, e) => n + e.centiHours, 0);
    const rate = t.payPlan === 'hourly' ? null : t.flatRateMinor;
    const gross = rate ? (BigInt(centi) * BigInt(rate)) / 100n : null;
    return { t, mine, centi, gross };
  }).filter(r => r.mine.length);
  // A period has ended once its last day is over in the shop's own zone, not at UTC midnight.
  const ended = period ? period.endsOn.slice(0, 10) < zonedDate(shop.timeZone || tz, new Date()) : false;
  const link = (p: Period) => `/dashboard/platform/pay-periods?shop=${shop.code}&period=${p.id}`;
  return (
    <Page title="Pay periods">
      <LaborTabs active="pay" />
      <ShopSwitch shops={base.shops} current={shop} path="/dashboard/platform/pay-periods" />
      {period ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat name="Period" value={<span className="text-base">{day(period.startsOn)} to {day(period.endsOn)}</span>} />
            <Stat name="Flagged hours" value={<span className="font-mono text-base">{hours(d.flaggedHoursEntries.reduce((n, e) => n + e.centiHours, 0))}</span>} />
            <Stat name="Status" value={<Status value={period.status} />} />
          </div>
          <Section title="Hours by technician" aside={
            <span className="flex flex-wrap gap-2">
              {period.status === 'open' ? <Act primaryStyle op="closeShopPayPeriod" vars={{ payPeriodId: period.id }}>Close this period</Act> : <ExportButton payPeriodId={period.id} />}
            </span>
          }>
            {rows.length ? rows.map(({ t, mine, centi, gross }) => (
              <div key={t.id} className="space-y-1 border-b py-3 text-sm last:border-b-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{t.displayName} <Meta>{PLAN[t.payPlan] ?? label(t.payPlan)}</Meta></span>
                  <span className="flex flex-wrap items-center gap-3"><span className="font-mono">{hours(centi)}</span>{gross !== null ? <span className="font-mono">{money(gross.toString())}</span> : <Meta>paid on clock hours</Meta>}</span>
                </div>
                {mine.map(e => (
                  <div key={e.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 pl-3 text-xs text-muted-foreground">
                    <span className="min-w-0 break-words">{KIND[e.kind] ?? label(e.kind)}: {e.job?.repairOrder?.roNumber} job {e.job?.number}, {e.job?.title}{e.reason && e.kind !== 'flag' ? `. ${e.reason}` : ''}</span>
                    <span className="font-mono">{e.centiHours > 0 ? '+' : ''}{hours(e.centiHours)}</span>
                  </div>
                ))}
              </div>
            )) : <Empty>No hours have been flagged in this period.</Empty>}
          </Section>
          {period.status !== 'open' ? <Meta>Closed {when(period.closedAt, tz, 'day')} by {period.closedBy?.name ?? 'a manager'}, approved by {period.approvedBy?.name ?? 'a second person'}. A closed period takes no more hours; later corrections land in the open one.</Meta> : ended ? <Meta>This period has ended. Closing it needs a second person to approve.</Meta> : <Meta>A period can be closed once its last day has passed.</Meta>}
        </>
      ) : <Empty>No pay periods yet. The first opens when a job is completed.</Empty>}
      <Section title="Periods">
        {list.payPeriods.map(p => (
          <a key={p.id} href={link(p)} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-b-0 hover:bg-muted/40">
            <span>{day(p.startsOn)} to {day(p.endsOn)}</span><Status value={p.status} />
          </a>
        ))}
      </Section>
    </Page>
  );
}
