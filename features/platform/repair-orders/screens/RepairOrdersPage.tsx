import { BOARD_LABELS } from '@/lib/board';
import { q, orgTimeZone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status, Tabs } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { RO_CARD, type RoCard } from '../lib/queries';

const VIEWS: Record<string, { label: string; statuses: string[] }> = {
  open: { label: 'Open', statuses: ['checked_in', 'in_service', 'on_hold', 'ready_to_invoice'] },
  done: { label: 'Invoiced and closed', statuses: ['invoiced', 'closed'] },
  void: { label: 'Void', statuses: ['void'] },
};

/** Repair orders, and the signed check-ins still waiting to be opened as one. */
export default async function RepairOrdersPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const params = (await searchParams) ?? {};
  const view = VIEWS[params.view ?? ''] ? params.view! : 'open';
  const tz = await orgTimeZone();
  const d = await q<{ repairOrders: RoCard[]; waiting: { id: string; reference: string; at: string; signerName: string; shop: { name: string } | null; customer: { displayName: string } | null; vehicle: { label: string } | null }[] }>(`query($statuses: [String!]) {
    repairOrders(where: { status: { in: $statuses } }, orderBy: { openedAt: desc }, take: 100) { ${RO_CARD} }
    waiting: checkIns(where: { repairOrder: null, signedAt: { not: null } }, orderBy: { at: desc }, take: 20) { id reference at signerName shop { name } customer { displayName } vehicle { label } }
  }`, { statuses: VIEWS[view].statuses });

  return (
    <Page title="Repair orders">
      {d.waiting.length ? (
        <Section title="Checked in, not yet opened">
          {d.waiting.map(c => (
            <Row key={c.id}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.customer?.displayName}</span><span className="font-mono text-xs text-muted-foreground">{c.shop?.name} · {c.reference}</span></div>
                <Meta>{c.vehicle?.label} · signed by {c.signerName} · {when(c.at, tz)}</Meta>
              </div>
              <ActionButton op="openShopRepairOrder" vars={{ input: { checkInId: c.id } }} className="bg-primary text-primary-foreground">Open repair order</ActionButton>
            </Row>
          ))}
        </Section>
      ) : null}
      <Tabs active={view} items={Object.entries(VIEWS).map(([k, v]) => ({ key: k, label: v.label, href: `/dashboard/platform/repair-orders?view=${k}` }))} />
      <Section title={VIEWS[view].label}>
        {d.repairOrders.length ? d.repairOrders.map(ro => (
          <Row key={ro.id} href={`/dashboard/platform/repair-orders/${ro.id}`}>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{ro.roNumber}</span><span className="font-medium">{ro.customer?.displayName}</span><span className="font-mono text-xs text-muted-foreground">{ro.shop?.name}</span></div>
              <Meta>{ro.vehicle?.label} · {ro.jobs.length} job{ro.jobs.length === 1 ? '' : 's'} · advisor {ro.serviceAdvisor?.name ?? 'none'} · opened {when(ro.openedAt, ro.shop?.timeZone ?? tz)}</Meta>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono text-sm">{money(ro.currentTotalMinor)}</span>
              {view === 'open' ? <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{BOARD_LABELS[ro.boardStage] ?? ro.boardStage}</span> : <Status value={ro.status} />}
            </div>
          </Row>
        )) : <Empty>No repair orders here.</Empty>}
      </Section>
    </Page>
  );
}
