'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { money, hours } from '../../lib/format';
import { cn } from '@/lib/utils';

const PATHS = ['/dashboard/platform/board', '/dashboard/platform/repair-orders'];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');

/** Whole dollars and cents typed by staff → minor units as a string; never through a float. */
export function toMinor(text: string): string | null {
  const m = text.trim().replace(/[$,]/g, '').match(/^(\d{1,7})(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  return String(BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0'));
}
/** "1.6" hours → 160 centi-hours. */
export function toCenti(text: string): number | null {
  const m = text.trim().match(/^(\d{1,3})(?:\.(\d{0,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
}

function Disclosure({ label, children, open, onOpen }: { label: string; children: React.ReactNode; open: boolean; onOpen: (v: boolean) => void }) {
  return open ? <div className="w-full space-y-3 rounded-md border p-3">{children}</div> : <button type="button" className={pillClass} onClick={() => onOpen(true)}>{label}</button>;
}

export function AddJobForm({ repairOrderId, concerns, cannedJobs }: { repairOrderId: string; concerns: { id: string; customerWords: string }[]; cannedJobs: { id: string; code: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [canned, setCanned] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [concernId, setConcern] = React.useState(concerns[0]?.id ?? '');
  const add = useCommand<{ status: string; problems: string[] }>('addRepairJob', PATHS);
  return (
    <Disclosure label="Add a job" open={open} onOpen={setOpen}>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => {
        e.preventDefault();
        const job = cannedJobs.find(c => c.id === canned);
        add.run({ input: { repairOrderId, title: title.trim() || job?.name || '', concernId: concernId || undefined, cannedJobId: canned || undefined, ...(canned ? {} : { lines: [] }) } }, () => { setOpen(false); setTitle(''); setCanned(''); });
      }}>
        <label className={labelClass}>Canned job
          <select className={inputClass} value={canned} onChange={e => setCanned(e.target.value)}>
            <option value="">None: I&apos;ll type the lines</option>
            {cannedJobs.map(c => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <label className={labelClass}>Title<input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder={cannedJobs.find(c => c.id === canned)?.name ?? 'Diagnose the noise'} /></label>
        <label className={labelClass}>For the concern
          <select className={inputClass} value={concernId} onChange={e => setConcern(e.target.value)}>
            <option value="">No concern (an extra the shop recommends)</option>
            {concerns.map(c => <option key={c.id} value={c.id}>{c.customerWords.slice(0, 60)}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
          <button className={primary} disabled={add.pending || (!canned && !title.trim())}>{add.pending ? 'Adding' : 'Add job'}</button>
          <button type="button" className={cn(pillClass, 'bg-transparent shadow-none')} onClick={() => setOpen(false)}>Cancel</button>
          <FormError error={add.error} />
        </div>
      </form>
    </Disclosure>
  );
}

const CONDITIONS = ['new', 'used', 'rebuilt', 'reconditioned', 'remanufactured', 'aftermarket_crash', 'oem_crash'];

export function AddLineForm({ jobId, version }: { jobId: string; version: number }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<'labor' | 'part' | 'tire' | 'sublet'>('labor');
  const [f, setF] = React.useState({ description: '', operationCode: '', hours: '', partNumber: '', brand: '', condition: 'new', qty: '1', cost: '', vendor: '', price: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = useCommand('editRepairJobLines', PATHS);
  const line = (): Record<string, unknown> | string => {
    if (!f.description.trim() && !f.operationCode.trim()) return 'Describe the line.';
    if (kind === 'labor') {
      const centi = f.hours ? toCenti(f.hours) : null;
      if (!f.operationCode.trim() && centi === null) return 'Enter the hours, or a labor-guide code.';
      return { kind, description: f.description.trim(), rateClassCode: 'general', ...(f.operationCode.trim() ? { operationCode: f.operationCode.trim().toUpperCase() } : {}), ...(centi !== null ? { soldCentiHours: centi } : {}) };
    }
    if (kind === 'sublet') {
      const price = toMinor(f.price); const cost = toMinor(f.cost);
      if (!f.vendor.trim() || price === null) return 'A sublet needs the vendor and the price.';
      return { kind, description: f.description.trim(), subletVendorName: f.vendor.trim(), subletPriceMinor: price, ...(cost ? { subletCostMinor: cost } : {}) };
    }
    const cost = toMinor(f.cost); const qty = Number.parseInt(f.qty, 10);
    if (cost === null || !Number.isSafeInteger(qty) || qty < 1) return 'Enter the quantity and the unit cost.';
    return { kind, description: f.description.trim(), partNumber: f.partNumber.trim(), brand: f.brand.trim(), condition: f.condition, quantityMilli: qty * 1000, unitCostMinor: cost, ...(kind === 'tire' ? { isNewTire: f.condition === 'new', partCategory: 'tires' } : {}) };
  };
  const [problem, setProblem] = React.useState('');
  return (
    <Disclosure label="Add a line" open={open} onOpen={setOpen}>
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={e => {
        e.preventDefault();
        const l = line();
        if (typeof l === 'string') { setProblem(l); return; }
        setProblem('');
        save.run({ jobId, expectedVersion: version, add: [l] }, () => setOpen(false));
      }}>
        <label className={labelClass}>Kind
          <select className={inputClass} value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
            <option value="labor">Labor</option><option value="part">Part</option><option value="tire">Tire</option><option value="sublet">Sublet</option>
          </select>
        </label>
        <label className={cn(labelClass, 'sm:col-span-3')}>Description<input className={inputClass} value={f.description} onChange={set('description')} /></label>
        {kind === 'labor' ? (<>
          <label className={labelClass}>Labor-guide code<input className={inputClass} value={f.operationCode} onChange={set('operationCode')} placeholder="BRK-PAD-F" /></label>
          <label className={labelClass}>Hours (blank uses the guide)<input className={inputClass} inputMode="decimal" value={f.hours} onChange={set('hours')} placeholder="1.6" /></label>
        </>) : kind === 'sublet' ? (<>
          <label className={labelClass}>Vendor<input className={inputClass} value={f.vendor} onChange={set('vendor')} /></label>
          <label className={labelClass}>Price to customer<input className={inputClass} inputMode="decimal" value={f.price} onChange={set('price')} placeholder="180.00" /></label>
          <label className={labelClass}>Our cost<input className={inputClass} inputMode="decimal" value={f.cost} onChange={set('cost')} /></label>
        </>) : (<>
          <label className={labelClass}>Part number<input className={inputClass} value={f.partNumber} onChange={set('partNumber')} /></label>
          <label className={labelClass}>Brand<input className={inputClass} value={f.brand} onChange={set('brand')} /></label>
          <label className={labelClass}>Condition (on the estimate)
            <select className={inputClass} value={f.condition} onChange={set('condition')}>{CONDITIONS.map(c => <option key={c} value={c}>{c.replaceAll('_', ' ')}</option>)}</select>
          </label>
          <label className={labelClass}>Quantity<input className={inputClass} inputMode="numeric" value={f.qty} onChange={set('qty')} /></label>
          <label className={labelClass}>Unit cost (priced by the matrix)<input className={inputClass} inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="48.00" /></label>
        </>)}
        <div className="flex flex-wrap items-center gap-2 sm:col-span-4">
          <button className={primary} disabled={save.pending}>{save.pending ? 'Pricing' : 'Add and price'}</button>
          <button type="button" className={cn(pillClass, 'bg-transparent shadow-none')} onClick={() => setOpen(false)}>Cancel</button>
          <FormError error={problem || save.error} />
        </div>
      </form>
    </Disclosure>
  );
}

export function VariantChooser({ jobId, version, candidates }: { jobId: string; version: number; candidates: { operationCode?: string; variant: string; centiHours: number; description: string }[] }) {
  const choose = useCommand('editRepairJobLines', PATHS);
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">Choose the labor time that fits this car</div>
      <div className="flex flex-wrap gap-2">
        {candidates.map(c => (
          <button key={c.variant} type="button" disabled={choose.pending} className={pillClass} onClick={() => choose.run({ jobId, expectedVersion: version, choose: { operationCode: c.operationCode, variant: c.variant } })}>
            {c.variant || 'Standard'} · {hours(c.centiHours)}
          </button>
        ))}
      </div>
      <FormError error={choose.error} />
    </div>
  );
}

const DECISIONS = [{ v: 'approve', l: 'Approve' }, { v: 'decline', l: 'Decline' }, { v: 'defer', l: 'Later' }] as const;

export function DecisionPicker({ jobs, value, onChange }: { jobs: { id: string; number: number; title: string; totalMinor: string }[]; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return (
    <div className="space-y-2">
      {jobs.map(j => (
        <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-b-0">
          <span className="min-w-0 text-sm"><span className="font-mono text-xs text-muted-foreground">JOB {j.number}</span> {j.title} · <span className="font-mono">{money(j.totalMinor)}</span></span>
          <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
            {DECISIONS.map(d => (
              <button key={d.v} type="button" aria-pressed={value[j.id] === d.v} onClick={() => onChange({ ...value, [j.id]: d.v })}
                className={cn('h-8 max-md:h-11 rounded-md px-3 text-sm font-medium', value[j.id] === d.v ? 'bg-background shadow-sm' : 'text-muted-foreground')}>{d.l}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The advisor's record of a phone authorization (16 CCR §3353.1(c): name, number, time, amount). */
export function PhoneAuthorizationForm({ estimateVersionId, jobs, customerName, replacedParts }: { estimateVersionId: string; jobs: { id: string; number: number; title: string; totalMinor: string }[]; customerName: string; replacedParts: string }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(customerName);
  const [phone, setPhone] = React.useState('');
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [parts, setParts] = React.useState('');
  const save = useCommand('recordCustomerAuthorization', PATHS);
  const ready = jobs.every(j => answers[j.id]) && name.trim() && phone.replace(/\D/g, '').length >= 10 && (!replacedParts || parts);
  return (
    <Disclosure label="Record a phone authorization" open={open} onOpen={setOpen}>
      <form className="space-y-3" onSubmit={e => {
        e.preventDefault();
        save.run({ input: { estimateVersionId, method: 'oral_phone', actorName: name.trim(), phoneNumber: phone.trim(), answers: jobs.map(j => ({ jobId: j.id, decision: answers[j.id] })), ...(parts ? { replacedPartsElection: parts } : {}) } }, () => setOpen(false));
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Who said yes<input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></label>
          <label className={labelClass}>Number you called<input className={inputClass} inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(916) 555-0100" /></label>
        </div>
        <DecisionPicker jobs={jobs} value={answers} onChange={setAnswers} />
        {replacedParts ? (
          <label className={labelClass}>{replacedParts}
            <select className={inputClass} value={parts} onChange={e => setParts(e.target.value)} required>
              <option value="">Ask the customer</option><option value="return">Return the old parts</option><option value="show_only">Show them, then dispose</option><option value="do_not_return">Don&apos;t return them</option>
            </select>
          </label>
        ) : null}
        <p className="text-xs text-muted-foreground">Recorded with your name and the time. The amount for each approved job is the estimate total; the shop can&apos;t charge more without asking again.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={primary} disabled={!ready || save.pending}>{save.pending ? 'Recording' : 'Record authorization'}</button>
          <button type="button" className={cn(pillClass, 'bg-transparent shadow-none')} onClick={() => setOpen(false)}>Cancel</button>
          <FormError error={save.error} />
        </div>
      </form>
    </Disclosure>
  );
}

/** Makes the customer's approval link. Sent by SMS or email when they agreed to transactional messages. */
export function AuthorizationLinkButton({ estimateVersionId, contacts }: { estimateVersionId: string; contacts: { id: string; kind: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const usable = contacts.filter(c => c.kind === 'mobile' || c.kind === 'email');
  const [contactId, setContact] = React.useState(usable[0]?.id ?? '');
  const send = useCommand<{ path: string; expiresAt: string }>('requestCustomerAuthorization', PATHS);
  const contact = usable.find(c => c.id === contactId);
  if (send.result) {
    const url = typeof window === 'undefined' ? send.result.path : `${window.location.origin}${send.result.path}`;
    return (
      <div className="w-full space-y-1 rounded-md border p-3 text-sm">
        <div>Link queued to {contact?.label}. It works until {new Date(send.result.expiresAt).toLocaleString('en-US')}.</div>
        <div className="break-all font-mono text-xs text-muted-foreground">{url}</div>
      </div>
    );
  }
  return (
    <Disclosure label="Text or email an approval link" open={open} onOpen={setOpen}>
      <div className="flex flex-wrap items-end gap-2">
        <label className={labelClass}>Send to
          <select className={inputClass} value={contactId} onChange={e => setContact(e.target.value)}>
            {usable.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <button type="button" className={primary} disabled={!contact || send.pending} onClick={() => send.run({ estimateVersionId, channel: contact?.kind === 'email' ? 'email' : 'sms', contactId })}>{send.pending ? 'Sending' : 'Send link'}</button>
        <FormError error={send.error} />
      </div>
    </Disclosure>
  );
}

export function CallbackTaskForm({ repairOrderId }: { repairOrderId: string }) {
  const [title, setTitle] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const save = useCommand('createCallbackTask', PATHS);
  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={e => { e.preventDefault(); save.run({ repairOrderId, kind: 'customer_callback', title: title.trim(), detail: detail.trim() }, () => { setTitle(''); setDetail(''); }); }}>
      <label className={labelClass}>Callback<input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="Call about the rear tires" /></label>
      <label className={labelClass}>Note<input className={inputClass} value={detail} onChange={e => setDetail(e.target.value)} /></label>
      <div className="flex items-end gap-2"><button className={pillClass} disabled={!title.trim() || save.pending}>Add</button></div>
      <FormError error={save.error} />
    </form>
  );
}

export function CloseTaskButton({ taskId, version }: { taskId: string; version: number }) {
  const close = useCommand('closeCallbackTask', PATHS);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" className={pillClass} disabled={close.pending} onClick={() => { const outcome = window.prompt('What happened on the call?'); if (outcome?.trim()) close.run({ taskId, expectedVersion: version, outcome: outcome.trim() }); }}>Done</button>
      <FormError error={close.error} />
    </span>
  );
}

const HOLDS = [['customer_unreachable', 'Customer unreachable'], ['parts_backorder', 'Parts on backorder'], ['sublet_out', 'At a sublet'], ['teardown_wait', 'Teardown, waiting'], ['other', 'Other']];

export function HoldForm({ repairOrderId, version, onHold }: { repairOrderId: string; version: number; onHold: boolean }) {
  const [reason, setReason] = React.useState('');
  const save = useCommand('holdRepairOrder', PATHS);
  if (onHold) return <span className="inline-flex items-center gap-2"><button type="button" className={pillClass} disabled={save.pending} onClick={() => save.run({ repairOrderId, expectedVersion: version, hold: false })}>Resume</button><FormError error={save.error} /></span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select aria-label="Hold reason" className={cn(inputClass, 'h-8 w-auto max-md:h-11')} value={reason} onChange={e => setReason(e.target.value)}>
        <option value="">Put on hold…</option>
        {HOLDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {reason ? <button type="button" className={pillClass} disabled={save.pending} onClick={() => save.run({ repairOrderId, expectedVersion: version, hold: true, reason }, () => setReason(''))}>Hold</button> : null}
      <FormError error={save.error} />
    </span>
  );
}
