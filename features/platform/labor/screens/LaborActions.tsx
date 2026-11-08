'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

export const LABOR_PATHS = [
  '/dashboard/platform/time', '/dashboard/platform/technicians', '/dashboard/platform/pay-periods', '/dashboard/platform/comebacks', '/dashboard/platform/approvals', '/dashboard/platform/repair-orders',
];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');
type Waiting = { approvalRequired?: boolean; approvalRequestId?: string; message?: string; csv?: string; filename?: string };

function Waits({ result }: { result: Waiting | null }) {
  if (result?.approvalRequired) return <p role="status" className="text-sm">A second person has to approve this. <Link className="underline" href="/dashboard/platform/approvals">Open approvals</Link>, then press it again.</p>;
  return result?.message ? <p role="status" className="text-sm">{result.message}</p> : null;
}

/** One command on a button. `ask` prompts for words that go in the named variable. */
export function Act({ op, vars, children, ask, askKey = 'reason', primaryStyle }: { op: string; vars: Record<string, unknown>; children: React.ReactNode; ask?: string; askKey?: string; primaryStyle?: boolean }) {
  const cmd = useCommand<Waiting>(op, LABOR_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={primaryStyle ? primary : pillClass} onClick={() => {
        let extra: Record<string, unknown> = {};
        if (ask) {
          const answer = window.prompt(ask);
          if (!answer || answer.trim().length < 3) return;
          extra = { [askKey]: answer.trim() };
        }
        cmd.run({ ...vars, ...extra });
      }}>{cmd.pending ? 'Working' : children}</button>
      <Waits result={cmd.result} />
      <FormError error={cmd.error} />
    </span>
  );
}

