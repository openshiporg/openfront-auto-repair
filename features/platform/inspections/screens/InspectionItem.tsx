'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FormError, inputClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

type Spec = { unit: string; positions?: string[]; thresholds: { max?: number; min?: number; condition: string }[] };
export type ItemView = {
  id: string; condition: string; derivedCondition: string; overrideReason: string; measurements: { position?: string; value: number; unit?: string }[] | null; notes: string; version: number; mediaCount: number
  templateItem: { code: string; section: string; label: string; measurement: Spec | null; photoRequiredOn: string[] | null; required: boolean; sortOrder: number; cannedJobCode: string } | null
};

const RANK: Record<string, number> = { green: 1, yellow: 2, red: 3 };
/** Mirrors the server's rule so the tech sees the colour before saving; the server decides. */
function derive(spec: Spec | null, values: number[]) {
  if (!spec || !values.length) return null;
  let worst = 'green';
  for (const v of values) {
    const hit = spec.thresholds.find(t => (t.max === undefined || v <= t.max) && (t.min === undefined || v >= t.min));
    if (RANK[hit?.condition ?? 'green'] > RANK[worst]) worst = hit!.condition;
  }
  return worst;
}

const CHOICES = [
  { v: 'green', l: 'Good', dot: 'bg-emerald-500' },
  { v: 'yellow', l: 'Soon', dot: 'bg-amber-500' },
  { v: 'red', l: 'Now', dot: 'bg-red-500' },
  { v: 'na', l: 'N/A', dot: 'bg-muted-foreground/50' },
];
const DOT: Record<string, string> = { green: 'bg-emerald-500', yellow: 'bg-amber-500', red: 'bg-red-500', na: 'bg-muted-foreground/50', not_inspected: 'border border-muted-foreground/60' };

export function ItemCard({ item, editable }: { item: ItemView; editable: boolean }) {
  const t = item.templateItem;
  const spec = t?.measurement ?? null;
  const positions = spec?.positions?.length ? spec.positions : spec ? [''] : [];
  const initial = Object.fromEntries((item.measurements ?? []).map(m => [m.position ?? '', String(m.value)]));
  const [values, setValues] = React.useState<Record<string, string>>(initial);
  const [condition, setCondition] = React.useState(item.condition === 'not_inspected' ? '' : item.condition);
  const [notes, setNotes] = React.useState(item.notes);
  const [reason, setReason] = React.useState(item.overrideReason);
  const save = useCommand('recordInspectionItem', ['/dashboard/platform/inspections']);
  const numbers = positions.map(p => values[p]).filter(v => v !== undefined && v !== '').map(v => Number.parseInt(v, 10)).filter(Number.isSafeInteger);
  const derived = derive(spec, numbers);
  const chosen = condition || derived || '';
  const needsReason = Boolean(derived && condition && condition !== derived);
  const photoOn = t?.photoRequiredOn ?? [];
  const needsPhoto = photoOn.includes(item.condition) && !item.mediaCount;
  const dirty = JSON.stringify(values) !== JSON.stringify(initial) || condition !== (item.condition === 'not_inspected' ? '' : item.condition) || notes !== item.notes || reason !== item.overrideReason;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('size-3 shrink-0 rounded-full', DOT[item.condition] ?? DOT.not_inspected)} />
          <span className="font-medium">{t?.label}</span>
          {t?.required && item.condition === 'not_inspected' ? <span className="font-mono text-xs text-muted-foreground">REQUIRED</span> : null}
        </div>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.mediaCount ? `${item.mediaCount} PHOTO${item.mediaCount === 1 ? '' : 'S'}` : needsPhoto ? <span className="text-red-600">PHOTO NEEDED</span> : null}</span>
      </div>
      {!editable ? (
        <div className="space-y-1 text-sm">
          {item.measurements?.length ? <div className="font-mono text-xs">{item.measurements.map(m => `${m.position ? `${m.position} ` : ''}${m.value} ${m.unit ?? spec?.unit ?? ''}`).join(' · ')}</div> : null}
          {item.notes ? <p className="text-muted-foreground">{item.notes}</p> : null}
          {item.overrideReason ? <p className="text-xs text-muted-foreground">Marked {item.condition} instead of {item.derivedCondition}: {item.overrideReason}</p> : null}
        </div>
      ) : (
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          save.run({ input: { resultId: item.id, expectedVersion: item.version, condition: chosen || undefined, measurements: positions.filter(p => values[p] !== undefined && values[p] !== '').map(p => ({ ...(p ? { position: p } : {}), value: Number.parseInt(values[p], 10) })), notes, overrideReason: needsReason ? reason : undefined } });
        }}>
          {positions.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {positions.map(p => (
                <label key={p || 'value'} className="block space-y-1 text-xs text-muted-foreground">{p || 'Reading'} ({spec?.unit})
                  <input className={inputClass} inputMode="numeric" value={values[p] ?? ''} onChange={e => setValues({ ...values, [p]: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
                </label>
              ))}
            </div>
          ) : null}
          <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            {CHOICES.map(c => (
              <button key={c.v} type="button" aria-pressed={chosen === c.v} onClick={() => setCondition(c.v === condition ? '' : c.v)}
                className={cn('inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium', chosen === c.v ? 'bg-background shadow-sm' : 'text-muted-foreground')}>
                <span className={cn('size-2 rounded-full', c.dot)} />{c.l}
              </button>
            ))}
          </div>
          {derived ? <p className="text-xs text-muted-foreground">The readings say {derived}.</p> : null}
          {needsReason ? <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder={`Why ${condition}, not ${derived}?`} /> : null}
          <textarea className={cn(inputClass, 'h-16 py-2')} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for the customer and the advisor" />
          <div className="flex flex-wrap items-center gap-2">
            <button className={cn(pillClass, dirty && 'bg-primary text-primary-foreground')} disabled={save.pending || !chosen || (needsReason && !reason.trim())}>{save.pending ? 'Saving' : 'Save'}</button>
            <PhotoButton resultId={item.id} />
            <FormError error={save.error} />
          </div>
        </form>
      )}
    </div>
  );
}

/** Takes a photo with the tablet camera and uploads it to the shop's private storage. */
function PhotoButton({ resultId }: { resultId: string }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" className="hidden" onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setPending(true); setError('');
        const form = new FormData();
        form.set('resultId', resultId); form.set('idempotencyKey', `photo:${crypto.randomUUID()}`); form.set('file', file);
        try {
          const res = await fetch('/api/inspection-photos', { method: 'POST', body: form });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) setError(body.error ?? 'The photo did not save.');
          else router.refresh();
        } catch { setError('The photo did not save. Check the connection.'); } finally { setPending(false); }
      }} />
      <button type="button" className={pillClass} disabled={pending} onClick={() => input.current?.click()}>{pending ? 'Uploading' : 'Add photo'}</button>
      {error ? <span role="alert" className="text-xs text-red-600">{error}</span> : null}
    </>
  );
}
