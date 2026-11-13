'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

const PATHS = ['/dashboard/platform/diagnosis'];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');
const SOURCES: [string, string][] = [['oem', 'Maker service information'], ['licensed', 'Licensed repair database'], ['government', 'Government bulletin'], ['shop_history', 'This shop\'s past work'], ['forum_checked', 'Forum post, checked by a technician']];
const OUTCOMES: [string, string][] = [['confirms', 'Confirms the cause'], ['refutes', 'Rules it out'], ['inconclusive', 'Not conclusive']];

export function StartSession({ jobs }: { jobs: { id: string; label: string; repairOrderId: string; concernId: string | null }[] }) {
  const [open, setOpen] = React.useState(false);
  const [jobId, setJobId] = React.useState(jobs[0]?.id ?? '');
  const [dtcs, setDtcs] = React.useState('');
  const cmd = useCommand('startDiagnosisSession', PATHS);
  if (!jobs.length) return null;
  if (!open) return <button type="button" className={primary} onClick={() => setOpen(true)}>Start a diagnosis</button>;
  const job = jobs.find(j => j.id === jobId);
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (!job?.concernId) return; cmd.run({ input: { repairOrderId: job.repairOrderId, concernId: job.concernId, jobId, dtcs: dtcs.split(/[\s,]+/).filter(Boolean) } }, () => setOpen(false)); }}>
      <label className={labelClass}>Diagnosis job<select className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}>{jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
      <label className={labelClass}>Trouble codes (optional)<input className={inputClass} value={dtcs} onChange={e => setDtcs(e.target.value)} placeholder="P0301, P0304" /></label>
      {job && !job.concernId ? <p className="text-sm sm:col-span-2">This job has no customer concern attached yet.</p> : null}
      <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={cmd.pending || !job?.concernId} className={primary}>{cmd.pending ? 'Starting' : 'Start'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-2"><FormError error={cmd.error} /></div>
    </form>
  );
}

export function HypothesisForm({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = React.useState(false);
  const [cause, setCause] = React.useState('');
  const [pct, setPct] = React.useState('60');
  const [kind, setKind] = React.useState('oem');
  const [title, setTitle] = React.useState('');
  const cmd = useCommand('addDiagnosisHypothesis', PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Add a likely cause</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); cmd.run({ input: { sessionId, cause: cause.trim(), confidence: Number(pct) / 100, sources: [{ sourceKind: kind, title: title.trim() }] } }, () => { setOpen(false); setCause(''); setTitle(''); }); }}>
      <label className={cn(labelClass, 'sm:col-span-2')}>Likely cause<input className={inputClass} value={cause} onChange={e => setCause(e.target.value)} placeholder="Cylinder 1 ignition coil failed" /></label>
      <label className={labelClass}>How sure, in percent<input className={inputClass} inputMode="numeric" value={pct} onChange={e => setPct(e.target.value)} /></label>
      <label className={labelClass}>Where that comes from<select className={inputClass} value={kind} onChange={e => setKind(e.target.value)}>{SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className={cn(labelClass, 'sm:col-span-2')}>Name of the document or past job<input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Misfire diagnostic tree" /></label>
      <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={cmd.pending || !cause.trim() || !title.trim()} className={primary}>{cmd.pending ? 'Saving' : 'Save'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-2"><FormError error={cmd.error} /></div>
    </form>
  );
}

export function TestForm({ sessionId, hypotheses }: { sessionId: string; hypotheses: { id: string; cause: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [hypothesisId, setHyp] = React.useState(hypotheses[0]?.id ?? '');
  const [procedure, setProcedure] = React.useState('');
  const [result, setResult] = React.useState('');
  const [outcome, setOutcome] = React.useState('confirms');
  const cmd = useCommand('recordDiagnosisTest', PATHS);
  if (!hypotheses.length) return null;
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Record a test</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); cmd.run({ input: { sessionId, hypothesisId, procedure: procedure.trim(), result: result.trim(), outcome } }, () => { setOpen(false); setProcedure(''); setResult(''); }); }}>
      <label className={labelClass}>Testing<select className={inputClass} value={hypothesisId} onChange={e => setHyp(e.target.value)}>{hypotheses.map(h => <option key={h.id} value={h.id}>{h.cause}</option>)}</select></label>
      <label className={labelClass}>Result<select className={inputClass} value={outcome} onChange={e => setOutcome(e.target.value)}>{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className={labelClass}>What was done<input className={inputClass} value={procedure} onChange={e => setProcedure(e.target.value)} placeholder="Swapped coils 1 and 2" /></label>
      <label className={labelClass}>What was found<input className={inputClass} value={result} onChange={e => setResult(e.target.value)} placeholder="Misfire moved to cylinder 2" /></label>
      <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={cmd.pending || !procedure.trim() || !result.trim()} className={primary}>{cmd.pending ? 'Saving' : 'Save'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-2"><FormError error={cmd.error} /></div>
    </form>
  );
}

/** Marks the diagnosis ready to quote against the chosen repair job. Below the trust gate only a person with the right may override, with a reason. */
export function QuoteReadyForm({ sessionId, version, jobs, ok, reason, canOverride }: { sessionId: string; version: number; jobs: { id: string; label: string }[]; ok: boolean; reason: string | null; canOverride: boolean }) {
  const [repairJobId, setJob] = React.useState(jobs[0]?.id ?? '');
  const [why, setWhy] = React.useState('');
  const cmd = useCommand('markDiagnosisQuoteReady', PATHS);
  if (!jobs.length) return <p className="text-sm text-muted-foreground">Add the repair job first, then come back to mark this ready to quote.</p>;
  return (
    <form className="grid w-full gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); cmd.run({ input: { sessionId, repairJobId, expectedVersion: version, ...(why.trim() ? { overrideReason: why.trim() } : {}) } }); }}>
      <label className={labelClass}>Repair job to quote<select className={inputClass} value={repairJobId} onChange={e => setJob(e.target.value)}>{jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
      {!ok && canOverride ? <label className={labelClass}>Why quote anyway<input className={inputClass} value={why} onChange={e => setWhy(e.target.value)} /></label> : null}
      {!ok ? <p className="text-sm sm:col-span-2">{reason}{canOverride ? '' : ' A shop manager or owner can quote anyway, with a reason.'}</p> : null}
      <div className="sm:col-span-2"><button type="submit" disabled={cmd.pending || (!ok && !why.trim())} className={primary}>{cmd.pending ? 'Saving' : ok ? 'Ready to quote' : 'Quote anyway'}</button></div>
      <div className="sm:col-span-2"><FormError error={cmd.error} /></div>
    </form>
  );
}
