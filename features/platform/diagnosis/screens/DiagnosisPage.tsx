import { q, holds, orgTimeZone } from '../../lib/server';
import { when, label, percent } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Stat } from '../../components/ui';
import { Act } from '../../agents/screens/AgentsActions';
import { HypothesisForm, QuoteReadyForm, StartSession, TestForm } from './DiagnosisActions';

type Session = {
  id: string; summary: string; status: string; version: number; confidence: string; override: { reason?: string; by?: string } | null; dtcs: string[];
  repairOrder: { id: string; roNumber: string } | null; concern: { customerWords: string } | null;
  hypotheses: { id: string; cause: string; confidence: string; origin: string; status: string; sources: { sourceKind: string; title: string }[] }[];
  tests: { id: string; procedure: string; result: string; outcome: string; at: string }[];
};
const SOURCE: Record<string, string> = { oem: 'Maker service information', licensed: 'Licensed repair database', government: 'Government bulletin', shop_history: 'This shop\'s past work', forum_checked: 'Forum post, checked by a technician' };

/** Finding the cause before quoting the fix. The quote opens only when a test confirms the likeliest cause and the confidence clears the shop's bar. */
export default async function DiagnosisPage() {
  const tz = await orgTimeZone();
  const can = await holds(['canDiagnose', 'canOverrideTrustGate']);
  let sessions: Session[] = []; let diagJobs: { id: string; label: string; repairOrderId: string; concernId: string | null }[] = []; let roJobs: Record<string, { id: string; label: string }[]> = {};
  const gates: Record<string, { ok: boolean; reason: string | null; threshold: number; canOverride: boolean }> = {};
  try {
    const d = await q<any>(`{
      diagnosisSessions(orderBy: { createdAt: desc }, take: 40) { id summary status version confidence override dtcs repairOrder { id roNumber } concern { customerWords }
        hypotheses(orderBy: { rank: asc }) { id cause confidence origin status sources } tests(orderBy: { at: desc }) { id procedure result outcome at } }
      jobs(where: { kind: { equals: "diagnosis" }, status: { in: ["authorized", "in_progress"] } }, orderBy: { createdAt: desc }, take: 30) { id title repairOrder { id roNumber } concern { id } }
      repairJobs: jobs(where: { kind: { not: { equals: "diagnosis" } }, status: { notIn: ["cancelled", "declined", "void"] } }, orderBy: { createdAt: desc }, take: 150) { id title repairOrder { id } } }`);
    sessions = d.diagnosisSessions;
    const used = new Set(sessions.map(s => s.repairOrder?.id + ':' + s.status));
    void used;
    diagJobs = d.jobs.map((j: any) => ({ id: j.id, label: `${j.repairOrder?.roNumber} · ${j.title}`, repairOrderId: j.repairOrder?.id, concernId: j.concern?.id ?? null }));
    for (const j of d.repairJobs) (roJobs[j.repairOrder?.id] ??= []).push({ id: j.id, label: j.title });
    for (const s of sessions.filter(s => ['open', 'testing'].includes(s.status))) {
      try {
        const g = await q<any>(`query G($id: ID!) { diagnosisGate(sessionId: $id) }`, { id: s.id });
        gates[s.id] = g.diagnosisGate;
      } catch {}
    }
  } catch {}
  const active = sessions.filter(s => ['open', 'testing'].includes(s.status));
  return (
    <Page title="Diagnosis">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Being worked" value={<span className="font-mono text-base">{active.length}</span>} />
        <Stat name="Ready to quote" value={<span className="font-mono text-base">{sessions.filter(s => s.status === 'quote_ready').length}</span>} />
        <Stat name="Not conclusive" value={<span className="font-mono text-base">{sessions.filter(s => s.status === 'inconclusive').length}</span>} />
      </div>
      <Section title="Diagnoses" aside={can.canDiagnose ? <StartSession jobs={diagJobs} /> : null}>
        {sessions.length ? sessions.map(s => {
          const g = gates[s.id];
          return (
            <Row key={s.id}>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{s.summary || s.concern?.customerWords || 'Diagnosis'}</span><Status value={s.status} /></div>
                <Meta>Repair order {s.repairOrder?.roNumber}{s.dtcs?.length ? ` · codes ${s.dtcs.join(', ')}` : ''}{Number(s.confidence) > 0 ? ` · top cause ${percent(s.confidence)} sure` : ''}</Meta>
                {s.override?.reason ? <p className="break-words rounded-md border border-amber-300 p-2 text-sm">Quoted below the confidence bar. Reason given: {s.override.reason}</p> : null}
                <ul className="space-y-2">
                  {s.hypotheses.length ? s.hypotheses.map(h => (
                    <li key={h.id} className="min-w-0 break-words text-sm"><span className="font-medium">{h.cause}</span> <Meta>{percent(h.confidence)} sure{h.origin === 'agent' ? ' · suggested by an assistant' : ''}{h.status !== 'active' ? ` · ${label(h.status)}` : ''}</Meta>
                      <div className="text-xs text-muted-foreground">{(h.sources ?? []).map(x => `${SOURCE[x.sourceKind] ?? label(x.sourceKind)}: ${x.title}`).join(' · ')}</div></li>
                  )) : <li className="text-sm text-muted-foreground">No likely causes yet.</li>}
                </ul>
                {s.tests.length ? <ul className="space-y-1">{s.tests.map(t => <li key={t.id} className="min-w-0 break-words text-sm"><span className="font-medium">{t.procedure}</span> <Meta>{label(t.outcome)} · {t.result} · {when(t.at, tz)}</Meta></li>)}</ul> : null}
                {['open', 'testing'].includes(s.status) && can.canDiagnose ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2"><HypothesisForm sessionId={s.id} /><TestForm sessionId={s.id} hypotheses={s.hypotheses.map(h => ({ id: h.id, cause: h.cause }))} />
                      <Act op="markDiagnosisInconclusive" vars={{ sessionId: s.id, expectedVersion: s.version }} ask="What was tried?">Not conclusive</Act></div>
                    {g ? <QuoteReadyForm sessionId={s.id} version={s.version} jobs={roJobs[s.repairOrder?.id ?? ''] ?? []} ok={g.ok} reason={g.reason} canOverride={g.canOverride} /> : null}
                  </div>
                ) : null}
                {['quote_ready', 'inconclusive'].includes(s.status) && can.canDiagnose ? <Act op="closeDiagnosisSession" vars={{ sessionId: s.id, expectedVersion: s.version }}>Close</Act> : null}
              </div>
            </Row>
          );
        }) : <Empty>No diagnoses yet.</Empty>}
      </Section>
    </Page>
  );
}
