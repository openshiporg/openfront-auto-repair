import { q, holds } from '../../lib/server';
import { money, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { SaveSnapshot } from './Actions';

type Report = { shopName: string; values: Record<string, any>; definitions: Record<string, string>; labels: Record<string, string> };
type Check = { key: string; label: string; ok: boolean; expected: string; actual: string; differences: string[] };

const day = (d: Date) => d.toISOString().slice(0, 10);

function show(key: string, v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' && /^-?\d+$/.test(v) && /minor$/i.test(key)) return money(v);
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
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
              {value && typeof value === 'object' && !Array.isArray(value)
                ? Object.entries(value).map(([k, v]) => <Row key={k}><span className="text-sm">{label(k.replace(/([A-Z])/g, ' $1').toLowerCase())}</span><span className="font-mono text-sm">{show(k, v)}</span></Row>)
                : Array.isArray(value)
                  ? value.length ? value.map((item: any, i: number) => <Row key={i}><span className="text-sm">{item.name ?? item.technicianId ?? i + 1}</span><span className="font-mono text-xs">{Object.entries(item).filter(([k]) => k !== 'name' && k !== 'technicianId').map(([k, v]) => `${label(k)} ${show(k, v)}`).join(' · ')}</span></Row>) : <Empty>Nothing in this period.</Empty>
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
