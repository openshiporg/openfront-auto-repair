import { orgTimeZone, q } from '../../lib/server';
import { hours, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { LaborTabs, ShopSwitch, pickShop } from './LaborTabs';
import { Act, CorrectionForm } from './LaborActions';

type Shop = { id: string; code: string; name: string };
type Shift = { id: string; clockInAt: string; clockOutAt: string | null; status: string; technician: { id: string; displayName: string; user: { id: string } | null } | null; breaks: { start: string; end?: string | null }[] | null };
type JobClock = { id: string; startedAt: string; stoppedAt: string | null; status: string; workedCentiHours: number | null; technician: { id: string; displayName: string; user: { id: string } | null } | null; job: { number: number; title: string; repairOrder: { roNumber: string } | null } | null };
type Correction = { id: string; targetId: string; before: any; after: any; reason: string; status: string; createdAt: string; technician: { displayName: string } | null; requestedBy: { name: string } | null };
type RunningJob = { id: string; number: number; title: string; repairOrder: { roNumber: string; vehicle: { year: number | null; make: string | null; model: string | null } | null } | null };

const minutes = (a: string, b: string | null) => Math.max(0, Math.round(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 60000));
const span = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;

/** Who is on the clock, the signed-in technician's own controls, and the corrections waiting for a second person. */
export default async function TimePage({ searchParams }: { searchParams?: Promise<{ shop?: string }> }) {
  const params = await searchParams;
  const base = await q<{ shops: Shop[]; authenticatedItem: { id: string } | null }>(`{ shops(where: { status: { equals: "active" } }, orderBy: { code: asc }) { id code name } authenticatedItem { ... on User { id } } }`);
  const shop = pickShop(base.shops, params?.shop);
  if (!shop) return <Page title="Time clock"><LaborTabs active="time" /><Empty>No shop is set up yet.</Empty></Page>;
  const tz = await orgTimeZone();
  const me = base.authenticatedItem?.id;
  const sinceIso = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const d = await q<{ open: Shift[]; recent: Shift[]; clocks: JobClock[]; corrections: Correction[]; running: RunningJob[] }>(`{
    open: shiftClocks(where: { shop: { id: { equals: "${shop.id}" } }, status: { not: { equals: "clocked_out" } } }, orderBy: { clockInAt: asc }) { id clockInAt clockOutAt status breaks technician { id displayName user { id } } }
    recent: shiftClocks(where: { shop: { id: { equals: "${shop.id}" } }, status: { equals: "clocked_out" }, clockInAt: { gte: "${sinceIso}" } }, orderBy: { clockInAt: desc }, take: 40) { id clockInAt clockOutAt status breaks technician { id displayName user { id } } }
    clocks: jobClocks(where: { shop: { id: { equals: "${shop.id}" } }, OR: [{ status: { equals: "running" } }, { status: { equals: "waiting" } }] }, orderBy: { startedAt: asc }) { id startedAt stoppedAt status workedCentiHours technician { id displayName user { id } } job { number title repairOrder { roNumber } } }
    corrections: clockCorrections(where: { shop: { id: { equals: "${shop.id}" } }, status: { equals: "requested" } }, orderBy: { createdAt: desc }) { id targetId before after reason status createdAt technician { displayName } requestedBy { name } }
    running: jobs(where: { status: { equals: "in_progress" }, repairOrder: { shop: { id: { equals: "${shop.id}" } } } }, orderBy: { number: asc }, take: 40) { id number title repairOrder { roNumber vehicle { year make model } } }
  }`);
  const mine = d.open.find(s => s.technician?.user?.id === me);
  const myClocks = d.clocks.filter(c => c.technician?.user?.id === me);
  const onBreak = mine?.status === 'on_break';
  const takenJobs = new Set(myClocks.map(c => c.job?.number));
  return (
    <Page title="Time clock">
      <LaborTabs active="time" />
      <ShopSwitch shops={base.shops} current={shop} path="/dashboard/platform/time" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="On the clock" value={<span className="font-mono text-base">{d.open.filter(s => s.status !== 'on_break').length}</span>} />
        <Stat name="On a break" value={<span className="font-mono text-base">{d.open.filter(s => s.status === 'on_break').length}</span>} />
        <Stat name="Corrections waiting" value={<span className={`font-mono text-base ${d.corrections.length ? 'text-amber-600' : ''}`}>{d.corrections.length}</span>} />
      </div>

      <Section title="My shift">
        <div className="flex flex-wrap items-center gap-3 py-3 text-sm">
          {mine ? (
            <>
              <span>Clocked in {when(mine.clockInAt, tz, 'time')}, {span(minutes(mine.clockInAt, null))} so far.</span><Status value={onBreak ? 'paused' : 'running'} />
              {onBreak ? <Act primaryStyle op="endShiftBreak" vars={{ shopId: shop.id }}>End break</Act> : <Act op="startShiftBreak" vars={{ shopId: shop.id }}>Start break</Act>}
              <Act primaryStyle op="clockOutShift" vars={{ shopId: shop.id }}>Clock out</Act>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">You are not clocked in at {shop.name}.</span>
              <Act primaryStyle op="clockInShift" vars={{ shopId: shop.id }}>Clock in</Act>
            </>
          )}
        </div>
        {mine && !onBreak ? (
          <div className="space-y-2 border-t py-3 text-sm">
            <div className="text-xs font-medium text-muted-foreground">My jobs on the clock</div>
            {myClocks.length ? myClocks.map(c => (
              <div key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words">{c.job?.repairOrder?.roNumber} job {c.job?.number}, {c.job?.title} <Meta>since {when(c.startedAt, tz, 'time')}</Meta></span>
                <span className="flex flex-wrap items-center gap-2">
                  <Status value={c.status === 'waiting' ? 'waiting' : 'running'} />
                  {c.status === 'waiting' ? <Act op="logJobWaiting" vars={{ jobClockId: c.id, resume: true }}>Back to work</Act> : <Act op="logJobWaiting" vars={{ jobClockId: c.id, reason: 'parts' }}>Waiting on parts</Act>}
                  <Act primaryStyle op="stopTechJobClock" vars={{ jobClockId: c.id }}>Stop</Act>
                </span>
              </div>
            )) : <Meta>No job clock is running.</Meta>}
            {d.running.filter(j => !takenJobs.has(j.number)).map(j => (
              <div key={j.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-words">{j.repairOrder?.roNumber} job {j.number}, {j.title} <Meta>{[j.repairOrder?.vehicle?.year, j.repairOrder?.vehicle?.make, j.repairOrder?.vehicle?.model].filter(Boolean).join(' ')}</Meta></span>
                <Act op="startTechJobClock" vars={{ jobId: j.id }}>Start my clock</Act>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section title="Who is in the shop">
        {d.open.length ? d.open.map(s => (
          <div key={s.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-b-0">
            <span className="min-w-0 break-words">{s.technician?.displayName} <Meta>in at {when(s.clockInAt, tz, 'time')}</Meta></span>
            <span className="flex flex-wrap items-center gap-3"><Meta>{d.clocks.filter(c => c.technician?.id === s.technician?.id).map(c => `${c.job?.repairOrder?.roNumber} job ${c.job?.number}`).join(', ') || 'no job clock'}</Meta><Status value={s.status === 'on_break' ? 'paused' : 'running'} /></span>
          </div>
        )) : <Empty>Nobody is clocked in at {shop.name} right now.</Empty>}
      </Section>

      {d.corrections.length ? (
        <Section title="Corrections waiting for approval">
          {d.corrections.map(c => (
            <div key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-b-0">
              <span className="min-w-0 break-words">{c.technician?.displayName}: {c.reason} <Meta>asked by {c.requestedBy?.name} on {when(c.createdAt, tz, 'day')}</Meta></span>
              <Status value="requested" />
            </div>
          ))}
          <Meta>A manager other than the one who asked approves these on the Approvals page.</Meta>
        </Section>
      ) : null}

      <Section title="The last seven days">
        {d.recent.length ? d.recent.map(s => {
          const m = minutes(s.clockInAt, s.clockOutAt);
          const brk = (s.breaks ?? []).reduce((n, b) => n + (b.end ? minutes(b.start, b.end) : 0), 0);
          return (
            <div key={s.id} className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3 text-sm last:border-b-0">
              <span className="min-w-0 break-words">{s.technician?.displayName} <Meta>{when(s.clockInAt, tz, 'day')}, {when(s.clockInAt, tz, 'time')} to {when(s.clockOutAt, tz, 'time')}{brk ? `, ${brk} min break` : ''}</Meta></span>
              <span className="flex flex-wrap items-center gap-3"><span className="font-mono">{hours(Math.round(((m - brk) / 60) * 100))}</span>
                {s.technician?.user?.id === me ? <CorrectionForm targetId={s.id} startIso={s.clockInAt} endIso={s.clockOutAt} /> : null}
              </span>
            </div>
          );
        }) : <Empty>No finished shifts in the last seven days.</Empty>}
      </Section>
    </Page>
  );
}
