import { q, holds, orgTimeZone } from '../../lib/server';
import { when, label, money } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Stat } from '../../components/ui';
import { Act, AskPanel } from './AgentsActions';
import { TOOLS } from '@/features/keystone/agents/tools';

type Step = { index: number; tool: string; summary: string; status: string; preview?: unknown; error?: string };
type Proposal = { id: string; title: string; status: string; version: number; stepIndex: number; failure: string | null; createdAt: string; plan: Step[]; agent: { name: string } | null; invokedBy: { name: string } | null; repairOrder: { id: string; roNumber: string } | null };

/** A short plain sentence from the dry-run result: its readable fields, never ids or codes. */
const effect = (p: unknown) => {
  if (!p || typeof p !== 'object') return '';
  const skip = /(^id$|Id$|^version$|hash|key|status|^kind$|Minor$|^number$)/i;
  return Object.entries(p as Record<string, unknown>)
    .filter(([k, v]) => !skip.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length < 120)
    .slice(0, 4).map(([k, v]) => `${label(k.replace(/([A-Z])/g, '_$1').toLowerCase())} ${v}`).join(', ');
};
const total = (p: unknown) => (p && typeof p === 'object' && typeof (p as { totalMinor?: unknown }).totalMinor === 'string' ? ` Total ${money((p as { totalMinor: string }).totalMinor)}.` : '');

/** Plans assistants have made. Nothing here has changed the shop's records until a person presses Confirm on a step. */
export default async function ProposalsPage() {
  const tz = await orgTimeZone();
  const can = await holds(['canConfirmProposals']);
  let proposals: Proposal[] = []; let agents: { id: string; name: string }[] = []; let orders: { id: string; label: string }[] = []; let connected = false;
  try {
    const d = await q<any>(`{
      agentProposals(orderBy: { createdAt: desc }, take: 60) { id title status version stepIndex failure createdAt plan agent { name } invokedBy { name } repairOrder { id roNumber } }
      agentIdentities(where: { status: { equals: "active" }, paused: { equals: false } }, orderBy: { name: asc }) { id name }
      repairOrders(where: { status: { in: ["checked_in", "in_service", "on_hold"] } }, orderBy: { createdAt: desc }, take: 40) { id roNumber vehicle { year make model } }
      aiProviderStatus }`);
    proposals = d.agentProposals; agents = d.agentIdentities;
    orders = d.repairOrders.map((r: any) => ({ id: r.id, label: `${r.roNumber} · ${[r.vehicle?.year, r.vehicle?.make, r.vehicle?.model].filter(Boolean).join(' ')}` }));
    connected = d.aiProviderStatus?.connected === true;
  } catch {}
  const waiting = proposals.filter(p => p.status === 'previewed');
  const tools = TOOLS.filter(t => !['draft_message', 'draft_dispute_email'].includes(t.name)).map(t => ({ tool: t.name, label: t.description.split('.')[0] }));
  return (
    <Page title="Assistant plans">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Waiting for you" value={<span className={`font-mono text-base ${waiting.length ? 'text-amber-600' : ''}`}>{waiting.length}</span>} />
        <Stat name="Done" value={<span className="font-mono text-base">{proposals.filter(p => p.status === 'executed').length}</span>} />
        <Stat name="Out of date or refused" value={<span className="font-mono text-base">{proposals.filter(p => ['stale', 'failed', 'rejected'].includes(p.status)).length}</span>} />
      </div>
      {can.canConfirmProposals ? <Section title="Ask an assistant"><AskPanel agents={agents} orders={orders} tools={tools} connected={connected} /></Section> : null}
      <Section title="Plans">
        {proposals.length ? proposals.map(p => (
          <Row key={p.id}>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{p.title}</span><Status value={p.status} /></div>
              <Meta>{p.agent?.name} · asked by {p.invokedBy?.name ?? 'someone'} · {when(p.createdAt, tz)}{p.repairOrder ? ` · repair order ${p.repairOrder.roNumber}` : ''}</Meta>
              {(() => {
                const steps = (
                  <ol className="space-y-1 text-sm">
                    {(p.plan ?? []).map(s => (
                      <li key={s.index} className="min-w-0 break-words"><span className="font-medium">{s.index + 1}. {s.summary}</span> <Meta>{s.status === 'done' ? 'done' : s.status === 'failed' ? `did not run${s.error ? `: ${s.error}` : ''}` : s.index === p.stepIndex && p.status === 'previewed' ? 'next' : ''}</Meta>
                        {effect(s.preview) || total(s.preview) ? <div className="text-xs text-muted-foreground">Will: {effect(s.preview) || 'make this change'}.{total(s.preview)}</div> : null}</li>
                    ))}
                  </ol>
                );
                // Only a plan waiting for a decision shows its steps open; finished and out-of-date plans fold away.
                return p.status === 'previewed' ? steps : <details><summary className="min-h-11 cursor-pointer py-3 text-sm">Steps ({(p.plan ?? []).length})</summary>{steps}</details>;
              })()}
              {p.failure ? <p className="break-words text-sm text-red-600">{p.failure}</p> : null}
              {p.status === 'stale' ? <p className="text-sm">The record changed after this was previewed, so nothing more ran. Ask for a new plan.</p> : null}
            </div>
            {p.status === 'previewed' && can.canConfirmProposals ? (
              <div className="flex flex-wrap items-start gap-2">
                <Act strong op="confirmAgentProposal" vars={{ proposalId: p.id, expectedVersion: p.version }}>Confirm step {p.stepIndex + 1}</Act>
                <Act op="rejectAgentProposal" vars={{ proposalId: p.id, expectedVersion: p.version }}>Reject</Act>
              </div>
            ) : null}
          </Row>
        )) : <Empty>No plans yet.</Empty>}
      </Section>
    </Page>
  );
}
