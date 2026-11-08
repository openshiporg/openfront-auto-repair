import Link from 'next/link';
import { BOARD_LABELS, promisedRisk } from '@/lib/board';
import { orgTimeZone } from '../../lib/server';
import { money, when, label } from '../../lib/format';
import { Page, Empty, Meta, Tabs } from '../../components/ui';
import { openRepairOrders, type RoCard } from '../lib/queries';

const COLUMNS = ['checked_in', 'inspecting', 'estimating', 'awaiting_authorization', 'waiting_parts', 'in_progress', 'quality_check', 'on_hold', 'ready'] as const;

const RISK: Record<string, { text: string; cls: string }> = {
  late: { text: 'LATE', cls: 'text-red-600' },
  due_soon: { text: 'DUE WITHIN THE HOUR', cls: 'text-amber-600' },
};

function Card({ ro, tz, now }: { ro: RoCard; tz: string; now: Date }) {
  const risk = RISK[promisedRisk(ro.promisedAt, now, ro.status === 'ready_to_invoice')];
  const callbacks = ro.tasks.length;
  return (
    <Link href={`/dashboard/platform/repair-orders/${ro.id}`} className="block rounded-lg border bg-background p-3 text-sm shadow-xs hover:bg-muted/40">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">{ro.roNumber}</span>
        <span className="font-mono text-xs text-muted-foreground">{ro.shop?.code}{ro.keyTag ? ` · KEY ${ro.keyTag}` : ''}</span>
      </div>
      <div className="mt-1 font-medium">{ro.customer?.displayName}</div>
      <div className="truncate text-xs text-muted-foreground">{ro.vehicle?.label}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {ro.promisedAt ? <Meta>Promised {when(ro.promisedAt, ro.shop?.timeZone ?? tz)}</Meta> : <Meta>No promise time</Meta>}
        {risk ? <span className={`font-mono text-xs ${risk.cls}`}>{risk.text}</span> : null}
        {ro.waiter ? <span className="font-mono text-xs">WAITER</span> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Meta>{ro.jobs.length} job{ro.jobs.length === 1 ? '' : 's'} · {money(ro.currentTotalMinor)}</Meta>
        {ro.status === 'on_hold' && ro.holdReason && ro.holdReason !== 'none' ? <span className="font-mono text-xs text-amber-600">{label(ro.holdReason).toUpperCase()}</span> : null}
        {callbacks ? <span className="font-mono text-xs text-amber-600">{callbacks} CALLBACK{callbacks === 1 ? '' : 'S'}</span> : null}
      </div>
    </Link>
  );
}

/**
 * The work board: every open repair order by stage. A stage is derived from the jobs and inspections
 * (lib/board.ts), so the board never disagrees with the repair order.
 */
export default async function BoardPage({ searchParams }: { searchParams?: Promise<{ shop?: string }> }) {
  const params = (await searchParams) ?? {};
  const tz = await orgTimeZone();
  const { repairOrders, shops } = await openRepairOrders(params.shop);
  const now = new Date();
  const by = new Map<string, RoCard[]>(COLUMNS.map(c => [c, []]));
  for (const ro of repairOrders) (by.get(ro.boardStage) ?? by.get('checked_in')!).push(ro);
  const late = repairOrders.filter(ro => promisedRisk(ro.promisedAt, now, ro.status === 'ready_to_invoice') === 'late').length;
  const waiting = by.get('awaiting_authorization')!.length;

  return (
    <Page title="Work board">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs active={params.shop ?? 'all'} items={[{ key: 'all', label: 'All shops', href: '/dashboard/platform/board' }, ...shops.map(s => ({ key: s.id, label: s.code, href: `/dashboard/platform/board?shop=${s.id}` }))]} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          <span>{repairOrders.length} open</span>
          <span className={waiting ? 'text-amber-600' : ''}>{waiting} waiting on customer</span>
          <span className={late ? 'text-red-600' : ''}>{late} late</span>
        </div>
      </div>
      {repairOrders.length ? (
        <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
          <div className="grid auto-cols-[15rem] grid-flow-col gap-3 pb-2 max-md:auto-cols-[85%]">
            {COLUMNS.map(stage => {
              const cards = by.get(stage)!;
              return (
                <div key={stage} className="min-w-0 space-y-2 rounded-lg bg-muted/50 p-2">
                  <div className="flex items-center justify-between px-1 pt-1">
                    <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{BOARD_LABELS[stage]}</span>
                    <span className="font-mono text-xs text-muted-foreground">{cards.length}</span>
                  </div>
                  {cards.map(ro => <Card key={ro.id} ro={ro} tz={tz} now={now} />)}
                </div>
              );
            })}
          </div>
        </div>
      ) : <Empty>No open repair orders. Check a vehicle in to start one.</Empty>}
    </Page>
  );
}
