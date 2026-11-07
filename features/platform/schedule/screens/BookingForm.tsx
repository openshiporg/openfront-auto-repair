'use client';

import * as React from 'react';
import { wallClockInstant as zonedInstant } from '@/lib/zonedTime';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';

type Customer = { id: string; name: string; vehicles: { id: string; label: string }[] };

/**
 * Book from the counter or the phone. The server checks hours, slot alignment, the waiter cut-off and
 * capacity under a per-shop, per-day lock, so two advisors can't both take the last slot.
 */
export function BookingForm({ shopId, timeZone, date, customers, waiterCutoff }: { shopId: string; timeZone: string; date: string; customers: Customer[]; waiterCutoff: string | null }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ customerId: '', vehicleId: '', leadName: '', leadPhone: '', time: '08:00', kind: 'drop_off', hours: '1.0', services: '', concern: '', confirm: true });
  const book = useCommand<{ reference: string }>('bookShopAppointment');
  const customer = customers.find(c => c.id === form.customerId);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm(f => ({ ...f, [k]: value, ...(k === 'customerId' ? { vehicleId: customers.find(c => c.id === value)?.vehicles[0]?.id ?? '' } : {}) }));
  };

  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Book appointment</button>;
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={e => {
        e.preventDefault();
        const centi = Math.round(Number(form.hours) * 100);
        book.run({
          shopId, startsAt: zonedInstant(timeZone, date, form.time).toISOString(), kind: form.kind, estimatedCentiHours: Number.isFinite(centi) ? centi : 100,
          customerId: form.customerId || undefined, vehicleId: form.vehicleId || undefined,
          lead: form.customerId ? undefined : { name: form.leadName.trim(), phone: form.leadPhone.trim() },
          requestedServices: form.services.split(',').map(s => s.trim()).filter(Boolean), concernText: form.concern.trim() || undefined, confirm: form.confirm && Boolean(form.customerId),
        }, () => { setOpen(false); setForm(f => ({ ...f, customerId: '', vehicleId: '', leadName: '', leadPhone: '', services: '', concern: '' })); });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>Customer
          <select className={inputClass} value={form.customerId} onChange={set('customerId')}>
            <option value="">New caller (not yet a customer)</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {customer ? (
          <label className={labelClass}>Vehicle
            <select className={inputClass} value={form.vehicleId} onChange={set('vehicleId')}>
              <option value="">Not sure yet</option>
              {customer.vehicles.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className={labelClass}>Caller name<input required className={inputClass} value={form.leadName} onChange={set('leadName')} /></label>
            <label className={labelClass}>Caller phone<input className={inputClass} inputMode="tel" value={form.leadPhone} onChange={set('leadPhone')} /></label>
          </>
        )}
        <label className={labelClass}>Time ({date})<input type="time" step={1800} required className={inputClass} value={form.time} onChange={set('time')} /></label>
        <label className={labelClass}>Kind
          <select className={inputClass} value={form.kind} onChange={set('kind')}>
            <option value="drop_off">Drop-off</option>
            <option value="waiter">Waiter{waiterCutoff ? ` (before ${waiterCutoff})` : ''}</option>
          </select>
        </label>
        <label className={labelClass}>Estimated hours<input inputMode="decimal" className={inputClass} value={form.hours} onChange={set('hours')} /></label>
        <label className={`${labelClass} sm:col-span-2`}>Services (comma separated)<input className={inputClass} placeholder="Oil and filter change, Tire rotation" value={form.services} onChange={set('services')} /></label>
      </div>
      <label className={labelClass}>Concern, in the customer&apos;s words<textarea rows={2} className={`${inputClass} h-auto py-2`} value={form.concern} onChange={set('concern')} /></label>
      {form.customerId ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.confirm} onChange={set('confirm')} /> Confirmed with the customer</label> : null}
      <FormError error={book.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={book.pending} className={pillClass}>{book.pending ? 'Booking' : 'Book'}</button>
        <button type="button" className={`${pillClass} bg-transparent shadow-none`} onClick={() => { setOpen(false); book.reset(); }}>Cancel</button>
      </div>
    </form>
  );
}
