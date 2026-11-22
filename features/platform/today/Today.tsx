import Link from 'next/link';
import { q } from '../lib/server';
import { money, sumMinorOrNull } from '../lib/format';

const dayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** One figure a role may not be allowed to read: a refusal leaves the tile out instead of failing the page. */
async function tryQ<T>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  try { return await q<T>(query, variables); } catch { return null; }
}

function Tile({ href, name, value, note }: { href: string; name: string; value: React.ReactNode; note?: string }) {
  return (
    <Link href={href} className="flex min-h-24 flex-col justify-between rounded-lg border bg-background p-4 shadow-xs transition-colors hover:bg-muted/50">
      <span className="text-sm text-muted-foreground">{name}</span>
      <span>
        <span className="block text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {note ? <span className="block text-xs text-muted-foreground">{note}</span> : null}
      </span>
    </Link>
  );
}

const SHORTCUTS = [
  { href: '/dashboard/platform/check-in', label: 'Check a car in' },
  { href: '/dashboard/platform/schedule', label: 'Book an appointment' },
  { href: '/dashboard/platform/customers', label: 'Add a customer' },
  { href: '/dashboard/platform/receivables', label: 'Take a payment' },
];

/** What needs attention in the shop right now, first thing on the dashboard. Each tile opens the screen that handles it. */
export async function Today() {
  const org = await tryQ<{ organizationSettings: { defaultTimeZone: string } | null }>(`{ organizationSettings { defaultTimeZone } }`);
  const date = dayIn(org?.organizationSettings?.defaultTimeZone || 'America/Los_Angeles');
  const [work, booked, owed, approvals] = await Promise.all([
    // The board stage is worked out per repair order, so the open ones are read and counted here.
    tryQ<{ repairOrders: { status: string; boardStage: string }[] }>(`{
      repairOrders(where: { status: { in: ["checked_in", "in_service", "on_hold", "ready_to_invoice"] } }, take: 200) { status boardStage }
    }`).then(d => d ? {
      open: d.repairOrders.length,
      waiting: d.repairOrders.filter(r => r.boardStage === 'awaiting_authorization').length,
      ready: d.repairOrders.filter(r => r.status === 'ready_to_invoice').length,
    } : null),
    tryQ<{ today: number }>(`query($date: CalendarDay!) { today: appointmentsCount(where: { date: { equals: $date }, status: { notIn: ["cancelled", "no_show"] } }) }`, { date }),
    tryQ<{ invoices: { balanceMinor: string }[] }>(`{ invoices(where: { balanceMinor: { gt: "0" } }, take: 500) { balanceMinor } }`),
    tryQ<{ pending: number }>(`{ pending: approvalRequestsCount(where: { status: { equals: "pending" } }) }`),
  ]);
  if (!work && !booked && !owed && !approvals) return null;
  const owedTotal = owed ? sumMinorOrNull(owed.invoices, i => i.balanceMinor) : null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Today</h2>
      <div className="grid grid-cols-2 gap-2 md:gap-4 xl:grid-cols-3">
        {work ? <Tile href="/dashboard/platform/board" name="Cars in the shop" value={work.open} note={work.ready ? `${work.ready} ready to invoice` : undefined} /> : null}
        {booked ? <Tile href="/dashboard/platform/schedule" name="Booked today" value={booked.today} /> : null}
        {work ? <Tile href="/dashboard/platform/repair-orders" name="Waiting on the customer" value={work.waiting} note="Estimates not yet approved" /> : null}
        {owed ? <Tile href="/dashboard/platform/receivables" name="Unpaid invoices" value={owed.invoices.length} note={owedTotal !== null && owed.invoices.length ? `${money(owedTotal)} owing` : undefined} /> : null}
        {approvals ? <Tile href="/dashboard/platform/approvals" name="Approvals waiting" value={approvals.pending} /> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map(s => <Link key={s.href} href={s.href} className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-muted/50 max-md:h-11">{s.label}</Link>)}
      </div>
    </section>
  );
}
