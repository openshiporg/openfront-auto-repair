import Link from 'next/link';
import { q, orgTimeZone, holds } from '../../lib/server';
import { when, label, money } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Tabs, Stat } from '../../components/ui';
import { NewCustomerForm } from './NewCustomerForm';
import { RevokeConsent } from '../../messages/screens/Actions';

type Contact = { id: string; kind: string; label: string; isPrimary: boolean; status: string; consents: { channel: string; purpose: string; action: string; method: string; writtenConsent: boolean; at: string }[] };
type Customer = {
  id: string; kind: string; displayName: string; status: string; noShowCount: number; preferredChannel: string; notes: string; createdAt: string;
  homeShop: { name: string } | null; businessAccount: { id: string; name: string; termsDays: number; poRequired: boolean } | null;
  contacts: Contact[];
  ownerships: { vehicle: { id: string; label: string; vin: string } | null }[];
  appointments: { reference: string; startsAt: string; status: string }[];
};
type Account = { id: string; name: string; accountNumber: string; termsDays: number; creditLimitMinor: string; poRequired: boolean; billingMode: string; customersCount: number; status: string };

const CUSTOMER = `id kind displayName status noShowCount preferredChannel notes createdAt homeShop { name } businessAccount { id name termsDays poRequired }
  contacts(orderBy: { createdAt: asc }) { id kind label isPrimary status consents(orderBy: { at: desc }) { channel purpose action method writtenConsent at } }
  ownerships(where: { endedAt: null }) { vehicle { id label vin } }
  appointments(orderBy: { startsAt: desc }, take: 1) { reference startsAt status }`;

/** The latest decision for each channel and purpose. "all" covers both purposes (a STOP reply revokes everything on the number). */
function consentSummary(contact: Contact) {
  const channels = contact.kind === 'email' ? ['email'] : contact.kind === 'mobile' ? ['sms', 'voice'] : ['voice'];
  return channels.map(channel => {
    const purposes = ['transactional', 'marketing'].map(purpose => {
      const latest = contact.consents.find(c => c.channel === channel && (c.purpose === purpose || c.purpose === 'all'));
      return { purpose, action: latest?.action ?? 'unknown' };
    });
    return { channel, purposes };
  });
}

