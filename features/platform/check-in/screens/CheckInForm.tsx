'use client';

import * as React from 'react';
import Link from 'next/link';
import { wallClockInstant, zonedDate } from '@/lib/zonedTime';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { SignaturePad } from '../../components/SignaturePad';

type Props = {
  appointment: {
    id: string; shopId: string; customerId: string; customerName: string; vehicleId: string; vehicleLabel: string; vin: string; lastOdometer: number | null; unit: string;
    concern: string; services: string[]; waiter: boolean; contacts: { id: string; channel: 'sms' | 'email'; label: string }[]; timeZone: string; recall: { campaignCount: number; parkItAny: boolean } | null;
  };
  law: { requireOdometerIn: boolean; requireSignedWorkOrder: boolean; notices: string[]; replacedPartsOfferText: string };
};

/** Today in the shop's zone at hh:mm, as an instant. */
const localToday = (timeZone: string, hhmm: string) => wallClockInstant(timeZone, zonedDate(timeZone, Date.now()), hhmm).toISOString();

export function CheckInForm({ appointment: a, law }: Props) {
  const concernsSeed = [a.concern, ...a.services].filter(Boolean).join('\n');
  const [concerns, setConcerns] = React.useState(concernsSeed);
  const [odometer, setOdometer] = React.useState('');
  const [overrideReason, setOverrideReason] = React.useState('');
  const [promised, setPromised] = React.useState(a.waiter ? '12:00' : '17:00');
  const [keyTag, setKeyTag] = React.useState('');
  const [transport, setTransport] = React.useState('none');
  const [signerName, setSignerName] = React.useState(a.customerName);
  const [strokes, setStrokes] = React.useState<number[][][]>([]);
  const [agreed, setAgreed] = React.useState(false);
  // What the customer ticks on the form. Left empty records nothing.
  const [ticks, setTicks] = React.useState<Record<string, { transactional: boolean; marketing: boolean }>>({});
  const tick = (id: string, kind: 'transactional' | 'marketing', on: boolean) => setTicks(t => ({ ...t, [id]: { ...(t[id] ?? { transactional: false, marketing: false }), [kind]: on } }));
  const save = useCommand<{ reference: string; recallWarning: { count: number; doNotDrive: boolean } | null }>('checkInShopVehicle', ['/dashboard/platform/check-in', '/dashboard/platform/schedule']);
  const lower = a.lastOdometer !== null && odometer !== '' && Number(odometer) < a.lastOdometer;
  const lines = concerns.split('\n').map(s => s.trim()).filter(Boolean);

  if (save.result) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-lg font-semibold">Checked in: {save.result.reference}</p>
        <p className="text-sm">The signed work order is stored with the check-in. The repair order opens from it in the next phase.</p>
        {save.result.recallWarning ? <p className={`text-sm font-medium ${save.result.recallWarning.doNotDrive ? 'text-red-600' : 'text-amber-600'}`}>Tell the customer: {save.result.recallWarning.count} possible recall{save.result.recallWarning.count === 1 ? '' : 's'} for this model{save.result.recallWarning.doNotDrive ? ', including a park-outside or do-not-drive warning' : ''}.</p> : null}
        <Link className={pillClass} href="/dashboard/platform/check-in">Next customer</Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={e => {
        e.preventDefault();
        save.run({
          input: {
            shopId: a.shopId, appointmentId: a.id, customerId: a.customerId, vehicleId: a.vehicleId, concerns: lines,
            odometer: odometer ? { value: Number(odometer), unit: a.unit, overrideReason: lower ? overrideReason : undefined } : undefined,
            promisedAt: localToday(a.timeZone, promised), waiter: a.waiter, keyTag, transportationNeed: transport, contactPreference: 'sms',
            signature: strokes.length ? { method: 'in_person', signerName, strokes } : undefined,
            consents: a.contacts.map(c => ({ contactId: c.id, channel: c.channel, ...(ticks[c.id] ?? {}) })).filter(c => c.transactional || c.marketing),
          },
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="font-medium">{a.customerName}</span>
        <span>{a.vehicleLabel}</span>
        <span className="break-all font-mono text-xs text-muted-foreground">{a.vin}</span>
        {a.waiter ? <span className="text-sm text-muted-foreground">Waiting at the shop</span> : null}
      </div>
      {a.recall?.campaignCount ? (
        <div role="alert" className={`rounded-lg border p-3 text-sm ${a.recall.parkItAny ? 'border-red-500/60 bg-red-500/5 text-red-700 dark:text-red-400' : 'border-amber-500/60 bg-amber-500/5'}`}>
          {a.recall.campaignCount} possible recall{a.recall.campaignCount === 1 ? '' : 's'} for this model{a.recall.parkItAny ? ': NHTSA says park outside or do not drive for at least one. Tell the customer before they leave the vehicle.' : '. Mention it to the customer.'}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClass}>Concerns, in the customer&apos;s words (one per line)
          <textarea required rows={4} className={`${inputClass} h-auto py-2`} value={concerns} onChange={e => setConcerns(e.target.value)} />
        </label>
        <div className="grid content-start gap-3 sm:grid-cols-2">
          <label className={labelClass}>Odometer in ({a.unit}){law.requireOdometerIn ? ' · required' : ''}
            <input inputMode="numeric" required={law.requireOdometerIn} className={`${inputClass} font-mono`} placeholder={a.lastOdometer !== null ? `last ${a.lastOdometer.toLocaleString('en-US')}` : ''} value={odometer} onChange={e => setOdometer(e.target.value.replace(/\D/g, '').slice(0, 7))} />
          </label>
          <label className={labelClass}>Promised today at
            <input type="time" required className={inputClass} value={promised} onChange={e => setPromised(e.target.value)} />
          </label>
          {lower ? (
            <label className={`${labelClass} sm:col-span-2`}>Lower than the last reading. Why?
              <input required className={inputClass} value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
            </label>
          ) : null}
          <label className={labelClass}>Key tag<input className={inputClass} value={keyTag} onChange={e => setKeyTag(e.target.value.slice(0, 20))} /></label>
          <label className={labelClass}>Transport
            <select className={inputClass} value={transport} onChange={e => setTransport(e.target.value)}>
              <option value="none">None</option><option value="shuttle">Shuttle</option><option value="loaner">Loaner</option><option value="rideshare">Rideshare</option>
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Work order · hand the tablet to the customer</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-sm">{lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ol>
        {law.notices.map((n, i) => <p key={i} className="break-words text-sm">{n}</p>)}
        {law.replacedPartsOfferText ? <p className="break-words text-sm">{law.replacedPartsOfferText}</p> : null}
        {a.contacts.length ? (
          <fieldset className="space-y-2 border-t pt-3">
            <legend className="text-sm font-medium">How may we reach you?</legend>
            {a.contacts.map(c => (
              <div key={c.id} className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <label className="flex min-h-11 items-start gap-2 text-sm md:min-h-0"><input type="checkbox" className="mt-1" checked={ticks[c.id]?.transactional ?? false} onChange={e => tick(c.id, 'transactional', e.target.checked)} /> About this repair: estimates, questions and when the car is ready</label>
                <label className="flex min-h-11 items-start gap-2 text-sm md:min-h-0"><input type="checkbox" className="mt-1" checked={ticks[c.id]?.marketing ?? false} onChange={e => tick(c.id, 'marketing', e.target.checked)} /> Service reminders and offers from the shop. This is not required to get the repair, and you can say STOP at any time.</label>
              </div>
            ))}
          </fieldset>
        ) : null}
        <label className={labelClass}>Name of the person signing<input required className={inputClass} value={signerName} onChange={e => setSignerName(e.target.value)} /></label>
        <SignaturePad strokes={strokes} onChange={setStrokes} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={`${pillClass} bg-transparent shadow-none`} onClick={() => setStrokes([])}>Clear signature</button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" required checked={agreed} onChange={e => setAgreed(e.target.checked)} /> The customer read the work order</label>
        </div>
      </div>

      <FormError error={save.error} />
      <button type="submit" disabled={save.pending || (law.requireSignedWorkOrder && !strokes.length)} className={`${pillClass} bg-primary text-primary-foreground`}>{save.pending ? 'Checking in' : 'Check in vehicle'}</button>
    </form>
  );
}
