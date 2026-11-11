'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

export const ACCOUNT_PATHS = ['/dashboard/platform/accounts', '/dashboard/platform/statements', '/dashboard/platform/receivables', '/dashboard/platform/approvals'];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');
type Result = { approvalRequired?: boolean; approvalRequestId?: string; csv?: string; filename?: string; apiPath?: string; expiresAt?: string; message?: string; status?: string; id?: string };

function Waits({ result }: { result: Result | null }) {
  if (result?.approvalRequired) return <p role="status" className="text-sm">A manager with credit approval has to approve this. <Link className="underline" href="/dashboard/platform/approvals">Open approvals</Link>, then press it again.</p>;
  return null;
}

function download(csv: string | undefined, filename: string | undefined) {
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'statement.csv'; a.click();
  URL.revokeObjectURL(url);
}

/** A button that runs one command, optionally asking for words first. */
export function Do({ op, vars, children, ask, askKey = 'reason', primaryStyle }: { op: string; vars: Record<string, unknown>; children: React.ReactNode; ask?: string; askKey?: string; primaryStyle?: boolean }) {
  const cmd = useCommand<Result>(op, ACCOUNT_PATHS);
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

/** Release a hold: asks why, then waits for a manager's approval and is pressed again to finish. */
export function ReleaseHold({ businessAccountId }: { businessAccountId: string }) {
  const cmd = useCommand<Result>('releaseAccountHold', ACCOUNT_PATHS);
  const [approval, setApproval] = React.useState('');
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={primary} onClick={() => {
        const reason = window.prompt('Why is the hold being released?');
        if (!reason || reason.trim().length < 3) return;
        cmd.run({ businessAccountId, reason: reason.trim(), ...(approval ? { approvalRequestId: approval } : {}) }, d => { if (d.approvalRequestId) setApproval(d.approvalRequestId); });
      }}>{cmd.pending ? 'Working' : approval ? 'Release now that it is approved' : 'Release the hold'}</button>
      <Waits result={cmd.result} />
      <FormError error={cmd.error} />
    </span>
  );
}

