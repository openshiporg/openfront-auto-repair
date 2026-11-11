import { q, holdsAny } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Row, Empty, Meta, Section } from '../../components/ui';
import { ExportOne, ExportPeriod } from './AccountActions';

type Stmt = { id: string; reference: string; periodStart: string; periodEnd: string; openingMinor: string; chargesMinor: string; paymentsMinor: string; closingMinor: string; exportedAt: string | null; businessAccount: { name: string } | null };

/** Statements by account and month. They are files to download, never sent. */
export default async function StatementsPage() {
  if (!(await holdsAny(['canReadFinancials']))) return <Page title="Statements"><Empty>Your role is not allowed to view statements.</Empty></Page>;
  const { statements } = await q<{ statements: Stmt[] }>(`{ statements(orderBy: { periodStart: desc }, take: 100) { id reference periodStart periodEnd openingMinor chargesMinor paymentsMinor closingMinor exportedAt businessAccount { name } } }`);
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  return (
    <Page title="Statements">
      <Section title="Last month" aside={<ExportPeriod start={start} end={end} label="Export all monthly accounts" />}>
        <Meta>{when(start, 'UTC', 'day')} to {when(end, 'UTC', 'day')}. Makes any statement that is missing, then downloads one file with every monthly account.</Meta>
      </Section>
      <Section title="Made so far">
        {statements.length ? statements.map(s => (
          <Row key={s.id}>
            <div className="min-w-0 space-y-1"><span className="break-words text-sm font-medium">{s.businessAccount?.name}</span><div><Meta><span className="font-mono">{s.reference}</span> · {when(s.periodStart, 'UTC', 'day')} to {when(s.periodEnd, 'UTC', 'day')}{s.exportedAt ? ` · exported ${when(s.exportedAt, 'America/Los_Angeles', 'day')}` : ''}</Meta></div></div>
            <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-sm">{money(s.closingMinor)}</span><ExportOne statementId={s.id} /></div>
          </Row>
        )) : <Empty>No statements yet.</Empty>}
      </Section>
    </Page>
  );
}
