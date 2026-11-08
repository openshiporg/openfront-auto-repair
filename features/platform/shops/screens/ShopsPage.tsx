import Link from 'next/link';
import { q } from '../../lib/server';
import { Page, Row, Empty, Status, Meta, Section, Stat } from '../../components/ui';

type Hours = { dow: number; open: string; close: string };
type Shop = {
  id: string; code: string; name: string; addressLine1: string; city: string; region: string; postalCode: string; phone: string; timeZone: string; status: string;
  registrations: Record<string, string> | null;
  calendar: { name: string; weeklyHours: Hours[] | null; coverageThrough: string | null; exceptions: { date: string; reason: string; closed: boolean; open: string; close: string }[] } | null;
  bays: { id: string; code: string; name: string; kind: string; active: boolean }[];
  memberships: { id: string; status: string; user: { name: string } | null; role: { name: string } | null }[];
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const REGISTRATION_LABELS: Record<string, string> = { barArd: 'BAR ARD', epaId: 'EPA ID', sellerPermit: "Seller's permit", tireFeeAccount: 'Tire fee account' };

/** Opening hours grouped into runs of identical days: "Mon–Fri 07:30–18:00 · Sat 08:00–14:00". */
function hoursText(hours: Hours[] | null) {
  if (!hours?.length) return 'No regular hours';
  const sorted = [...hours].sort((a, b) => a.dow - b.dow);
  const runs: { from: number; to: number; open: string; close: string }[] = [];
  for (const h of sorted) {
    const last = runs.at(-1);
    if (last && last.to === h.dow - 1 && last.open === h.open && last.close === h.close) last.to = h.dow;
    else runs.push({ from: h.dow, to: h.dow, open: h.open, close: h.close });
  }
  return runs.map(r => `${DAYS[r.from]}${r.to > r.from ? `–${DAYS[r.to]}` : ''} ${r.open}–${r.close}`).join(' · ');
}

/** Shops, their bays, hours, closures and staff. Edits go through the list screens; every edit is audited. */
export default async function ShopsPage() {
  const data = await q<{ shops: Shop[] }>(`{
    shops(orderBy: { code: asc }) {
      id code name addressLine1 city region postalCode phone timeZone status registrations
      calendar { name weeklyHours coverageThrough exceptions(orderBy: { date: asc }) { date reason closed open close } }
      bays(orderBy: { code: asc }) { id code name kind active }
      memberships(where: { status: { equals: "active" } }) { id status user { name } role { name } }
    }
  }`);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Page title="Shops">
      {data.shops.length ? data.shops.map(shop => {
        const upcoming = (shop.calendar?.exceptions ?? []).filter(e => e.date >= today).slice(0, 4);
        return (
          <Section key={shop.id} title={shop.name} aside={<Link href={`/dashboard/shops/${shop.id}`} className="inline-flex min-h-11 items-center text-xs underline md:min-h-0">Edit</Link>}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat name="Status" value={<Status value={shop.status} />} />
              <Stat name="Bays" value={shop.bays.filter(b => b.active).length} />
              <Stat name="Staff" value={shop.memberships.length} />
              <Stat name="Calendar to" value={shop.calendar?.coverageThrough ?? '—'} />
            </div>
            <Row>
              <div className="min-w-0 space-y-1">
                <div>{shop.addressLine1}, {shop.city}, {shop.region} {shop.postalCode}</div>
                <Meta>{shop.phone} · {shop.timeZone}</Meta>
              </div>
              <Meta>{hoursText(shop.calendar?.weeklyHours ?? null)}</Meta>
            </Row>
            {shop.registrations ? (
              <Row>
                <Meta>Registrations printed on estimates and invoices</Meta>
                <Meta>{Object.entries(shop.registrations).map(([k, v]) => `${REGISTRATION_LABELS[k] ?? k} ${v}`).join(' · ')}</Meta>
              </Row>
            ) : null}
            <Row>
              <Meta>Bays</Meta>
              <div className="flex flex-wrap gap-1.5">
                {shop.bays.map(b => (
                  <span key={b.id} title={b.name} className={`rounded-md border px-2 py-0.5 font-mono text-xs ${b.active ? '' : 'opacity-50 line-through'}`}>{b.code} <span className="text-muted-foreground">{b.kind.replaceAll('_', ' ')}</span></span>
                ))}
              </div>
            </Row>
            <Row>
              <Meta>Next closures</Meta>
              <Meta>{upcoming.length ? upcoming.map(e => `${e.date} ${e.closed ? e.reason || 'closed' : `${e.open}–${e.close}`}`).join(' · ') : 'None scheduled'}</Meta>
            </Row>
            <Row>
              <Meta>Staff</Meta>
              <Meta>{shop.memberships.map(m => `${m.user?.name ?? '—'}${m.role ? ` (${m.role.name})` : ''}`).join(' · ') || 'Nobody yet'}</Meta>
            </Row>
          </Section>
        );
      }) : <Empty>No shops yet. Use “Set up your shop” in the sidebar to load Northgate Auto Group.</Empty>}
    </Page>
  );
}
