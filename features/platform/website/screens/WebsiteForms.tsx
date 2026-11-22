'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FormError, inputClass, labelClass } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';
import { saveService, saveShopDetails } from '../actions/website';

const primary = cn(pillClass, 'bg-primary text-primary-foreground');
const areaClass = cn(inputClass, 'h-auto min-h-20 py-2 max-md:h-auto');
const checkClass = 'flex min-h-11 items-center gap-2 text-sm md:min-h-0';

export type ServiceRow = { id: string; name: string; description: string; price: string; hours: string; bookable: boolean; isPublished: boolean };
export type Template = { name: string; description: string };

function useSave() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => {
    setError(''); setSaved(false);
    start(async () => {
      const r = await work();
      if (!r.ok) { setError(r.error); return; }
      setSaved(true); after?.(); router.refresh();
    });
  };
  return { pending, error, saved, run };
}

/** One line of the public price list: add a new one, or change one that is there. */
export function ServiceForm({ shopId, service, templates = [] }: { shopId: string; service?: ServiceRow; templates?: Template[] }) {
  const blank = { name: '', description: '', price: '', hours: '', bookable: true, isPublished: true };
  const [v, setV] = React.useState(service ?? blank);
  const save = useSave();
  const set = (patch: Partial<typeof v>) => setV(o => ({ ...o, ...patch }));
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); save.run(() => saveService({ id: service?.id, shopId, ...v }), () => { if (!service) setV(blank); }); }}>
      {!service && templates.length ? (
        <label className={cn(labelClass, 'md:col-span-2')}>Start from one of your canned jobs (optional)
          <select className={inputClass} value="" onChange={e => { const t = templates.find(x => x.name === e.target.value); if (t) set({ name: t.name, description: t.description }); }}>
            <option value="">Choose a job to copy its name and wording</option>
            {templates.map(t => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className={labelClass}>Service name<input required maxLength={80} className={inputClass} value={v.name} onChange={e => set({ name: e.target.value })} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={labelClass}>Price from, in dollars<input inputMode="decimal" placeholder="Blank = estimate" className={inputClass} value={v.price} onChange={e => set({ price: e.target.value })} /></label>
        <label className={labelClass}>Time, in hours<input inputMode="decimal" placeholder="1.5" className={inputClass} value={v.hours} onChange={e => set({ hours: e.target.value })} /></label>
      </div>
      <label className={cn(labelClass, 'md:col-span-2')}>What the customer gets<textarea maxLength={600} className={areaClass} value={v.description} onChange={e => set({ description: e.target.value })} /></label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 md:col-span-2">
        <label className={checkClass}><input type="checkbox" className="size-4" checked={v.isPublished} onChange={e => set({ isPublished: e.target.checked })} />Show on the website</label>
        <label className={checkClass}><input type="checkbox" className="size-4" checked={v.bookable} onChange={e => set({ bookable: e.target.checked })} />Customers can book it online</label>
        <button type="submit" disabled={save.pending} className={primary}>{save.pending ? 'Saving' : service ? 'Save' : 'Add to the price list'}</button>
        {save.saved ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Saved</span> : null}
      </div>
      <div className="md:col-span-2"><FormError error={save.error} /></div>
    </form>
  );
}

/** What the website says about one shop. */
export function ShopDetailsForm({ shopId, tagline, about, barArd, isPublished }: { shopId: string; tagline: string; about: string; barArd: string; isPublished: boolean }) {
  const [v, setV] = React.useState({ tagline, about, barArd, isPublished });
  const save = useSave();
  const set = (patch: Partial<typeof v>) => setV(o => ({ ...o, ...patch }));
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); save.run(() => saveShopDetails({ shopId, ...v })); }}>
      <label className={labelClass}>One line under the shop name<input maxLength={140} className={inputClass} value={v.tagline} onChange={e => set({ tagline: e.target.value })} /></label>
      <label className={labelClass}>State registration number shown to customers<input maxLength={40} className={inputClass} value={v.barArd} onChange={e => set({ barArd: e.target.value })} /></label>
      <label className={cn(labelClass, 'md:col-span-2')}>About the shop<textarea maxLength={1200} className={areaClass} value={v.about} onChange={e => set({ about: e.target.value })} /></label>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 md:col-span-2">
        <label className={checkClass}><input type="checkbox" className="size-4" checked={v.isPublished} onChange={e => set({ isPublished: e.target.checked })} />Show this shop on the website</label>
        <button type="submit" disabled={save.pending} className={primary}>{save.pending ? 'Saving' : 'Save'}</button>
        {save.saved ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-400">Saved</span> : null}
      </div>
      <div className="md:col-span-2"><FormError error={save.error} /></div>
    </form>
  );
}
