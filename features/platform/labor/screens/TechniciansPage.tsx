import { orgTimeZone, q } from '../../lib/server';
import { hours, label, money, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { LaborTabs, ShopSwitch, pickShop } from './LaborTabs';

type Shop = { id: string; code: string; name: string };
type Cred = { id: string; technician: { id: string } | null; kind: string; identifier: string; issuedAt: string | null; expiresAt: string | null; status: string };
type Tech = { id: string; displayName: string; payPlan: string; flatRateMinor: string | null; hourlyRateMinor: string | null; skills: string[] | null; rateClasses: string[] | null; active: boolean };
type Entry = { technician: { id: string } | null; centiHours: number; kind: string; flaggedAt: string };

const KIND: Record<string, string> = { epa_609: 'EPA 609 refrigerant', ase: 'ASE', state_smog: 'State smog license', other: 'Other' };
const PLAN: Record<string, string> = { flat_rate: 'Flat rate', hourly: 'Hourly', salary_plus_bonus: 'Salary plus bonus' };

/** The people who turn wrenches: pay plan, the certificates they hold, and what they have flagged this period. */
export default async function TechniciansPage({ searchParams }: { searchParams?: Promise<{ shop?: string }> }) {
  const params = await searchParams;
  const base = await q<{ shops: Shop[] }>(`{ shops(where: { status: { equals: "active" } }, orderBy: { code: asc }) { id code name } }`);
  const shop = pickShop(base.shops, params?.shop);
  if (!shop) return <Page title="Technicians"><LaborTabs active="technicians" /><Empty>No shop is set up yet.</Empty></Page>;
  const tz = await orgTimeZone();
  const d = await q<{ technicianProfiles: Tech[]; technicianCredentials: Cred[]; flaggedHoursEntries: Entry[] }>(`{
    technicianProfiles(where: { shop: { id: { equals: "${shop.id}" } } }, orderBy: { displayName: asc }) { id displayName payPlan flatRateMinor hourlyRateMinor skills rateClasses active }
    technicianCredentials(where: { technician: { shop: { id: { equals: "${shop.id}" } } } }, orderBy: { kind: asc }) { id kind identifier issuedAt expiresAt status technician { id } }
    flaggedHoursEntries(where: { shop: { id: { equals: "${shop.id}" } }, payPeriod: { status: { equals: "open" } } }, take: 1000) { technician { id } centiHours kind flaggedAt }
  }`);
  const today = new Date().toISOString().slice(0, 10);
  const credsOf = (id: string) => d.technicianCredentials.filter(c => c.technician?.id === id);
  const flagged = (id: string) => d.flaggedHoursEntries.filter(e => e.technician?.id === id).reduce((n, e) => n + e.centiHours, 0);
  const lapsed = d.technicianProfiles.filter(t => credsOf(t.id).some(c => c.kind === 'epa_609' && (c.status === 'expired' || (c.expiresAt && c.expiresAt.slice(0, 10) < today)))).length;
  return (
    <Page title="Technicians">
      <LaborTabs active="technicians" />
      <ShopSwitch shops={base.shops} current={shop} path="/dashboard/platform/technicians" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Technicians" value={<span className="font-mono text-base">{d.technicianProfiles.filter(t => t.active).length}</span>} />
        <Stat name="Flagged this period" value={<span className="font-mono text-base">{hours(d.flaggedHoursEntries.reduce((n, e) => n + e.centiHours, 0))}</span>} />
        <Stat name="Refrigerant certificate lapsed" value={<span className={`font-mono text-base ${lapsed ? 'text-red-600' : ''}`}>{lapsed}</span>} />
      </div>
      <Section title={`Technicians at ${shop.name}`}>
        {d.technicianProfiles.length ? d.technicianProfiles.map(t => (
          <div key={t.id} className="space-y-2 border-b py-4 text-sm last:border-b-0">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words font-medium">{t.displayName} <Meta>{PLAN[t.payPlan] ?? label(t.payPlan)}{t.flatRateMinor !== null && t.payPlan !== 'hourly' ? `, ${money(t.flatRateMinor)} per flagged hour` : ''}{t.hourlyRateMinor !== null && t.payPlan === 'hourly' ? `, ${money(t.hourlyRateMinor)} per hour` : ''}</Meta></span>
              <span className="font-mono">{hours(flagged(t.id))}</span>
            </div>
            {t.skills?.length ? <Meta>{t.skills.join(', ')}</Meta> : null}
            <div className="space-y-1">
              {credsOf(t.id).length ? credsOf(t.id).map(c => {
                const lapsedNow = c.status === 'expired' || (c.expiresAt && c.expiresAt.slice(0, 10) < today);
                return (
                  <div key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words">{KIND[c.kind] ?? label(c.kind)} <Meta>{c.identifier}{c.expiresAt ? `, expires ${new Date(`${c.expiresAt.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}` : ', does not expire'}</Meta></span>
                    <Status value={lapsedNow ? 'expired' : 'active'} />
                  </div>
                );
              }) : <Meta>No certificates on file.</Meta>}
            </div>
          </div>
        )) : <Empty>No technicians are set up at {shop.name}.</Empty>}
      </Section>
      <Meta>Times shown in {tz.split('/').pop()?.replaceAll('_', ' ')}. A technician with a lapsed EPA 609 certificate cannot be assigned or start air-conditioning work.</Meta>
    </Page>
  );
}
