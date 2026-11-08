'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

type Line = { kind: string; description: string; operationCode: string; hours: string; partNumber: string; brand: string; partCategory: string; condition: string; qty: string; cost: string };

const CONDITIONS = ['new', 'used', 'rebuilt', 'reconditioned', 'remanufactured'];
const blank = (kind = 'labor'): Line => ({ kind, description: '', operationCode: '', hours: '', partNumber: '', brand: '', partCategory: '', condition: 'new', qty: '1', cost: '' });

/** "48.00" → "4800"; whole-cent strings, never through a float. */
const toMinor = (t: string) => { const m = t.trim().replace(/[$,]/g, '').match(/^(\d{1,7})(?:\.(\d{0,2}))?$/); return m ? String(BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0')) : null; };
const fromMinor = (v: unknown) => { const s = String(v ?? ''); if (!/^\d+$/.test(s)) return ''; const p = s.padStart(3, '0'); return `${p.slice(0, -2)}.${p.slice(-2)}`; };
const toCenti = (t: string) => { const m = t.trim().match(/^(\d{1,3})(?:\.(\d{0,2}))?$/); return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0') : null; };
const fromCenti = (v: unknown) => (typeof v === 'number' && v > 0 ? `${Math.trunc(v / 100)}.${String(v % 100).padStart(2, '0')}` : '');

function fromStored(l: Record<string, unknown>): Line {
  return { ...blank(String(l.kind ?? 'labor')), description: String(l.description ?? ''), operationCode: String(l.operationCode ?? ''), hours: fromCenti(l.soldCentiHours), partNumber: String(l.partNumber ?? ''), brand: String(l.brand ?? ''), partCategory: String(l.partCategory ?? ''), condition: String(l.condition ?? 'new'), qty: l.quantityMilli ? String(Math.trunc(Number(l.quantityMilli) / 1000)) : '1', cost: fromMinor(l.unitCostMinor) };
}

export function CannedJobEditor({ cannedJobId, name: name0, category: category0, kind: kind0, description: description0, lines: lines0, editingDraft }: {
  cannedJobId: string | null; name: string; category: string; kind: string; description: string; lines: Record<string, unknown>[]; editingDraft: boolean
}) {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState(name0);
  const [category, setCategory] = React.useState(category0);
  const [kind, setKind] = React.useState(kind0);
  const [description, setDescription] = React.useState(description0);
  const [lines, setLines] = React.useState<Line[]>(lines0.length ? lines0.map(fromStored) : [blank('labor')]);
  const [problem, setProblem] = React.useState('');
  const save = useCommand<{ cannedJobId: string; versionNumber: number }>('saveCannedJob', ['/dashboard/platform/canned-jobs']);
  const update = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const build = () => {
    const out: Record<string, unknown>[] = [];
    for (const [i, l] of lines.entries()) {
      if (l.kind === 'labor') {
        const centi = l.hours ? toCenti(l.hours) : null;
        if (!l.operationCode.trim() && centi === null) return `Line ${i + 1}: a labor-guide code or the hours.`;
        out.push({ kind: 'labor', description: l.description.trim(), rateClassCode: 'general', ...(l.operationCode.trim() ? { operationCode: l.operationCode.trim().toUpperCase() } : {}), ...(centi !== null ? { soldCentiHours: centi } : {}) });
      } else {
        const qty = Number.parseInt(l.qty, 10);
        const cost = l.cost ? toMinor(l.cost) : null;
        if (!l.description.trim() || !Number.isSafeInteger(qty) || qty < 1) return `Line ${i + 1}: a description and a quantity.`;
        if (l.cost && cost === null) return `Line ${i + 1}: the cost is dollars and cents.`;
        out.push({ kind: l.kind, description: l.description.trim(), partNumber: l.partNumber.trim(), brand: l.brand.trim(), partCategory: l.partCategory.trim(), condition: l.condition, quantityMilli: qty * 1000, ...(cost ? { unitCostMinor: cost } : {}), ...(l.kind === 'tire' ? { isNewTire: l.condition === 'new' } : {}) });
      }
    }
    return out;
  };

  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      const built = build();
      if (typeof built === 'string') { setProblem(built); return; }
      setProblem('');
      save.run({ input: { ...(cannedJobId ? { cannedJobId } : { code }), name, category, kind, customerDescription: description, lines: built } }, r => { if (!cannedJobId) router.push(`/dashboard/platform/canned-jobs?job=${r.cannedJobId}`); });
    }}>
      <div className="grid gap-3 sm:grid-cols-4">
        {!cannedJobId ? <label className={labelClass}>Code<input className={inputClass} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="BRAKES-REAR" /></label> : null}
        <label className={cn(labelClass, cannedJobId ? 'sm:col-span-2' : '')}>Name<input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Rear brake pads" /></label>
        <label className={labelClass}>Category<input className={inputClass} value={category} onChange={e => setCategory(e.target.value)} placeholder="brakes" /></label>
        <label className={labelClass}>Kind
          <select className={inputClass} value={kind} onChange={e => setKind(e.target.value)}>{['repair', 'maintenance', 'diagnosis', 'inspection', 'tire', 'sublet'].map(k => <option key={k} value={k}>{k}</option>)}</select>
        </label>
      </div>
      <label className={labelClass}>What the customer reads on the estimate<textarea className={cn(inputClass, 'h-16 py-2')} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="space-y-2">
        <div className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Lines (priced when added to a job, by the shop&apos;s rates and parts matrix)</div>
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[7rem_1fr_repeat(4,minmax(0,8rem))_auto]">
            <select aria-label="Kind" className={inputClass} value={l.kind} onChange={e => update(i, { kind: e.target.value })}><option value="labor">Labor</option><option value="part">Part</option><option value="tire">Tire</option></select>
            <input aria-label="Description" className={inputClass} value={l.description} onChange={e => update(i, { description: e.target.value })} placeholder="Description" />
            {l.kind === 'labor' ? (<>
              <input aria-label="Labor-guide code" className={inputClass} value={l.operationCode} onChange={e => update(i, { operationCode: e.target.value })} placeholder="Guide code" />
              <input aria-label="Hours" className={inputClass} inputMode="decimal" value={l.hours} onChange={e => update(i, { hours: e.target.value })} placeholder="Hours" />
              <span className="max-sm:hidden" /><span className="max-sm:hidden" />
            </>) : (<>
              <input aria-label="Part number" className={inputClass} value={l.partNumber} onChange={e => update(i, { partNumber: e.target.value })} placeholder="Part no." />
              <select aria-label="Condition" className={inputClass} value={l.condition} onChange={e => update(i, { condition: e.target.value })}>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <input aria-label="Quantity" className={inputClass} inputMode="numeric" value={l.qty} onChange={e => update(i, { qty: e.target.value })} placeholder="Qty" />
              <input aria-label="Unit cost" className={inputClass} inputMode="decimal" value={l.cost} onChange={e => update(i, { cost: e.target.value })} placeholder="Cost" />
            </>)}
            <button type="button" className={cn(pillClass, 'bg-transparent shadow-none')} onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}>Remove</button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={pillClass} onClick={() => setLines([...lines, blank('labor')])}>Add labor</button>
          <button type="button" className={pillClass} onClick={() => setLines([...lines, blank('part')])}>Add part</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={cn(pillClass, 'bg-primary text-primary-foreground')} disabled={save.pending || (!cannedJobId && (!code.trim() || !name.trim()))}>{save.pending ? 'Saving' : editingDraft ? 'Save the draft' : cannedJobId ? 'Start a new draft' : 'Create as a draft'}</button>
        <span className="text-xs text-muted-foreground">Drafts are not used until published.</span>
        <FormError error={problem || save.error} />
      </div>
    </form>
  );
}
