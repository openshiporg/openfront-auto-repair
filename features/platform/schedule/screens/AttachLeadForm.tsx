'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';

type Lead = { name?: string; phone?: string | null; vehicle?: string | null };

/** "2016 Honda Accord" → year, make, model. Anything else stays in the model field for the advisor to fix. */
function splitVehicle(text: string) {
  const m = /^\s*((?:19|20)\d{2})\s+(\S+)\s*(.*)$/.exec(text);
  return m ? { year: m[1], make: m[2], model: m[3].trim() } : { year: '', make: '', model: text.trim() };
}

/**
 * An online or phone booking arrives with the caller's name, phone and vehicle as typed. This puts it on
 * file: the customer with that phone is reused, or a new one is made, and the vehicle is added to them.
 * Then the appointment can be confirmed and checked in.
 */
export function AttachLeadForm({ appointmentId, version, lead }: { appointmentId: string; version: number; lead: Lead }) {
  const [open, setOpen] = React.useState(false);
  const [first, ...rest] = (lead.name ?? '').trim().split(/\s+/);
  const v = splitVehicle(lead.vehicle ?? '');
  const [form, setForm] = React.useState({ firstName: first ?? '', lastName: rest.join(' '), phone: lead.phone ?? '', vin: '', year: v.year, make: v.make, model: v.model });
  const attach = useCommand('attachAppointmentLead', ['/dashboard/platform/schedule', '/dashboard/platform/check-in']);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Put on file</button>;
  return (
    <form
      className="w-full space-y-3 rounded-lg border p-3"
      onSubmit={e => {
        e.preventDefault();
        const year = Number(form.year);
        attach.run({ id: appointmentId, expectedVersion: version, input: { firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone.trim(), vin: form.vin.trim() || null, year: form.year.trim() && Number.isInteger(year) ? year : null, make: form.make.trim(), model: form.model.trim() } }, () => setOpen(false));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelClass}>First name<input required className={inputClass} value={form.firstName} onChange={set('firstName')} autoComplete="off" /></label>
        <label className={labelClass}>Last name<input className={inputClass} value={form.lastName} onChange={set('lastName')} autoComplete="off" /></label>
        <label className={labelClass}>Mobile<input required className={inputClass} inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="off" /></label>
        <label className={labelClass}>Year<input className={inputClass} inputMode="numeric" value={form.year} onChange={set('year')} /></label>
        <label className={labelClass}>Make<input className={inputClass} value={form.make} onChange={set('make')} /></label>
        <label className={labelClass}>Model<input className={inputClass} value={form.model} onChange={set('model')} /></label>
        <label className={`${labelClass} sm:col-span-3`}>VIN (or leave empty and read it at check-in)<input className={`${inputClass} font-mono`} value={form.vin} onChange={set('vin')} autoComplete="off" /></label>
      </div>
      <p className="text-xs text-muted-foreground">If a customer already has this mobile number, the appointment goes on their record.</p>
      <FormError error={attach.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={attach.pending} className={pillClass}>{attach.pending ? 'Saving' : 'Save to the appointment'}</button>
        <button type="button" className={`${pillClass} bg-transparent shadow-none`} onClick={() => { setOpen(false); attach.reset(); }}>Cancel</button>
      </div>
    </form>
  );
}
