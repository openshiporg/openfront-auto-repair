import { q, holds } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { Act, ExportBatch, MappingForm, RecordResponse, StageDay, accountingPaths } from './Actions';

type Batch = { id: string; reference: string; businessDate: string; postingStatus: string; status: string; debitTotalMinor: string; creditTotalMinor: string; providerRef: string; exportJob: { id: string } | null; shop: { name: string } | null };

/** The export is staged and NOT_POSTED. There is no ledger here: a day becomes POSTED only when a person records that the books accepted the file. */
export default async function AccountingPage({ searchParams }: { searchParams?: Promise<{ shop?: string }> }) {
  const can = await holds(['canCloseDay', 'canReadFinancials']);
  if (!can.canCloseDay && !can.canReadFinancials) return <Page title="Accounting export"><Empty>Your role is not allowed to view the accounting export.</Empty></Page>;
  const params = (await searchParams) ?? {};
  const { shops } = await q<{ shops: { id: string; name: string }[] }>(`{ shops(orderBy: { name: asc }) { id name } }`);
  const shop = shops.find((s) => s.id === params.shop) ?? shops[0];
  if (!shop) return <Page title="Accounting export"><Empty>No shops yet.</Empty></Page>;
  const { accountingBatches: batches } = await q<{ accountingBatches: Batch[] }>(`query($s: ID!) { accountingBatches(where: { shop: { id: { equals: $s } } }, orderBy: { businessDate: desc }, take: 30) { id reference businessDate postingStatus status debitTotalMinor creditTotalMinor providerRef exportJob { id } shop { name } } }`, { s: shop.id });
  const preview = await q<{ accountingJournalPreview: { sourceKeys: string[]; unmapped: string[] } }>(`query($s: ID!, $d: String!) { accountingJournalPreview(shopId: $s, businessDate: $d) }`, { s: shop.id, d: new Date().toISOString().slice(0, 10) }).then((r) => r.accountingJournalPreview).catch(() => null);
  const { accountingMappings: maps } = await q<{ accountingMappings: { sourceKey: string; accountCode: string; accountName: string }[] }>(`query($s: ID!) { accountingMappings(where: { shop: { id: { equals: $s } } }) { sourceKey accountCode accountName } }`, { s: shop.id }).catch(() => ({ accountingMappings: [] }));
  return (
    <Page title="Accounting export">
      <Meta>{shop.name}. Files are staged for your bookkeeper. Nothing here posts to a ledger.</Meta>
      {can.canCloseDay ? <Section title="Stage a day"><StageDay shopId={shop.id} />{preview?.unmapped.length ? <Meta>Not yet mapped to an account: {preview.unmapped.join(', ')}</Meta> : null}</Section> : null}
      <Section title="Staged days">
        {batches.length ? batches.map((b) => (
          <Row key={b.id}>
            <div className="min-w-0"><div className="font-medium">{b.reference} · {when(b.businessDate, 'UTC', 'day')}</div><Meta>Debits {money(b.debitTotalMinor)} · credits {money(b.creditTotalMinor)} · {label(b.status)}{b.providerRef ? ` · books ref ${b.providerRef}` : ''}</Meta>
              {can.canCloseDay && b.postingStatus === 'NOT_POSTED' && b.status === 'exported' ? <RecordResponse batchId={b.id} /> : null}</div>
            <div className="flex items-center gap-2"><Status value={b.postingStatus === 'POSTED' ? 'posted' : 'not_posted'} />{can.canCloseDay && b.postingStatus === 'NOT_POSTED' ? <ExportBatch batchId={b.id} reference={b.reference} /> : null}</div>
          </Row>
        )) : <Empty>Nothing staged yet.</Empty>}
      </Section>
      {preview && can.canCloseDay ? <Section title="Account mapping"><Meta>Each kind of money line needs an account code before a day can be staged.</Meta><MappingForm shopId={shop.id} sourceKeys={preview.sourceKeys} current={Object.fromEntries(maps.map((m) => [m.sourceKey, m]))} /></Section> : null}
    </Page>
  );
}
