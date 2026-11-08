import { q, orgTimeZone } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat, Status, Tabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CloseDayForm, ReopenDayForm } from './BillingForms';
import { Refresher } from './Refresher';

type Shop = { id: string; code: string; name: string; timeZone: string };
type Close = { id: string; businessDate: string; expectedCashMinor: string; drawerCountMinor: string; varianceMinor: string; varianceReason: string; status: string; closedAt: string | null; closedBy: { name: string } | null };

const TENDER: Record<string, string> = { cash: 'Cash', check: 'Checks', card_present: 'Cards on the terminal', card_link: 'Cards by link', tap_to_pay: 'Tap to pay', ach: 'Bank transfers', financing: 'Financing', store_credit: 'Store credit', gift_card: 'Gift cards', account_credit: 'Account credit' };
const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

/** Day close: what came in by tender, the cash that should be in the drawer, the count, and the frozen result. */
export default async function DayClosePage({ searchParams }: { searchParams?: Promise<{ shop?: string; date?: string }> }) {
  const params = (await searchParams) ?? {};
  const tz = await orgTimeZone();
  const { shops } = await q<{ shops: Shop[] }>(`{ shops(orderBy: { code: asc }) { id code name timeZone } }`);
  const shop = shops.find(s => s.id === params.shop) ?? shops[0];
  if (!shop) return <Page title="Day close"><Empty>No shop yet.</Empty></Page>;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayIn(shop.timeZone || tz);
  const [summary, closes] = await Promise.all([
    q<{ shopDaySummary: { tenders: Record<string, string>; expectedCashMinor: string; unresolvedPayments: number } }>(`query($s: ID!, $d: String!) { shopDaySummary(shopId: $s, businessDate: $d) }`, { s: shop.id, d: date }).then(d => d.shopDaySummary),
    q<{ businessDayCloses: Close[] }>(`query($s: ID!) { businessDayCloses(where: { shop: { id: { equals: $s } } }, orderBy: { businessDate: desc }, take: 14) { id businessDate expectedCashMinor drawerCountMinor varianceMinor varianceReason status closedAt closedBy { name } } }`, { s: shop.id }).then(d => d.businessDayCloses),
  ]);
  const closed = closes.find(c => c.businessDate.slice(0, 10) === date && c.status === 'closed');
  const nice = (iso: string) => when(`${iso.slice(0, 10)}T12:00:00Z`, 'UTC', 'day');
  const net = Object.entries(summary.tenders).filter(([, v]) => v !== '0');
  return (
    <Page title="Day close">
      {summary.unresolvedPayments ? <Refresher /> : null}
      <Tabs active={shop.id} items={shops.map(s => ({ key: s.id, label: s.name, href: `/dashboard/platform/day-close?shop=${s.id}` }))} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Business day" value={<span className="text-base">{nice(date)}</span>} />
        <Stat name="Cash that should be there" value={<span className="font-mono text-base">{money(summary.expectedCashMinor)}</span>} />
        <Stat name="Card payments unsettled" value={<span className={`font-mono text-base ${summary.unresolvedPayments ? 'text-amber-600' : ''}`}>{summary.unresolvedPayments}</span>} />
      </div>
      <Section title="Taken today, after refunds">
        {net.length ? net.map(([k, v]) => <Row key={k}><span>{TENDER[k] ?? label(k)}</span><span className="font-mono">{money(v)}</span></Row>) : <Empty>Nothing taken on this day.</Empty>}
      </Section>
      <Section title="Count the drawer">
        {closed ? (
          <div className="space-y-2">
            <p className="text-sm">Closed {closed.closedAt ? when(closed.closedAt, shop.timeZone || tz) : ''} by {closed.closedBy?.name ?? 'staff'}. Counted {money(closed.drawerCountMinor)}; difference {money(closed.varianceMinor)}{closed.varianceReason ? `, ${closed.varianceReason}` : ''}.</p>
            <ReopenDayForm dayCloseId={closed.id} />
          </div>
        ) : summary.unresolvedPayments ? (
          <div className="space-y-2"><Meta>A card payment has not settled yet. It is being checked now; close the day once it has.</Meta><ActionButton op="resolveShopPayments" vars={{ shopId: shop.id }}>Check them now</ActionButton></div>
        ) : <CloseDayForm shopId={shop.id} businessDate={date} expectedMinor={summary.expectedCashMinor} />}
      </Section>
      <Section title="Recent days">
        {closes.length ? closes.map(c => (
          <Row key={c.id} href={`/dashboard/platform/day-close?shop=${shop.id}&date=${c.businessDate.slice(0, 10)}`}>
            <div className="min-w-0 space-y-1"><div>{nice(c.businessDate)}</div><Meta>Counted {money(c.drawerCountMinor)} of {money(c.expectedCashMinor)} · difference {money(c.varianceMinor)}</Meta></div>
            <Status value={c.status === 'closed' ? 'closed' : 'open'} />
          </Row>
        )) : <Empty>No days closed yet.</Empty>}
      </Section>
    </Page>
  );
}
