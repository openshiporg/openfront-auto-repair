import { orgTimeZone, q } from '../../lib/server';
import { label, money, when } from '../../lib/format';
import { Page, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { LaborTabs, ShopSwitch, pickShop } from './LaborTabs';
import { Act, AttachJobForm, DiagnoseForm, OpenComebackForm, ResolveForm } from './LaborActions';

type Shop = { id: string; code: string; name: string };
type Comeback = { id: string; reference: string; concern: string; cause: string; diagnosis: string | null; coverageValid: boolean; noCharge: boolean; resolution: string | null; comebackJob: { id: string } | null; status: string; createdAt: string; openedBy: { name: string } | null; originalJob: { number: number; title: string; repairOrder: { roNumber: string } | null } | null };
type Claim = { id: string; claimNumber: string; laborReimbursementMinor: string | null; voidReason: string; status: string; version: number; supplier: { name: string } | null; comeback: { reference: string } | null };
type Billed = { id: string; number: number; title: string; repairOrder: { roNumber: string; vehicle: { year: number | null; make: string | null; model: string | null } | null } | null };

const CAUSE: Record<string, string> = { workmanship: 'Our workmanship', part_failure: 'A part failed', new_issue: 'A new, unrelated problem', customer_caused: 'Caused by the customer', undetermined: 'Not yet diagnosed' };
const STATE: Record<string, string> = { open: 'waiting for diagnosis', diagnosed: 'diagnosed', resolved: 'resolved', cancelled: 'cancelled' };
const CLOSED = ['resolved', 'cancelled'];

/** Repeat visits for work the shop already billed: whether the warranty covers it, who was at fault, and what comes back from suppliers. */
export default async function ComebacksPage({ searchParams }: { searchParams?: Promise<{ shop?: string }> }) {
  const params = await searchParams;
  const base = await q<{ shops: Shop[] }>(`{ shops(where: { status: { equals: "active" } }, orderBy: { code: asc }) { id code name } }`);
  const shop = pickShop(base.shops, params?.shop);
  if (!shop) return <Page title="Comebacks"><LaborTabs active="comebacks" /><Empty>No shop is set up yet.</Empty></Page>;
  const tz = await orgTimeZone();
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const d = await q<{ comebackCases: Comeback[]; partWarrantyClaims: Claim[]; jobs: Billed[]; repeats: Billed[] }>(`{
    comebackCases(where: { shop: { id: { equals: "${shop.id}" } } }, orderBy: { createdAt: desc }, take: 100) { id reference concern cause diagnosis coverageValid noCharge resolution comebackJob { id } status createdAt openedBy { name } originalJob { number title repairOrder { roNumber } } }
    partWarrantyClaims(where: { shop: { id: { equals: "${shop.id}" } } }, orderBy: { createdAt: desc }, take: 50) { id claimNumber laborReimbursementMinor voidReason status version supplier { name } comeback { reference } }
    jobs(where: { status: { equals: "completed" }, completedAt: { gte: "${since}" }, repairOrder: { shop: { id: { equals: "${shop.id}" } } } }, orderBy: { completedAt: desc }, take: 60) { id number title repairOrder { roNumber vehicle { year make model } } }
    repeats: jobs(where: { status: { notIn: ["voided", "declined", "deferred"] }, repairOrder: { kind: { equals: "comeback" }, shop: { id: { equals: "${shop.id}" } } } }, orderBy: { createdAt: desc }, take: 40) { id number title repairOrder { roNumber vehicle { year make model } } }
  }`);
  const openJobs = new Set(d.comebackCases.filter(c => !CLOSED.includes(c.status)).map(c => `${c.originalJob?.repairOrder?.roNumber}-${c.originalJob?.number}`));
  const choices = d.jobs.filter(j => !openJobs.has(`${j.repairOrder?.roNumber}-${j.number}`)).map(j => ({ id: j.id, label: `${j.repairOrder?.roNumber} job ${j.number}, ${j.title}${j.repairOrder?.vehicle ? ` (${[j.repairOrder.vehicle.year, j.repairOrder.vehicle.make, j.repairOrder.vehicle.model].filter(Boolean).join(' ')})` : ''}` }));
  const open = d.comebackCases.filter(c => !CLOSED.includes(c.status));
  const repeatChoices = d.repeats.map(j => ({ id: j.id, label: `${j.repairOrder?.roNumber} job ${j.number}, ${j.title}` }));
  return (
    <Page title="Comebacks">
      <LaborTabs active="comebacks" />
      <ShopSwitch shops={base.shops} current={shop} path="/dashboard/platform/comebacks" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Open" value={<span className={`font-mono text-base ${open.length ? 'text-amber-600' : ''}`}>{open.length}</span>} />
        <Stat name="Free to the customer" value={<span className="font-mono text-base">{open.filter(c => c.noCharge).length}</span>} />
        <Stat name="Supplier claims open" value={<span className="font-mono text-base">{d.partWarrantyClaims.filter(c => !['credited', 'closed', 'withdrawn', 'denied'].includes(c.status)).length}</span>} />
      </div>
      <Section title="Open a comeback"><div className="py-3">{choices.length ? <OpenComebackForm jobs={choices} /> : <Empty>No recently finished job to open a comeback against.</Empty>}</div></Section>
      <Section title="Comebacks">
        {d.comebackCases.length ? d.comebackCases.map(c => (
          <div key={c.id} className="space-y-2 border-b py-4 text-sm last:border-b-0">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words font-medium">{c.reference} <Meta>{c.originalJob?.repairOrder?.roNumber} job {c.originalJob?.number}, {c.originalJob?.title}. Opened {when(c.createdAt, tz, 'day')}{c.openedBy ? ` by ${c.openedBy.name}` : ''}</Meta></span>
              <Status value={c.status} />
            </div>
            <p className="break-words">&ldquo;{c.concern}&rdquo;</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1"><Meta>{c.noCharge ? 'Free to the customer' : c.coverageValid ? 'Covered' : 'Warranty has run out, the customer pays unless the owner approves goodwill'}</Meta><Meta>{CAUSE[c.cause] ?? label(c.cause)}, {STATE[c.status] ?? label(c.status)}</Meta></div>
            {c.diagnosis ? <p className="break-words text-xs text-muted-foreground">Found: {c.diagnosis}</p> : null}
            {c.resolution ? <p className="break-words text-xs text-muted-foreground">Fixed: {c.resolution}</p> : null}
            {c.status === 'open' ? <div className="pt-1"><DiagnoseForm comebackId={c.id} /></div> : null}
            {c.status !== 'resolved' && c.status !== 'cancelled' && c.noCharge && !c.comebackJob ? <div className="pt-1"><AttachJobForm comebackId={c.id} jobs={repeatChoices} /></div> : null}
            {c.status === 'diagnosed' ? <div className="pt-1"><ResolveForm comebackId={c.id} jobs={repeatChoices} /></div> : null}
            {!CLOSED.includes(c.status) ? (
              <div className="flex flex-wrap items-start gap-2 pt-1">
                {!c.noCharge ? <Act op="requestComebackGoodwill" vars={{ comebackId: c.id }} ask="Why is the shop making this repair free?">Make it free (needs approval)</Act> : null}
                <Act op="cancelShopComeback" vars={{ comebackId: c.id }} ask="Why is this comeback being cancelled?">Cancel this comeback</Act>
              </div>
            ) : null}
          </div>
        )) : <Empty>No comebacks. Work that came back for the same problem shows up here.</Empty>}
      </Section>
      {d.partWarrantyClaims.length ? (
        <Section title="Supplier warranty claims">
          {d.partWarrantyClaims.map(c => (
            <div key={c.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b py-3 text-sm last:border-b-0">
              <span className="min-w-0 break-words">{c.claimNumber} <Meta>{c.supplier?.name}, for {c.comeback?.reference}{c.laborReimbursementMinor && c.laborReimbursementMinor !== '0' ? `, labor ${money(c.laborReimbursementMinor)}` : ''}</Meta></span>
              <span className="flex flex-wrap items-center gap-2"><Status value={c.status} />{['draft', 'submitted'].includes(c.status) ? <Act op="withdrawShopPartWarrantyClaim" vars={{ claimId: c.id }} ask="Why is this claim being withdrawn?">Withdraw</Act> : null}</span>
            </div>
          ))}
        </Section>
      ) : null}
    </Page>
  );
}
