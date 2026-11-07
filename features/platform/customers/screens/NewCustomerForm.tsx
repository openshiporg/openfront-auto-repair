'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';

/**
 * A new customer at the counter or on the phone. The server normalises the phone and email, checks
 * for duplicates by contact and returns DUPLICATE with the existing record; the advisor then opens
 * that record or confirms a different person (a shared family phone).
 */
export function NewCustomerForm({ shops }: { shops: { id: string; code: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ firstName: '', lastName: '', mobile: '', email: '', homeShopId: shops[0]?.id ?? '', serviceTexts: true, allowDuplicate: false });
  const save = useCommand<{ id: string; displayName: string }>('saveCustomer', ['/dashboard/platform/customers']);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));
  const duplicate = /already exists/.test(save.error);

  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>New customer</button>;
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={e => {
        e.preventDefault();
        const contacts = [
          form.mobile.trim() ? { kind: 'mobile', value: form.mobile.trim(), isPrimary: true } : null,
          form.email.trim() ? { kind: 'email', value: form.email.trim(), isPrimary: !form.mobile.trim() } : null,
        ].filter(Boolean);
        save.run({ input: { firstName: form.firstName, lastName: form.lastName, homeShopId: form.homeShopId, preferredChannel: form.mobile.trim() ? 'sms' : 'email', contacts, allowDuplicate: form.allowDuplicate, serviceTextConsent: form.serviceTexts && Boolean(form.mobile.trim()) } }, () => {
          setForm(f => ({ ...f, firstName: '', lastName: '', mobile: '', email: '', allowDuplicate: false }));
          setOpen(false);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className={labelClass}>First name<input required className={inputClass} value={form.firstName} onChange={set('firstName')} autoComplete="off" /></label>
        <label className={labelClass}>Last name<input className={inputClass} value={form.lastName} onChange={set('lastName')} autoComplete="off" /></label>
        <label className={labelClass}>Mobile<input className={inputClass} inputMode="tel" placeholder="(916) 555-0100" value={form.mobile} onChange={set('mobile')} autoComplete="off" /></label>
        <label className={labelClass}>Email<input className={inputClass} type="email" value={form.email} onChange={set('email')} autoComplete="off" /></label>
        <label className={labelClass}>Home shop<select className={inputClass} value={form.homeShopId} onChange={set('homeShopId')}>{shops.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</select></label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={form.serviceTexts} onChange={set('serviceTexts')} />
        <span>The customer agreed to service texts about this visit (estimates, ready for pickup). Marketing texts need a signed form and are recorded separately.</span>
      </label>
      {duplicate ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={form.allowDuplicate} onChange={set('allowDuplicate')} />
          <span>This is a different person who shares the phone or email.</span>
        </label>
      ) : null}
      <FormError error={save.error} />
      <div className="flex gap-2">
        <button type="submit" disabled={save.pending} className={pillClass}>{save.pending ? 'Saving' : 'Save customer'}</button>
        <button type="button" className={`${pillClass} bg-transparent shadow-none`} onClick={() => { setOpen(false); save.reset(); }}>Cancel</button>
      </div>
    </form>
  );
}
