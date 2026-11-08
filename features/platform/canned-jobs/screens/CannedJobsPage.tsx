import Link from 'next/link';
import { q } from '../../lib/server';
import { label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CannedJobEditor } from './CannedJobEditor';

type Version = { id: string; versionNumber: number; status: string; kind: string; lines: Record<string, unknown>[] | null; customerDescription: string; publishedAt: string | null; version: number };
type Job = { id: string; code: string; name: string; category: string; active: boolean; shop: { name: string } | null; currentVersion: { id: string; versionNumber: number } | null; versions: Version[] };

/** The canned job editor: the shop's job templates, drafted and then published. A sent estimate never changes when a template does. */
export default async function CannedJobsPage({ searchParams }: { searchParams?: Promise<{ job?: string }> }) {
  const params = (await searchParams) ?? {};
  const d = await q<{ cannedJobs: Job[] }>(`query {
    cannedJobs(orderBy: { code: asc }, take: 200) { id code name category active shop { name } currentVersion { id versionNumber }
      versions(orderBy: { versionNumber: desc }, take: 4) { id versionNumber status kind lines customerDescription publishedAt version } }
  }`);
  const selected = d.cannedJobs.find(j => j.id === params.job) ?? null;
  const draft = selected?.versions.find(v => v.status === 'draft') ?? null;
  const base = draft ?? selected?.versions.find(v => v.status === 'published') ?? null;

  return (
    <Page title="Canned jobs">
      {selected ? (
        <Section title={`${selected.code} · ${selected.name}`} aside={<Link className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href="/dashboard/platform/canned-jobs">All canned jobs</Link>}>
          <div className="flex flex-wrap items-center gap-3">
            {selected.versions.map(v => <span key={v.id} className="inline-flex items-center gap-2 text-sm">v{v.versionNumber} <Status value={v.status} /></span>)}
            {draft ? <ActionButton op="publishCannedJobVersion" vars={{ versionId: draft.id, expectedVersion: draft.version }} confirm={`Publish v${draft.versionNumber}? New jobs will copy it. Jobs already on repair orders keep their lines.`} className="bg-primary text-primary-foreground">Publish v{draft.versionNumber}</ActionButton> : null}
            <ActionButton op="setCannedJobStatus" vars={{ cannedJobId: selected.id, active: !selected.active }}>{selected.active ? 'Hide from new jobs' : 'Show for new jobs'}</ActionButton>
          </div>
          <CannedJobEditor
            key={base?.id ?? 'new'}
            cannedJobId={selected.id}
            name={selected.name}
            category={selected.category}
            kind={base?.kind ?? 'repair'}
            description={base?.customerDescription ?? ''}
            lines={base?.lines ?? []}
            editingDraft={Boolean(draft)}
          />
        </Section>
      ) : (
        <>
          <Section title="New canned job"><CannedJobEditor cannedJobId={null} name="" category="" kind="repair" description="" lines={[]} editingDraft={false} /></Section>
          <Section title={`Canned jobs (${d.cannedJobs.length})`}>
            {d.cannedJobs.length ? d.cannedJobs.map(j => {
              const v = j.versions.find(x => x.status === 'published');
              const drafting = j.versions.some(x => x.status === 'draft');
              return (
                <Row key={j.id} href={`/dashboard/platform/canned-jobs?job=${j.id}`} className={j.active ? '' : 'opacity-60'}>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{j.code}</span><span className="font-medium">{j.name}</span></div>
                    <Meta>{label(j.category) || 'uncategorized'} · {j.shop?.name ?? 'all shops'} · {v ? `v${v.versionNumber}, ${(v.lines ?? []).length} lines` : 'not published'}{drafting ? ' · draft in progress' : ''}</Meta>
                  </div>
                  <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{j.active ? 'In use' : 'Hidden'}</span>
                </Row>
              );
            }) : <Empty>No canned jobs yet.</Empty>}
          </Section>
        </>
      )}
    </Page>
  );
}
