import { q, holds } from '../../lib/server';
import { money, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { SaveSnapshot } from './Actions';

type Report = { shopName: string; values: Record<string, any>; definitions: Record<string, string>; labels: Record<string, string> };
type Check = { key: string; label: string; ok: boolean; expected: string; actual: string; differences: string[] };

const day = (d: Date) => d.toISOString().slice(0, 10);

const NAMES: Record<string, string> = {
  carCount: 'Cars', salesMinor: 'Sales', refundedSalesMinor: 'Refunded sales', aroMinor: 'Average repair order', laborSalesMinor: 'Labor sales', refundedLaborMinor: 'Refunded labor',
  billedCentiHours: 'Hours billed', elrMinor: 'Effective labor rate', laborCostMinor: 'Labor cost', partsSalesMinor: 'Parts sales', partsCostMinor: 'Parts cost', gpMinor: 'Gross profit', gpPct: 'Gross profit margin',
  costComplete: 'Cost known for every part', approvedJobs: 'Jobs approved', declined: 'Jobs declined', deferred: 'Jobs put off', ratePct: 'Rate', approvedMinor: 'Approved amount', declinedMinor: 'Declined amount',
  dollarRatePct: 'Rate by amount', repairOrders: 'Repair orders', inspected: 'Inspected', comebacks: 'Comebacks', released: 'Cars released', averageHours: 'Average hours in the shop',
  flaggedCentiHours: 'Flagged hours', shiftCentiHours: 'Shift hours', jobClockCentiHours: 'Job clock hours', productivityPct: 'Productivity', efficiencyPct: 'Efficiency', proficiencyPct: 'Proficiency',
};
const HIDDEN = new Set(['gpPctScale', 'hidden', 'technicianId', 'name']);
const nameOf = (key: string) => NAMES[key] ?? label(key.replace(/([A-Z])/g, ' $1').toLowerCase());

function show(key: string, v: unknown, all: Record<string, unknown> = {}): string {
  if (v === null || v === undefined) return '—';
  if (/minor$/i.test(key)) return money(String(v));
  if (/centihours$/i.test(key)) return (Number(v) / 100).toFixed(2);
  if (key === 'gpPct') return `${(Number(v) / Number(all.gpPctScale ?? 100)).toFixed(2)}%`;
  if (/pct$/i.test(key)) return `${v}%`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return '—';
}

/** Every number is printed beside its definition (C27), so two shops reading the same figure mean the same thing. */
export default async function ReportsPage({ searchParams }: { searchParams?: Promise<{ shop?: string; from?: string; to?: string }> }) {
  const can = await holds(['canReadReports', 'canReadFinancials']);
  if (!can.canReadReports && !can.canReadFinancials) return <Page title="Reports"><Empty>Your role is not allowed to view reports.</Empty></Page>;
  const params = (await searchParams) ?? {};
  const { shops } = await q<{ shops: { id: string; name: string }[] }>(`{ shops(orderBy: { name: asc }) { id name } }`);
  const shop = shops.find((s) => s.id === params.shop) ?? shops[0];
  if (!shop) return <Page title="Reports"><Empty>No shops yet.</Empty></Page>;
  const to = params.to ?? day(new Date());
  const from = params.from ?? day(new Date(Date.now() - 29 * 86_400_000));
  const report = await q<{ shopReports: Report }>(`query($s: ID!, $f: String!, $t: String!) { shopReports(shopId: $s, from: $f, to: $t) }`, { s: shop.id, f: from, t: to }).then((r) => r.shopReports).catch((e) => ({ error: String(e.message) }));
  const ties = can.canReadFinancials ? await q<{ shopTieOuts: { checks: Check[] } }>(`query($s: ID!) { shopTieOuts(shopId: $s) }`, { s: shop.id }).then((r) => r.shopTieOuts.checks).catch(() => null) : null;
  return (
    <Page title="Reports">
      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">Shop<select name="shop" defaultValue={shop.id} className="block h-9 rounded-md border bg-background px-2 text-sm">{shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">From<input type="date" name="from" defaultValue={from} className="block h-9 rounded-md border bg-background px-2 text-sm" /></label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">To<input type="date" name="to" defaultValue={to} className="block h-9 rounded-md border bg-background px-2 text-sm" /></label>
        <button className="h-9 rounded-md border px-3">Show</button>
      </form>
      {'error' in report ? <Empty>{report.error}</Empty> : (
        <>
          <Meta>{report.shopName} · {from} to {to}. Computed when you open this page from finalized invoices, clocks and decisions.</Meta>
          {Object.entries(report.values).map(([key, value]) => (
            <Section key={key} title={report.labels[key] ?? label(key)}>
              <p className="text-sm text-muted-foreground">{report.definitions[key]}</p>
              {Array.isArray((value as any)?.technicians)
                ? (value as any).technicians.length ? (value as any).technicians.map((t: Record<string, unknown>, i: number) => (
                    <Row key={i}><span className="min-w-0 break-words text-sm font-medium">{String(t.name ?? 'Technician')}</span><span className="min-w-0 break-words text-xs">{Object.entries(t).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => `${nameOf(k)} ${show(k, v)}`).join(' · ')}</span></Row>
                  )) : <Empty>Nothing in this period.</Empty>
                : value && typeof value === 'object'
                  ? <>
                      {(value as any).hidden ? <Meta>Cost is shown only to roles that can see pay rates.</Meta> : null}
                      {Object.entries(value).filter(([k]) => !HIDDEN.has(k)).map(([k, v]) => <Row key={k}><span className="min-w-0 break-words text-sm">{nameOf(k)}</span><span className="font-mono text-sm">{show(k, v, value as Record<string, unknown>)}</span></Row>)}
                    </>
                  : <Row><span className="font-mono text-sm">{show(key, value)}</span></Row>}
            </Section>
          ))}
          <Section title="Keep this report" aside={<SaveSnapshot shopId={shop.id} from={from} to={to} />}><Meta>A saved copy keeps its numbers and definitions as they are today.</Meta></Section>
        </>
      )}
      {ties ? (
        <Section title="Books tie-outs">
          <Meta>Each check compares two independent sums. A difference names the records.</Meta>
          {ties.map((c) => <Row key={c.key}><div className="min-w-0"><div className="font-medium">{c.label}</div>{c.differences.map((d, i) => <Meta key={i}>{d}</Meta>)}</div><Status value={c.ok ? 'ok' : 'failed'} /></Row>)}
        </Section>
      ) : null}
    </Page>
  );
}
