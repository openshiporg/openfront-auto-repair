'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

export const MESSAGE_PATHS = ['/dashboard/platform/messages', '/dashboard/platform/follow-ups', '/dashboard/platform/campaigns'];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');
type Result = { csv?: string; filename?: string; text?: string; changed?: boolean; apiPath?: string; recipients?: number; excluded?: { name: string; reason: string }[]; revoked?: boolean };

const HOW = [['call', 'Called'], ['text', 'Texted'], ['email', 'Emailed'], ['in_person', 'Spoke in person']] as const;

function download(csv: string | undefined, name: string) {
  if (!csv) return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** Copy to the clipboard, with a visible confirmation (the app never sends anything). */
export function CopyText({ text, children = 'Copy' }: { text: string; children?: React.ReactNode }) {
  const [done, setDone] = React.useState(false);
  return (
    <button type="button" className={pillClass} onClick={async () => { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); }}>{done ? 'Copied' : children}</button>
  );
}

/** "Mark contacted": pick how you reached them, press once. Pressing again records nothing more. */
export function MarkContacted({ op, vars }: { op: 'markFollowUpContacted' | 'markServiceReminderContacted'; vars: Record<string, unknown> }) {
  const cmd = useCommand<Result>(op, MESSAGE_PATHS);
  const [how, setHow] = React.useState('call');
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`how-${String(vars.recommendationId ?? vars.cycleKey)}`}>How you reached them</label>
      <select id={`how-${String(vars.recommendationId ?? vars.cycleKey)}`} className={cn(inputClass, 'w-auto')} value={how} onChange={(e) => setHow(e.target.value)}>
        {HOW.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button type="button" disabled={cmd.pending} className={primary} onClick={() => cmd.run({ ...vars, channel: how })}>{cmd.pending ? 'Working' : 'Mark contacted'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

export function CloseRecommendation({ recommendationId }: { recommendationId: string }) {
  const cmd = useCommand<Result>('closeRecommendation', MESSAGE_PATHS);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => { const reason = window.prompt('Why are you closing this one?'); if (reason && reason.trim().length >= 3) cmd.run({ recommendationId, reason: reason.trim() }); }}>{cmd.pending ? 'Working' : 'Close'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

/** Write down a call the shop made or took. */
export function LogCallForm({ customerId, repairOrderId, shopId }: { customerId: string; repairOrderId?: string | null; shopId?: string | null }) {
  const cmd = useCommand<Result>('logCustomerCall', MESSAGE_PATHS);
  const [f, setF] = React.useState({ direction: 'outbound', outcome: 'reached', note: '' });
  return (
    <form className="grid max-w-xl gap-3" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { customerId, repairOrderId, shopId, ...f } }, () => setF({ ...f, note: '' })); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Direction<select className={inputClass} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="outbound">We called them</option><option value="inbound">They called us</option></select></label>
        <label className={labelClass}>How it went<select className={inputClass} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="reached">Spoke with them</option><option value="left_voicemail">Left a voicemail</option><option value="no_answer">No answer</option><option value="wrong_number">Wrong number</option></select></label>
      </div>
      <label className={labelClass}>What was said<textarea className={cn(inputClass, 'h-20 py-2')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Working' : 'Log the call'}</button></div>
      <FormError error={cmd.error} />
    </form>
  );
}

/** Write down a text or email the shop sent or got. The app does not send it. */
export function LogMessageForm({ customerId, repairOrderId, shopId }: { customerId: string; repairOrderId?: string | null; shopId?: string | null }) {
  const cmd = useCommand<Result>('logCustomerMessage', MESSAGE_PATHS);
  const [f, setF] = React.useState({ direction: 'outbound', channel: 'sms', body: '' });
  return (
    <form className="grid max-w-xl gap-3" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { customerId, repairOrderId, shopId, ...f } }, () => setF({ ...f, body: '' })); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Direction<select className={inputClass} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}><option value="outbound">We sent it</option><option value="inbound">They sent it</option></select></label>
        <label className={labelClass}>Kind<select className={inputClass} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="sms">Text message</option><option value="email">Email</option></select></label>
      </div>
      <label className={labelClass}>What it said<textarea required className={cn(inputClass, 'h-24 py-2')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Working' : 'Log the message'}</button></div>
      {cmd.result?.revoked ? <p role="status" className="text-sm">Texts to this customer are now switched off.</p> : null}
      <FormError error={cmd.error} />
    </form>
  );
}