/** Customers and fleet accounts. Contact values stay masked; consent is shown as the latest decision per channel. */
export default async function CustomersPage({ searchParams }: { searchParams?: Promise<{ view?: string; q?: string; shop?: string }> }) {
  const params = (await searchParams) ?? {};
  const view = params.view === 'fleet' ? 'fleet' : 'people';
  const search = (params.q ?? '').trim().slice(0, 80);
  const where = search ? `{ status: { equals: "active" }, OR: [{ displayName: { contains: $q, mode: insensitive } }, { companyName: { contains: $q, mode: insensitive } }] }` : '{ status: { equals: "active" } }';
  const mayRevoke = await holds(['canMessageCustomers', 'canManageCustomers']).then(h => h.canMessageCustomers || h.canManageCustomers);
  const [data, tz] = await Promise.all([
    q<{ customers: Customer[]; customersCount: number; businessAccounts: Account[]; shops: { id: string; code: string; name: string }[]; stopped: number }>(`query${search ? '($q: String!)' : ''} {
      customers(where: ${where}, orderBy: { displayName: asc }, take: 60) { ${CUSTOMER} }
      customersCount(where: { status: { equals: "active" } })
      businessAccounts(orderBy: { name: asc }) { id name accountNumber termsDays creditLimitMinor poRequired billingMode customersCount status }
      shops(orderBy: { code: asc }) { id code name }
      stopped: contactConsentsCount(where: { action: { equals: "revoked" }, method: { equals: "keyword_reply" } })
    }`, search ? { q: search } : {}),
    orgTimeZone(),
  ]);
  return (
    <Page title="Customers">
      <Tabs active={view} items={[
        { key: 'people', label: 'Customers', href: '/dashboard/platform/customers', count: data.customersCount },
        { key: 'fleet', label: 'Fleet accounts', href: '/dashboard/platform/customers?view=fleet', count: data.businessAccounts.length },
      ]} />
      {view === 'fleet' ? (
        <Section title="Fleet and business accounts">
          {data.businessAccounts.length ? data.businessAccounts.map(a => (
            <Row key={a.id}>
              <div className="min-w-0 space-y-1">
                <div className="font-medium">{a.name}</div>
                <Meta>{a.accountNumber} · {a.termsDays ? `Net ${a.termsDays}` : 'Due on receipt'} · limit {money(a.creditLimitMinor)} · {a.poRequired ? 'PO required' : 'no PO'} · {label(a.billingMode)}</Meta>
              </div>
              <div className="flex items-center gap-3"><Meta>{a.customersCount} contact{a.customersCount === 1 ? '' : 's'}</Meta><Status value={a.status} /></div>
            </Row>
          )) : <Empty>No fleet accounts yet.</Empty>}
        </Section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat name="Active customers" value={data.customersCount} />
            <Stat name="Fleet accounts" value={data.businessAccounts.length} />
            <Stat name="Texting stopped" value={data.stopped} />
            <Stat name="Shops" value={data.shops.map(s => s.name).join(' · ') || '—'} />
          </div>
          <NewCustomerForm shops={data.shops} />
          <Section title={search ? `Matching “${search}”` : 'Customers'} aside={
            <form className="flex gap-2" action="/dashboard/platform/customers">
              <input name="q" defaultValue={search} placeholder="Search by name" aria-label="Search customers by name" className="h-8 max-md:h-11 w-40 rounded-md border bg-background px-2 text-sm sm:w-56" />
            </form>
          }>
            {data.customers.length ? data.customers.map(c => (
              <Row key={c.id}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.displayName}</span>
                    {c.kind === 'business' ? <span className="text-xs text-muted-foreground">Business</span> : null}
                    {c.homeShop ? <span className="font-mono text-xs text-muted-foreground">{c.homeShop.name}</span> : null}
                    {c.noShowCount > 0 ? <span className="font-mono text-xs text-red-600">{c.noShowCount} no-show{c.noShowCount === 1 ? '' : 's'}</span> : null}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {c.contacts.map(ct => (
                      <span key={ct.id} className="text-xs">
                        <span className="font-mono">{ct.label}</span>{' '}
                        {consentSummary(ct).map(s => (
                          <span key={s.channel} className="text-muted-foreground"> {s.channel}: {s.purposes.map(p => (
                            <span key={p.purpose} className={p.action === 'revoked' ? 'text-red-600' : p.action === 'granted' ? 'text-emerald-700 dark:text-emerald-400' : ''}>{p.purpose === 'transactional' ? 'service' : 'marketing'} {p.action === 'granted' ? '✓' : p.action === 'revoked' ? '✕' : 'not asked'} </span>
                          ))}</span>
                        ))}
                      </span>
                    ))}
                  </div>
                  {c.contacts.some(ct => ct.consents.length) ? (
                    <details className="text-xs">
                      <summary className="inline-flex min-h-11 cursor-pointer items-center md:min-h-0">Consent history</summary>
                      <div className="space-y-2 pt-1">
                        {c.contacts.filter(ct => ct.consents.length).map(ct => (
                          <div key={ct.id} className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2"><span className="font-mono">{ct.label}</span>{mayRevoke && ct.kind !== 'landline' && consentSummary(ct).some(s => s.purposes.some(p => p.action === 'granted')) ? <RevokeConsent contactId={ct.id} channel={ct.kind === 'email' ? 'email' : 'sms'} /> : null}</div>
                            {ct.consents.map((e, i) => <p key={i} className="break-words text-muted-foreground">{when(e.at, tz, 'day')}: {e.action === 'granted' ? 'agreed to' : 'withdrew'} {e.purpose === 'all' ? 'all' : e.purpose === 'transactional' ? 'repair' : 'marketing'} {e.channel === 'sms' ? 'texts' : e.channel === 'email' ? 'email' : 'calls'}, {label(e.method)}{e.writtenConsent ? ', in writing' : ''}</p>)}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <Meta>
                    {c.ownerships.length ? c.ownerships.map(o => o.vehicle?.label).filter(Boolean).join(' · ') : 'No vehicles'}
                    {c.businessAccount ? ` · ${c.businessAccount.name}` : ''}
                    {c.appointments[0] ? ` · last booking ${c.appointments[0].reference} ${when(c.appointments[0].startsAt, tz, 'day')} (${label(c.appointments[0].status)})` : ''}
                  </Meta>
                </div>
                <div className="flex items-center gap-3">
                  {c.ownerships[0]?.vehicle ? <Link className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/dashboard/platform/vehicles?id=${c.ownerships[0].vehicle.id}`}>Vehicle</Link> : null}
                  <Link className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/dashboard/customers/${c.id}`}>Record</Link>
                </div>
              </Row>
            )) : <Empty>{search ? 'Nobody matches that name.' : 'No customers yet. Use “Set up your shop” to load Northgate Auto Group.'}</Empty>}
          </Section>
        </>
      )}
    </Page>
  );
}
