import { q, orgTimeZone } from '../../lib/server';
import { when } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status, Tabs } from '../../components/ui';

type Item = {
  id: string; status: string; startedAt: string | null; completedAt: string | null; createdAt: string
  technician: { name: string } | null; templateVersion: { template: { name: string } | null } | null
  repairOrder: { id: string; roNumber: string; shop: { name: string; timeZone: string } | null; customer: { displayName: string } | null; vehicle: { label: string } | null } | null
  red: number; yellow: number; open: number
}

const VIEWS: Record<string, string[]> = { open: ['assigned', 'in_progress'], done: ['completed', 'sent'] };

/** The technician's queue: inspections waiting or in progress, then the finished ones. */
export default async function InspectionsPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const params = (await searchParams) ?? {};
  const view = params.view === 'done' ? 'done' : 'open';
  const tz = await orgTimeZone();
  const d = await q<{ inspections: Item[] }>(`query($statuses: [String!]) {
    inspections(where: { status: { in: $statuses } }, orderBy: { createdAt: desc }, take: 60) {
      id status startedAt completedAt createdAt technician { name } templateVersion { template { name } }
      repairOrder { id roNumber shop { name timeZone } customer { displayName } vehicle { label } }
      red: resultsCount(where: { condition: { equals: "red" } })
      yellow: resultsCount(where: { condition: { equals: "yellow" } })
      open: resultsCount(where: { condition: { equals: "not_inspected" } })
    }
  }`, { statuses: VIEWS[view] });
  return (
    <Page title="Inspections">
      <Tabs active={view} items={[{ key: 'open', label: 'To do', href: '/dashboard/platform/inspections' }, { key: 'done', label: 'Finished', href: '/dashboard/platform/inspections?view=done' }]} />
      <Section title={view === 'open' ? 'Waiting and in progress' : 'Finished'}>
        {d.inspections.length ? d.inspections.map(i => (
          <Row key={i.id} href={`/dashboard/platform/inspections/${i.id}`}>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.repairOrder?.vehicle?.label}</span><span className="font-mono text-xs text-muted-foreground">{i.repairOrder?.shop?.name} · {i.repairOrder?.roNumber}</span></div>
              <Meta>{i.repairOrder?.customer?.displayName} · {i.templateVersion?.template?.name} · {i.technician?.name ?? 'unassigned'} · {when(i.completedAt ?? i.startedAt ?? i.createdAt, i.repairOrder?.shop?.timeZone ?? tz)}</Meta>
            </div>
            <div className="flex items-center gap-4 font-mono text-xs">
              {i.red ? <span className="text-red-600">{i.red} RED</span> : null}
              {i.yellow ? <span className="text-amber-600">{i.yellow} YELLOW</span> : null}
              {view === 'open' && i.open ? <span className="text-muted-foreground">{i.open} TO CHECK</span> : null}
              <Status value={i.status} />
            </div>
          </Row>
        )) : <Empty>{view === 'open' ? 'No inspections waiting. Start one from a repair order.' : 'No finished inspections yet.'}</Empty>}
      </Section>
    </Page>
  );
}
