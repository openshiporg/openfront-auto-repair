import { q, holdsAny } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat, Status } from '../../components/ui';

type Acct = { id: string; name: string; accountNumber: string; status: string; termsDays: number; creditLimitMinor: string; openBalanceMinor: string; poRequired: boolean; taxExempt: boolean; billingMode: string; holdReason: string };

/** Business and fleet accounts, with the ones on credit hold first. */
export default async function AccountsPage() {
  if (!(await holdsAny(['canReadRepairOrders', 'canManageCustomers']))) return <Page title="Accounts"><Empty>Your role is not allowed to view accounts.</Empty></Page>;
  const { businessAccounts } = await q<{ businessAccounts: Acct[] }>(`{ businessAccounts(orderBy: { name: asc }, take: 200) { id name accountNumber status termsDays creditLimitMinor openBalanceMinor poRequired taxExempt billingMode holdReason } }`);
  const held = businessAccounts.filter(a => a.status === 'credit_hold');
  const rows = [...held, ...businessAccounts.filter(a => a.status !== 'credit_hold')];
  const owed = businessAccounts.reduce((s, a) => s + BigInt(a.openBalanceMinor), 0n);
  return (
    <Page title="Accounts">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Accounts" value={<span className="font-mono text-base">{businessAccounts.length}</span>} />
        <Stat name="Owed by accounts" value={<span className="font-mono text-base">{money(owed.toString())}</span>} />
        <Stat name="On credit hold" value={<span className={`font-mono text-base ${held.length ? 'text-red-600' : ''}`}>{held.length}</span>} />
      </div>
      <Section title="All accounts">
        {rows.length ? rows.map(a => (
          <Row key={a.id} href={`/dashboard/platform/accounts/${a.id}`}>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{a.name}</span><Status value={a.status} /></div>
              <Meta>{a.accountNumber} · {a.termsDays ? `Net ${a.termsDays}` : 'Due on receipt'}{a.poRequired ? ' · PO required' : ''}{a.taxExempt ? ' · Tax exempt' : ''}</Meta>
              {a.status === 'credit_hold' && a.holdReason ? <Meta>{a.holdReason}</Meta> : null}
            </div>
            <div className="text-right"><span className="font-mono text-sm">{money(a.openBalanceMinor)}</span><div><Meta>of {BigInt(a.creditLimitMinor) ? money(a.creditLimitMinor) : 'no limit'}</Meta></div></div>
          </Row>
        )) : <Empty>No business accounts yet.</Empty>}
      </Section>
    </Page>
  );
}