/** Close a pay period, or send it to the payroll file once closed. */
export function ExportButton({ payPeriodId }: { payPeriodId: string }) {
  const cmd = useCommand<Waiting>('exportShopPayPeriod', LABOR_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => cmd.run({ payPeriodId }, d => {
        if (!d.csv) return;
        const url = URL.createObjectURL(new Blob([d.csv], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url; a.download = d.filename || 'pay-period.csv'; a.click();
        URL.revokeObjectURL(url);
      })}>{cmd.pending ? 'Working' : 'Download pay file'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

/** Ask for a fix to a clock entry. A manager other than the asker approves it. */
export function CorrectionForm({ targetId, startIso, endIso }: { targetId: string; startIso: string | null; endIso: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [which, setWhich] = React.useState<'start' | 'end'>('start');
  const [time, setTime] = React.useState('');
  const [reason, setReason] = React.useState('');
  const cmd = useCommand<Waiting>('requestTimeCorrection', LABOR_PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Ask for a correction</button>;
  return (
    <form className="flex w-full max-w-md flex-col gap-2" onSubmit={e => {
      e.preventDefault();
      const iso = new Date(time).toISOString();
      cmd.run({ input: { targetKind: 'shift', targetId, after: { [which]: iso }, reason } });
    }}>
      <label className={labelClass}>Change the
        <select className={inputClass} value={which} onChange={e => setWhich(e.target.value as 'start' | 'end')}>
          <option value="start">clock-in time{startIso ? '' : ''}</option>
          {endIso ? <option value="end">clock-out time</option> : null}
        </select>
      </label>
      <label className={labelClass}>To<input required type="datetime-local" className={inputClass} value={time} onChange={e => setTime(e.target.value)} /></label>
      <label className={labelClass}>Why<input required minLength={5} maxLength={300} className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Forgot to clock in at the bench" /></label>
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Sending' : 'Send for approval'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <Waits result={cmd.result} />
      <FormError error={cmd.error} />
    </form>
  );
}

const CAUSES = [
  { value: 'workmanship', label: 'Our workmanship' },
  { value: 'part_failure', label: 'A part failed' },
  { value: 'new_issue', label: 'A new, unrelated problem' },
  { value: 'customer_caused', label: 'Caused by the customer' },
];

export function DiagnoseForm({ comebackId }: { comebackId: string }) {
  const [cause, setCause] = React.useState('workmanship');
  const [diagnosis, setDiagnosis] = React.useState('');
  const cmd = useCommand<Waiting>('diagnoseShopComeback', LABOR_PATHS);
  return (
    <form className="flex w-full max-w-md flex-col gap-2" onSubmit={e => { e.preventDefault(); cmd.run({ comebackId, cause, diagnosis }); }}>
      <label className={labelClass}>Cause<select className={inputClass} value={cause} onChange={e => setCause(e.target.value)}>{CAUSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
      <label className={labelClass}>What was found<input required minLength={5} maxLength={800} className={inputClass} value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Caliper slide pins were dry" /></label>
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Saving' : 'Save diagnosis'}</button></div>
      <FormError error={cmd.error} />
    </form>
  );
}

export function AttachJobForm({ comebackId, jobs }: { comebackId: string; jobs: { id: string; label: string }[] }) {
  const [jobId, setJobId] = React.useState(jobs[0]?.id ?? '');
  const cmd = useCommand<Waiting>('attachShopComebackJob', LABOR_PATHS);
  if (!jobs.length) return <p className="text-xs text-muted-foreground">To repeat the repair, open the vehicle&apos;s check-in as a comeback on the Repair orders page, add the job, then link it here.</p>;
  return (
    <form className="flex w-full max-w-xl flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); cmd.run({ comebackId, comebackJobId: jobId }); }}>
      <label className={labelClass}>Repeat repair job<select className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}>{jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
      <button type="submit" disabled={cmd.pending} className={pillClass}>{cmd.pending ? 'Linking' : 'Link the repair job'}</button>
      <FormError error={cmd.error} />
    </form>
  );
}

export function ResolveForm({ comebackId, jobs }: { comebackId: string; jobs: { id: string; label: string }[] }) {
  const [jobId, setJobId] = React.useState('');
  const [resolution, setResolution] = React.useState('');
  const cmd = useCommand<Waiting>('resolveShopComeback', LABOR_PATHS);
  return (
    <form className="flex w-full max-w-xl flex-col gap-2" onSubmit={e => { e.preventDefault(); cmd.run({ comebackId, resolution, ...(jobId ? { comebackJobId: jobId } : {}) }); }}>
      <label className={labelClass}>What was done to fix it<input required minLength={5} maxLength={800} className={inputClass} value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Replaced the caliper and bled the brakes" /></label>
      {jobs.length ? <label className={labelClass}>Repeat repair job (a free repair is paid by the shop)<select className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}><option value="">None</option>{jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label> : null}
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Saving' : 'Mark fixed'}</button></div>
      <Waits result={cmd.result} />
      <FormError error={cmd.error} />
    </form>
  );
}

export function OpenComebackForm({ jobs }: { jobs: { id: string; label: string }[] }) {
  const [jobId, setJobId] = React.useState(jobs[0]?.id ?? '');
  const [concern, setConcern] = React.useState('');
  const cmd = useCommand<Waiting>('openShopComeback', LABOR_PATHS);
  if (!jobs.length) return null;
  return (
    <form className="flex w-full max-w-xl flex-col gap-2" onSubmit={e => { e.preventDefault(); cmd.run({ originalJobId: jobId, concern }, () => setConcern('')); }}>
      <label className={labelClass}>Original job<select className={inputClass} value={jobId} onChange={e => setJobId(e.target.value)}>{jobs.map(j => <option key={j.id} value={j.id}>{j.label}</option>)}</select></label>
      <label className={labelClass}>What the customer says<input required minLength={5} maxLength={600} className={inputClass} value={concern} onChange={e => setConcern(e.target.value)} placeholder="Grinding noise is back at the left front" /></label>
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Opening' : 'Open comeback'}</button></div>
      <FormError error={cmd.error} />
    </form>
  );
}
