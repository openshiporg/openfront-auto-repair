import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, orgTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Meta, Section, Status } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { ItemCard, type ItemView } from './InspectionItem';

type Detail = {
  id: string; status: string; version: number; startedAt: string | null; completedAt: string | null; sentAt: string | null
  technician: { name: string } | null
  templateVersion: { versionNumber: number; template: { name: string } | null } | null
  repairOrder: { id: string; roNumber: string; shop: { code: string; timeZone: string } | null; customer: { displayName: string } | null; vehicle: { label: string; lastOdometer: number | null } | null; jobs: { id: string; title: string; status: string; inspectionItemResult: { id: string } | null }[] } | null
  results: ItemView[]
};

const COLOR: Record<string, string> = { red: 'text-red-600', yellow: 'text-amber-600', green: 'text-emerald-600' };

/** The DVI tech view (tablet): items by section, measurements, condition, notes and photos. */
export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tz = await orgTimeZone();
  const d = await q<{ inspection: Detail | null }>(`query($id: ID!) { inspection(where: { id: $id }) {
    id status version startedAt completedAt sentAt technician { name } templateVersion { versionNumber template { name } }
    repairOrder { id roNumber shop { code timeZone } customer { displayName } vehicle { label lastOdometer } jobs { id title status inspectionItemResult { id } } }
    results { id condition derivedCondition overrideReason measurements notes version mediaCount
      templateItem { code section label measurement photoRequiredOn required sortOrder cannedJobCode } }
  } }`, { id });
  const i = d.inspection;
  if (!i) notFound();
  const zone = i.repairOrder?.shop?.timeZone ?? tz;
  const results = [...i.results].sort((a, b) => (a.templateItem?.sortOrder ?? 0) - (b.templateItem?.sortOrder ?? 0));
  const sections = [...new Set(results.map(r => r.templateItem?.section ?? 'Other'))];
  const counts = { red: results.filter(r => r.condition === 'red').length, yellow: results.filter(r => r.condition === 'yellow').length, open: results.filter(r => r.condition === 'not_inspected').length };
  const editable = i.status === 'in_progress';
  const findings = new Map((i.repairOrder?.jobs ?? []).filter(j => j.inspectionItemResult).map(j => [j.inspectionItemResult!.id, j]));
  return (
    <Page title={`${i.templateVersion?.template?.name ?? 'Inspection'}`} crumbs={[{ label: 'Inspections', href: '/dashboard/platform/inspections' }, { label: i.repairOrder?.roNumber ?? '', href: `/dashboard/platform/repair-orders/${i.repairOrder?.id}` }]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-base font-medium">{i.repairOrder?.vehicle?.label}</div>
          <Meta>{i.repairOrder?.customer?.displayName} · {i.repairOrder?.roNumber} · {i.technician?.name ?? 'unassigned'}{i.completedAt ? ` · completed ${when(i.completedAt, zone)}` : i.startedAt ? ` · started ${when(i.startedAt, zone)}` : ''}</Meta>
        </div>
        <div className="flex flex-wrap items-center gap-4 font-mono text-xs uppercase">
          <span className="text-red-600">{counts.red} red</span><span className="text-amber-600">{counts.yellow} yellow</span>{editable ? <span className="text-muted-foreground">{counts.open} to check</span> : null}
          <Status value={i.status} />
        </div>
      </div>
      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton op="completeShopInspection" vars={{ inspectionId: i.id, expectedVersion: i.version }} confirm="Finish the inspection? Red and yellow findings become draft jobs for the advisor." className="bg-primary text-primary-foreground">Finish inspection</ActionButton>
          <Meta>Required items must be checked, and a red item needs a photo.</Meta>
        </div>
      ) : i.status === 'assigned' ? <Meta>Not started yet.</Meta> : null}
      {sections.map(section => (
        <Section key={section} title={section}>
          <div className="grid gap-3 lg:grid-cols-2">
            {results.filter(r => (r.templateItem?.section ?? 'Other') === section).map(r => {
              const job = findings.get(r.id);
              return (
                <div key={r.id} className="space-y-1">
                  <ItemCard item={r} editable={editable} />
                  {job ? <Link href={`/dashboard/platform/repair-orders/${i.repairOrder?.id}`} className={`block px-1 text-xs ${COLOR[r.condition] ?? ''}`}>Recommended: {job.title} ({label(job.status)})</Link> : null}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
    </Page>
  );
}
