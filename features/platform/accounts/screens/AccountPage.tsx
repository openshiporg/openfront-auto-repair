import { notFound } from 'next/navigation';
import { q, holds } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat, Status } from '../../components/ui';
import { ApproverForm, CertificateForm, ContactForm, Do, ExportPeriod, LinkButton, ReleaseHold, TermsForm, UnitForm } from './AccountActions';

type Contact = { id: string; name: string; email: string | null; phone: string | null; active: boolean };
type Approver = { id: string; limitMinor: string; order: number; contact: { name: string } | null };
type Cert = { id: string; kind: string; number: string; issuingState: string; effectiveFrom: string | null; expiresAt: string | null; status: string };
type Unit = { id: string; unitNumber: string; driverName: string; costCenter: string; vehicle: { year: number | null; make: string; model: string } | null };
type Inv = { id: string; invoiceNumber: string; dueDate: string | null; balanceMinor: string; totalMinor: string };
type Stmt = { id: string; reference: string; periodStart: string; periodEnd: string; closingMinor: string; exportedAt: string | null };
type Acct = {
  id: string; name: string; accountNumber: string; status: string; termsDays: number; creditLimitMinor: string; openBalanceMinor: string; poRequired: boolean; taxExempt: boolean; billingMode: string;
  holdAfterOverdueDays: number | null; holdReason: string; holdSince: string | null;
};

const BUCKETS = [['current', 'Not yet due'], ['d30', '1 to 30 days late'], ['d60', '31 to 60 days late'], ['d90', '61 to 90 days late'], ['d90p', 'Over 90 days late']] as const;
const DAY = 86_400_000;
const days = (iso: string) => Math.round(Date.parse(iso.slice(0, 10)) / DAY);
const vehicleName = (v: Unit['vehicle']) => (v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '');
const lastMonth = (today: string) => {
  const [y, m] = today.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10) };
};