export function SaveTemplateForm() {
  const cmd = useCommand<Result>('saveMessageTemplate', MESSAGE_PATHS);
  const [f, setF] = React.useState({ name: '', code: '', purpose: 'transactional', body: '' });
  return (
    <form className="grid max-w-xl gap-3" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { ...f, code: f.code || f.name } }, () => setF({ name: '', code: '', purpose: 'transactional', body: '' })); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Name<input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className={labelClass}>Used for<select className={inputClass} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}><option value="transactional">About a repair</option><option value="marketing">Marketing</option></select></label>
      </div>
      <label className={labelClass}>Wording<textarea required className={cn(inputClass, 'h-24 py-2')} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Working' : 'Save the template'}</button></div>
      <FormError error={cmd.error} />
    </form>
  );
}

export function NewCampaignForm({ shopId }: { shopId: string }) {
  const cmd = useCommand<Result>('saveMarketingCampaign', MESSAGE_PATHS);
  const [f, setF] = React.useState({ name: '', kind: 'reminders', messageText: '' });
  return (
    <form className="grid max-w-xl gap-3" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { shopId, ...f, status: 'active' } }, () => setF({ name: '', kind: 'reminders', messageText: '' })); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Name<input required className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className={labelClass}>Who it is for<select className={inputClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="reminders">Customers with service due</option><option value="declined_work">Customers who put off work</option><option value="reviews">Recent customers, for a review</option><option value="promo">All active customers</option></select></label>
      </div>
      <label className={labelClass}>Wording (use {'{name}'} for their first name)<textarea required className={cn(inputClass, 'h-24 py-2')} value={f.messageText} onChange={(e) => setF({ ...f, messageText: e.target.value })} /></label>
      <div><button type="submit" disabled={cmd.pending} className={primary}>{cmd.pending ? 'Working' : 'Make the campaign'}</button></div>
      <FormError error={cmd.error} />
    </form>
  );
}

/** Export the audience as a file. Consent is checked again at this moment; anyone without it is left out. */
export function ExportCampaign({ campaignId, name }: { campaignId: string; name: string }) {
  const cmd = useCommand<Result>('exportMarketingCampaign', MESSAGE_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={primary} onClick={() => cmd.run({ campaignId }, (d) => download(d.csv, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`))}>{cmd.pending ? 'Working' : 'Export CSV'}</button>
      {cmd.result?.excluded?.length ? <p role="status" className="text-sm">{cmd.result.recipients} in the file. Left out: {cmd.result.excluded.map((x) => `${x.name} (${x.reason})`).join('; ')}</p> : cmd.result ? <p role="status" className="text-sm">{cmd.result.recipients} in the file.</p> : null}
      <FormError error={cmd.error} />
    </span>
  );
}

/** Copy the wording for one customer; refused, with the reason, if they have not agreed to marketing in writing. */
export function CopyForCustomer({ campaignId, customerId }: { campaignId: string; customerId: string }) {
  const cmd = useCommand<Result>('copyMarketingMessage', MESSAGE_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => cmd.run({ campaignId, customerId }, (d) => { if (d.text) navigator.clipboard.writeText(d.text); })}>{cmd.pending ? 'Working' : cmd.result?.text ? 'Copied' : 'Copy message'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

/** Staff switch a contact's consent off. Recorded as a new event in the history; nothing is deleted. */
export function RevokeConsent({ contactId, channel }: { contactId: string; channel: 'sms' | 'email' }) {
  const cmd = useCommand<Result>('recordContactConsent', ['/dashboard/platform/customers', ...MESSAGE_PATHS]);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={pillClass} onClick={() => { if (window.confirm(`Switch off ${channel === 'sms' ? 'text' : 'email'} messages to this contact, for repairs and marketing?`)) cmd.run({ input: { contactId, channel, purpose: 'all', action: 'revoked', method: 'staff_recorded', evidence: { reason: 'Customer asked staff to stop' } } }); }}>{cmd.pending ? 'Working' : cmd.result ? 'Switched off' : 'Revoke consent'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}