/** One statement as a file. */
export function ExportOne({ statementId }: { statementId: string }) {
  const cmd = useCommand<Result>('exportAccountStatement', ACCOUNT_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => cmd.run({ statementId }, d => download(d.csv, d.filename))}>{cmd.pending ? 'Working' : 'Export'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

/** Make the statement for a period (if it is not made yet) and download it, for one account or for every monthly account. */
export function ExportPeriod({ businessAccountId, start, end, label }: { businessAccountId?: string; start: string; end: string; label: string }) {
  const one = useCommand<Result>('makeAccountStatement', ACCOUNT_PATHS);
  const all = useCommand<Result>('exportAllAccountStatements', ACCOUNT_PATHS);
  const exportOne = useCommand<Result>('exportAccountStatement', ACCOUNT_PATHS);
  const cmd = businessAccountId ? one : all;
  const error = one.error || all.error || exportOne.error;
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={one.pending || all.pending || exportOne.pending} className={primary} onClick={() => {
        if (businessAccountId) one.run({ businessAccountId, periodStart: start, periodEnd: end }, d => { if (d.id) exportOne.run({ statementId: d.id }, f => download(f.csv, f.filename)); });
        else all.run({ periodStart: start, periodEnd: end }, d => download(d.csv, d.filename));
      }}>{cmd.pending || exportOne.pending ? 'Working' : label}</button>
      <FormError error={error} />
    </span>
  );
}

function Form({ op, title, children, build, done }: { op: string; title: string; children: (s: { set: (k: string, v: string) => void; get: (k: string) => string }) => React.ReactNode; build: (g: (k: string) => string) => Record<string, unknown>; done?: (d: Result) => React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState<Record<string, string>>({});
  const cmd = useCommand<Result>(op, ACCOUNT_PATHS);
  const get = (k: string) => v[k] ?? '';
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>{title}</button>;
  return (
    <form className="flex w-full max-w-md flex-col gap-2" onSubmit={e => { e.preventDefault(); cmd.run(build(get), () => { if (!done) { setOpen(false); setV({}); } }); }}>
      {children({ set: (k, val) => setV(p => ({ ...p, [k]: val })), get })}
      <div className="flex flex-wrap gap-2"><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Saving' : 'Save'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Close</button></div>
      <Waits result={cmd.result} />
      {cmd.result && done ? done(cmd.result) : null}
      <FormError error={cmd.error} />
    </form>
  );
}
const dollarsToMinor = (text: string) => { const n = Number(text.replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100)) : ''; };

export function ContactForm({ businessAccountId }: { businessAccountId: string }) {
  return (
    <Form op="addAccountContact" title="Add a contact" build={g => ({ input: { businessAccountId, name: g('name'), email: g('email'), phone: g('phone'), roles: ['billing'] } })}>
      {({ set, get }) => (<>
        <label className={labelClass}>Name<input required maxLength={120} className={inputClass} value={get('name')} onChange={e => set('name', e.target.value)} /></label>
        <label className={labelClass}>Email<input type="email" maxLength={160} className={inputClass} value={get('email')} onChange={e => set('email', e.target.value)} /></label>
        <label className={labelClass}>Phone<input maxLength={40} className={inputClass} value={get('phone')} onChange={e => set('phone', e.target.value)} /></label>
      </>)}
    </Form>
  );
}

export function ApproverForm({ businessAccountId, contacts }: { businessAccountId: string; contacts: { id: string; name: string }[] }) {
  if (!contacts.length) return null;
  return (
    <Form op="addAccountApprover" title="Add an approver" build={g => ({ input: { businessAccountId, contactId: g('contactId') || contacts[0].id, limitMinor: dollarsToMinor(g('limit')) } })}>
      {({ set, get }) => (<>
        <label className={labelClass}>Contact<select className={inputClass} value={get('contactId') || contacts[0].id} onChange={e => set('contactId', e.target.value)}>{contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className={labelClass}>Can approve up to (dollars)<input required inputMode="decimal" className={inputClass} value={get('limit')} onChange={e => set('limit', e.target.value)} placeholder="750" /></label>
      </>)}
    </Form>
  );
}

export function CertificateForm({ businessAccountId }: { businessAccountId: string }) {
  return (
    <Form op="addAccountCertificate" title="Add a tax certificate" build={g => ({ input: { businessAccountId, kind: g('kind') || 'resale', number: g('number'), issuingState: g('state'), effectiveFrom: g('from') || null, expiresAt: g('to') || null } })}>
      {({ set, get }) => (<>
        <label className={labelClass}>Kind<select className={inputClass} value={get('kind') || 'resale'} onChange={e => set('kind', e.target.value)}><option value="resale">Resale</option><option value="government">Government</option><option value="nonprofit">Nonprofit</option><option value="other">Other</option></select></label>
        <label className={labelClass}>Certificate number<input required maxLength={60} className={inputClass} value={get('number')} onChange={e => set('number', e.target.value)} /></label>
        <label className={labelClass}>Issued by (state)<input maxLength={40} className={inputClass} value={get('state')} onChange={e => set('state', e.target.value)} placeholder="California" /></label>
        <label className={labelClass}>Valid from<input type="date" className={inputClass} value={get('from')} onChange={e => set('from', e.target.value)} /></label>
        <label className={labelClass}>Expires<input type="date" className={inputClass} value={get('to')} onChange={e => set('to', e.target.value)} /></label>
      </>)}
    </Form>
  );
}

export function UnitForm({ businessAccountId, vehicles }: { businessAccountId: string; vehicles: { id: string; name: string }[] }) {
  if (!vehicles.length) return null;
  return (
    <Form op="saveAccountUnit" title="Add a unit" build={g => ({ input: { businessAccountId, vehicleId: g('vehicleId') || vehicles[0].id, unitNumber: g('unit'), driverName: g('driver'), costCenter: g('cost') } })}>
      {({ set, get }) => (<>
        <label className={labelClass}>Vehicle<select className={inputClass} value={get('vehicleId') || vehicles[0].id} onChange={e => set('vehicleId', e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label className={labelClass}>Unit number<input required maxLength={30} className={inputClass} value={get('unit')} onChange={e => set('unit', e.target.value)} /></label>
        <label className={labelClass}>Driver<input maxLength={120} className={inputClass} value={get('driver')} onChange={e => set('driver', e.target.value)} /></label>
        <label className={labelClass}>Cost center<input maxLength={60} className={inputClass} value={get('cost')} onChange={e => set('cost', e.target.value)} /></label>
      </>)}
    </Form>
  );
}

export function TermsForm({ a }: { a: { id: string; termsDays: number; poRequired: boolean; creditLimitMinor: string; holdAfterOverdueDays: number | null; billingMode: string } }) {
  return (
    <Form op="saveAccountTerms" title="Change terms" build={g => ({ input: {
      businessAccountId: a.id, termsDays: Number(g('days') || a.termsDays), poRequired: (g('po') || (a.poRequired ? 'yes' : 'no')) === 'yes', billingMode: g('mode') || a.billingMode,
      creditLimitMinor: g('limit') ? dollarsToMinor(g('limit')) : undefined, holdAfterOverdueDays: g('hold') === '' ? undefined : g('hold') === '0' ? null : Number(g('hold')),
    } })}>
      {({ set, get }) => (<>
        <label className={labelClass}>Payment terms (days)<input type="number" min={0} max={120} className={inputClass} value={get('days') || String(a.termsDays)} onChange={e => set('days', e.target.value)} /></label>
        <label className={labelClass}>Purchase order on every invoice<select className={inputClass} value={get('po') || (a.poRequired ? 'yes' : 'no')} onChange={e => set('po', e.target.value)}><option value="yes">Required</option><option value="no">Not required</option></select></label>
        <label className={labelClass}>Billing<select className={inputClass} value={get('mode') || a.billingMode} onChange={e => set('mode', e.target.value)}><option value="per_invoice">Each invoice on its own</option><option value="statement_monthly">Monthly statement</option></select></label>
        <label className={labelClass}>Credit limit (dollars, leave blank to keep)<input inputMode="decimal" className={inputClass} value={get('limit')} onChange={e => set('limit', e.target.value)} /></label>
        <label className={labelClass}>Hold after days overdue (0 for never, blank to keep)<input inputMode="numeric" className={inputClass} value={get('hold')} onChange={e => set('hold', e.target.value)} /></label>
      </>)}
    </Form>
  );
}

/** A copyable link for one contact. Shown once. */
export function LinkButton({ contactId }: { contactId: string }) {
  const cmd = useCommand<Result>('createAccountLink', ACCOUNT_PATHS);
  const [copied, setCopied] = React.useState(false);
  const full = cmd.result?.apiPath ? `${window.location.origin}${cmd.result.apiPath}` : '';
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => cmd.run({ contactId })}>{cmd.pending ? 'Working' : 'Make a link'}</button>
      {full ? <span className="flex min-w-0 max-w-full flex-wrap items-center gap-2"><input readOnly aria-label="Link to copy" className={inputClass} value={full} onFocus={e => e.currentTarget.select()} /><button type="button" className={pillClass} onClick={() => { void navigator.clipboard?.writeText(full); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button></span> : null}
      <FormError error={cmd.error} />
    </span>
  );
}