/** One account: terms, standing, units, who can approve and up to how much, tax certificates, and what is owed by age. */
export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const can = await holds(['canReadRepairOrders', 'canManageCustomers', 'canApproveCredit', 'canReadFinancials', 'canFinalizeInvoices']);
  // Each button shows only for a role the server lets press it.
  const manage = can.canManageCustomers;
  const credit = can.canApproveCredit;
  const books = can.canReadFinancials || can.canFinalizeInvoices;
  if (!can.canReadRepairOrders && !can.canManageCustomers) return <Page title="Account"><Empty>Your role is not allowed to view accounts.</Empty></Page>;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound();
  const found = await q<{ businessAccount: Acct | null }>(`query($id: ID!) { businessAccount(where: { id: $id }) { id name accountNumber status termsDays creditLimitMinor openBalanceMinor poRequired taxExempt billingMode holdAfterOverdueDays holdReason holdSince } }`, { id }).catch(() => null);
  const a = found?.businessAccount;
  if (!a) notFound();
  const by = `{ businessAccount: { id: { equals: "${a.id}" } } }`;
  const d = await q<{ contacts: Contact[]; approvers: Approver[]; certs: Cert[]; units: Unit[]; invoices: Inv[]; statements: Stmt[]; owned: { vehicle: { id: string; year: number | null; make: string; model: string } | null }[] }>(`{
    contacts: businessAccountContacts(where: { businessAccount: { id: { equals: "${a.id}" } }, active: { equals: true } }, orderBy: { name: asc }) { id name email phone active }
    approvers: fleetApprovers(where: { businessAccount: { id: { equals: "${a.id}" } }, active: { equals: true } }, orderBy: { order: asc }) { id limitMinor order contact { name } }
    certs: exemptionCertificates(where: { businessAccount: { id: { equals: "${a.id}" } } }, orderBy: { createdAt: desc }) { id kind number issuingState effectiveFrom expiresAt status }
    units: fleetUnits(where: { businessAccount: { id: { equals: "${a.id}" } } }, orderBy: { unitNumber: asc }, take: 200) { id unitNumber driverName costCenter vehicle { year make model } }
    invoices: invoices(where: { businessAccount: { id: { equals: "${a.id}" } }, balanceMinor: { gt: "0" } }, orderBy: { dueDate: asc }, take: 200) { id invoiceNumber dueDate balanceMinor totalMinor }
    statements: statements(where: { businessAccount: { id: { equals: "${a.id}" } } }, orderBy: { periodStart: desc }, take: 6) { id reference periodStart periodEnd closingMinor exportedAt }
    owned: vehicleOwnerships(where: { businessAccount: { id: { equals: "${a.id}" } }, endedAt: { equals: null } }, take: 300) { vehicle { id year make model } }
  }`);
  void by;
  const todayIso = new Date().toISOString().slice(0, 10);
  const today = days(todayIso);
  const aging: Record<string, bigint> = { current: 0n, d30: 0n, d60: 0n, d90: 0n, d90p: 0n };
  for (const i of d.invoices) {
    const late = i.dueDate ? today - days(i.dueDate) : 0;
    aging[late <= 0 ? 'current' : late <= 30 ? 'd30' : late <= 60 ? 'd60' : late <= 90 ? 'd90' : 'd90p'] += BigInt(i.balanceMinor);
  }
  const unitVehicleNames = new Set(d.units.map(u => vehicleName(u.vehicle)));
  const free = d.owned.filter(o => o.vehicle).map(o => ({ id: o.vehicle!.id, name: vehicleName(o.vehicle) })).filter(v => !unitVehicleNames.has(v.name) || true).slice(0, 60);
  const limit = BigInt(a.creditLimitMinor);
  const owed = BigInt(a.openBalanceMinor);
  const held = a.status === 'credit_hold';
  const period = lastMonth(todayIso);
  const soon = (c: Cert) => c.status === 'active' && c.expiresAt && days(c.expiresAt) - today <= 30 && days(c.expiresAt) - today > 0;
  const lapsed = (c: Cert) => c.status === 'active' && c.expiresAt && days(c.expiresAt) <= today;
  return (
    <Page title={a.name} crumbs={[{ label: 'Accounts', href: '/dashboard/platform/accounts' }]}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat name="Standing" value={<Status value={a.status} />} />
        <Stat name="Owed" value={<span className="font-mono text-base">{money(a.openBalanceMinor)}</span>} />
        <Stat name="Credit limit" value={<span className="font-mono text-base">{limit ? money(a.creditLimitMinor) : 'No limit'}</span>} />
        <Stat name="Terms" value={<span className="text-base">{a.termsDays ? `Net ${a.termsDays}` : 'Due on receipt'}</span>} />
      </div>
      {held ? (
        <div role="status" className="space-y-2 rounded-lg border border-red-300 p-3 text-sm">
          <p className="break-words">New work cannot be billed to this account. {a.holdReason || 'A manager placed it on hold.'}{a.holdSince ? ` Since ${when(a.holdSince, 'America/Los_Angeles', 'day')}.` : ''}</p>
          {credit ? <ReleaseHold businessAccountId={a.id} /> : null}
        </div>
      ) : limit && owed > limit ? <p role="status" className="text-sm text-red-600">The account owes more than its limit. It goes on hold the next time it is checked.</p> : null}
      <Section title="Terms" aside={manage || credit || books ? <span className="flex flex-wrap gap-2">{manage ? <TermsForm a={a} /> : null}{credit && !held && a.status === 'active' ? <Do op="holdAccountCredit" vars={{ businessAccountId: a.id }} ask="Why is the account going on hold?">Put on hold</Do> : null}{manage || books ? <Do op="refreshAccountStanding" vars={{ businessAccountId: a.id }}>Check standing now</Do> : null}</span> : null}>
        <Row><div className="min-w-0 space-y-1 text-sm"><div>{a.poRequired ? 'A purchase order number is required on every invoice.' : 'No purchase order needed.'}</div><Meta>{a.billingMode === 'statement_monthly' ? 'Billed on a monthly statement.' : 'Billed on each invoice.'}{a.holdAfterOverdueDays ? ` Held when an invoice is more than ${a.holdAfterOverdueDays} days late.` : ' Not held for late invoices.'}</Meta></div></Row>
      </Section>
      <Section title="What is owed, by age">
        {BUCKETS.map(([k, name]) => <Row key={k}><span className="text-sm">{name}</span><span className="font-mono text-sm">{money(aging[k].toString())}</span></Row>)}
        {d.invoices.map(i => <Row key={i.id}><span className="font-mono text-xs">{i.invoiceNumber}{i.dueDate ? ` · due ${when(i.dueDate, 'UTC', 'day')}` : ''}</span><span className="font-mono text-xs">{money(i.balanceMinor)}</span></Row>)}
      </Section>
      <Section title="Who can approve work" aside={manage ? <span className="flex flex-wrap gap-2"><ContactForm businessAccountId={a.id} /><ApproverForm businessAccountId={a.id} contacts={d.contacts.map(c => ({ id: c.id, name: c.name }))} /></span> : null}>
        {d.approvers.length ? d.approvers.map(p => (
          <Row key={p.id}><div className="min-w-0"><span className="break-words text-sm font-medium">{p.order}. {p.contact?.name}</span><div><Meta>Can approve up to {money(p.limitMinor)}. Anything higher goes to the next person.</Meta></div></div>{manage ? <Do op="removeAccountApprover" vars={{ approverId: p.id }}>Remove</Do> : null}</Row>
        )) : <Empty>No approvers yet. Work is authorized with the shop directly.</Empty>}
        {d.contacts.map(c => <Row key={c.id}><div className="min-w-0"><span className="break-words text-sm">{c.name}</span><div><Meta>{[c.email, c.phone].filter(Boolean).join(' · ')}</Meta></div></div>{manage ? <LinkButton contactId={c.id} /> : null}</Row>)}
      </Section>
      <Section title="Tax certificates" aside={manage ? <CertificateForm businessAccountId={a.id} /> : null}>
        {d.certs.length ? d.certs.map(c => (
          <Row key={c.id}>
            <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-medium">{c.number}</span><Status value={lapsed(c) ? 'expired' : c.status} /></div>
              <Meta>{c.kind.replaceAll('_', ' ')}{c.issuingState ? ` · ${c.issuingState}` : ''}{c.expiresAt ? ` · expires ${when(c.expiresAt, 'UTC', 'day')}` : ' · no expiry date'}</Meta>
              {soon(c) ? <Meta>Expires in {days(c.expiresAt!) - today} days. Ask for a new certificate, or invoices will be taxed after that date.</Meta> : null}
              {lapsed(c) ? <Meta>Past its date. New invoices are taxed.</Meta> : null}</div>
            {manage && c.status === 'active' ? <Do op="revokeAccountCertificate" vars={{ certificateId: c.id }} ask="Why is it being revoked?">Revoke</Do> : null}
          </Row>
        )) : <Empty>No certificate on file. Invoices are taxed.</Empty>}
      </Section>
      <Section title="Units" aside={manage ? <UnitForm businessAccountId={a.id} vehicles={free} /> : null}>
        {d.units.length ? d.units.map(u => <Row key={u.id}><div className="min-w-0"><span className="font-mono text-sm">{u.unitNumber}</span> <span className="break-words text-sm">{vehicleName(u.vehicle)}</span><div><Meta>{[u.driverName && `Driver ${u.driverName}`, u.costCenter].filter(Boolean).join(' · ')}</Meta></div></div></Row>) : <Empty>No units yet.</Empty>}
      </Section>
      <Section title="Statements" aside={books ? <ExportPeriod businessAccountId={a.id} start={period.start} end={period.end} label="Export last month" /> : null}>
        {d.statements.length ? d.statements.map(s => <Row key={s.id}><div className="min-w-0"><span className="font-mono text-sm">{s.reference}</span><div><Meta>{when(s.periodStart, 'UTC', 'day')} to {when(s.periodEnd, 'UTC', 'day')}</Meta></div></div><span className="font-mono text-sm">{money(s.closingMinor)}</span></Row>) : <Empty>No statements yet.</Empty>}
      </Section>
    </Page>
  );
}
