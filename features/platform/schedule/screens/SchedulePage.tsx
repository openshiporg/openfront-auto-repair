import Link from 'next/link';
import { q } from '../../lib/server';
import { hours, label, when } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Tabs, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { BookingForm } from './BookingForm';

type Appointment = {
  id: string; reference: string; startsAt: string; kind: string; status: string; version: number; estimatedCentiHours: number; concernText: string; requestedServices: string[] | null; source: string;
  lead: { name?: string } | null; customer: { id: string; displayName: string } | null; vehicle: { id: string; label: string } | null; checkIn: { reference: string } | null;
};
type Shop = { id: string; code: string; name: string; timeZone: string; calendar: { weeklyHours: { dow: number; open: string; close: string }[] | null } | null };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => iso(new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000));
const today = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/**
 * The day's appointments for one shop: drop-offs and waiters, against the shop's booking rules.
 * Capacity is enforced on the server under a lock; this screen only shows it. Arrival happens at check-in.
 */
export default async function SchedulePage({ searchParams }: { searchParams?: Promise<{ shop?: string; date?: string }> }) {
  const params = (await searchParams) ?? {};
  const base = await q<{ shops: Shop[] }>(`{ shops(where: { status: { equals: "active" } }, orderBy: { code: asc }) { id code name timeZone calendar { weeklyHours } } }`);
  const shop = base.shops.find(s => s.code === params.shop) ?? base.shops[0];
  if (!shop) return <Page title="Schedule"><Empty>No shops yet. Use “Set up your shop” in the sidebar.</Empty></Page>;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today(shop.timeZone);
  const data = await q<{ bookingRules: { kind: string; value: unknown; appliesToDays: number[] | null }[]; appointments: Appointment[]; customers: { id: string; displayName: string; ownerships: { vehicle: { id: string; label: string } | null }[] }[] }>(`query($shop: ID!, $date: CalendarDay!) {
    appointments(where: { shop: { id: { equals: $shop } }, date: { equals: $date } }, orderBy: { startsAt: asc }) {
      id reference startsAt kind status version estimatedCentiHours concernText requestedServices source lead customer { id displayName } vehicle { id label } checkIn { reference }
    }
    customers(where: { status: { equals: "active" } }, orderBy: { displayName: asc }, take: 200) { id displayName ownerships(where: { endedAt: null }) { vehicle { id label } } }
    bookingRules(where: { shop: { id: { equals: $shop } }, active: { equals: true } }) { kind value appliesToDays }
  }`, { shop: shop.id, date });

  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  // Day-specific rules override the general ones (same as the server's capacityRules).
  const applicable = data.bookingRules.filter(r => !r.appliesToDays?.length || r.appliesToDays.includes(dow));
  const rules: Record<string, unknown> = Object.fromEntries([...applicable].sort((a, b) => (a.appliesToDays?.length ? 1 : 0) - (b.appliesToDays?.length ? 1 : 0)).map(r => [r.kind, r.value]));
  const live = data.appointments.filter(a => ['requested', 'confirmed', 'arrived'].includes(a.status));
  const dropoffs = live.filter(a => a.kind !== 'waiter').length;
  const waiters = live.filter(a => a.kind === 'waiter').length;
  const bayHours = live.reduce((n, a) => n + (a.estimatedCentiHours ?? 0), 0);
  const href = (d: string, s = shop.code) => `/dashboard/platform/schedule?shop=${s}&date=${d}`;
  const open = shop.calendar?.weeklyHours?.find(h => h.dow === dow);

  return (
    <Page title="Schedule">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs active={shop.code} items={base.shops.map(s => ({ key: s.code, label: `${s.code} · ${s.name}`, href: href(date, s.code) }))} />
        <div className="flex items-center gap-2 text-sm">
          <Link className="rounded-md border px-2 py-1" href={href(addDays(date, -1))} aria-label="Previous day">←</Link>
          <span className="font-mono">{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span>
          <Link className="rounded-md border px-2 py-1" href={href(addDays(date, 1))} aria-label="Next day">→</Link>
          <Link className="text-xs underline" href={href(today(shop.timeZone))}>Today</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Hours" value={open ? `${open.open}–${open.close}` : 'Closed'} />
        <Stat name="Drop-offs" value={`${dropoffs}${rules.max_dropoffs_per_day ? ` / ${String(rules.max_dropoffs_per_day)}` : ''}`} />
        <Stat name="Waiters" value={`${waiters}${rules.waiter_slots_per_hour ? ` (${String(rules.waiter_slots_per_hour)}/h)` : ''}`} />
        <Stat name="Bay time" value={`${hours(bayHours)}${rules.max_bay_hours_per_day ? ` / ${hours(Number(rules.max_bay_hours_per_day))}` : ''}`} />
      </div>

      <BookingForm shopId={shop.id} timeZone={shop.timeZone} date={date} customers={data.customers.map(c => ({ id: c.id, name: c.displayName, vehicles: c.ownerships.map(o => o.vehicle).filter((v): v is { id: string; label: string } => Boolean(v)) }))} waiterCutoff={typeof rules.no_waiters_after === 'string' ? rules.no_waiters_after : null} />

      <Section title={`Appointments · ${shop.code}`}>
        {data.appointments.length ? data.appointments.map(a => (
          <Row key={a.id}>
            <div className="flex min-w-0 flex-[1_1_18rem] items-start gap-3 sm:gap-4">
              <span className="w-[4.75rem] shrink-0 whitespace-nowrap font-mono text-sm">{when(a.startsAt, shop.timeZone, 'time').replace(/ [A-Z]{2,4}$/, '')}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{a.customer?.displayName ?? a.lead?.name ?? 'Unknown'}</span>
                  <span className="font-mono text-xs text-muted-foreground">{a.reference}</span>
                </div>
                <Meta>{a.kind === 'waiter' ? 'Waiter' : 'Drop-off'} · {hours(a.estimatedCentiHours)} · {a.vehicle?.label ?? 'No vehicle yet'}{a.requestedServices?.length ? ` · ${a.requestedServices.join(', ')}` : ''}</Meta>
                {a.concernText ? <p className="break-words text-xs">“{a.concernText}”</p> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Status value={a.status} />
              {a.status === 'requested' && a.customer ? <ActionButton op="transitionAppointment" vars={{ id: a.id, to: 'confirmed', expectedVersion: a.version }}>Confirm</ActionButton> : null}
              {['requested', 'confirmed'].includes(a.status) && a.customer && a.vehicle ? <Link className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" href={`/dashboard/platform/check-in?appointment=${a.id}`}>Check in</Link> : null}
              {['requested', 'confirmed'].includes(a.status) ? <ActionButton op="transitionAppointment" vars={{ id: a.id, to: 'no_show', expectedVersion: a.version }} confirm="Mark as a no-show? This counts against the customer.">No-show</ActionButton> : null}
              {['requested', 'confirmed'].includes(a.status) ? <ActionButton op="transitionAppointment" vars={{ id: a.id, to: 'cancelled', expectedVersion: a.version }} ask="Why is this appointment cancelled?">Cancel</ActionButton> : null}
              {a.checkIn ? <Meta>{a.checkIn.reference}</Meta> : null}
            </div>
          </Row>
        )) : <Empty>No appointments on this day.</Empty>}
      </Section>
    </Page>
  );
}
