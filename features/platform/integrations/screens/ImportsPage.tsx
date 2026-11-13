import { q, holds } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { Act, ImportForm, importPaths } from './Actions';

type Job = { id: string; reference: string; format: string; entity: string; status: string; fileName: string; rowCount: number; preview: { externalId: string; action: string; reason?: string; summary?: string }[] | null; result: Record<string, number> | null; createdAt: string };

/** Preview first: each row shows what would happen. Applying twice changes nothing, because every row keeps the id it had in the old system. */
export default async function ImportsPage() {
  const can = await holds(['canManageIntegrations']);
  if (!can.canManageIntegrations) return <Page title="Imports"><Empty>Your role is not allowed to import data.</Empty></Page>;
  const { shops, importJobs: jobs } = await q<{ shops: { id: string; name: string }[]; importJobs: Job[] }>(`{ shops(orderBy: { name: asc }) { id name } importJobs(orderBy: { createdAt: desc }, take: 20) { id reference format entity status fileName rowCount preview result createdAt } }`);
  return (
    <Page title="Imports">
      <Meta>Imported people have no marketing consent. Nothing is changed until you apply a previewed file.</Meta>
      {shops[0] ? <Section title="New import"><ImportForm shopId={shops[0].id} /></Section> : null}
      {jobs.length ? jobs.map((j) => (
        <Section key={j.id} title={`${j.reference} · ${label(j.entity)} from ${label(j.format)}`} aside={j.status === 'previewed' ? <span className="flex gap-2"><Act op="applyDataImport" vars={{ jobId: j.id }} paths={importPaths} tone="primary">Apply</Act><Act op="discardDataImport" vars={{ jobId: j.id }} paths={importPaths}>Discard</Act></span> : <Status value={j.status} />}>
          <Meta>{j.fileName || 'file'} · {j.rowCount} rows · {when(j.createdAt)}{j.result ? ` · ${Object.entries(j.result).map(([k, v]) => `${v} ${label(k)}`).join(', ')}` : ''}</Meta>
          {j.status === 'previewed' && j.preview ? (
            <details><summary className="cursor-pointer py-1 text-sm">Rows ({j.preview.length})</summary>
              {j.preview.slice(0, 200).map((p, i) => <Row key={i}><span className="font-mono text-xs">{p.externalId || 'no id'}</span><span className="text-sm">{label(p.action)}{p.reason ? ` · ${p.reason}` : p.summary ? ` · ${p.summary}` : ''}</span></Row>)}
            </details>
          ) : null}
        </Section>
      )) : <Empty>No imports yet.</Empty>}
    </Page>
  );
}
