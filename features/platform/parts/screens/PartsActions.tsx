'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { toMinor } from '../../repair-orders/screens/RepairOrderForms';
import { cn } from '@/lib/utils';

export const PARTS_PATHS = [
  '/dashboard/platform/parts', '/dashboard/platform/stock', '/dashboard/platform/purchase-orders', '/dashboard/platform/cores',
  '/dashboard/platform/supplier-invoices', '/dashboard/platform/tires', '/dashboard/platform/approvals',
];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');
type Waiting = { approvalRequired?: boolean; approvalRequestId?: string; message?: string; status?: string };

function Waits({ result }: { result: Waiting | null }) {
  if (result?.approvalRequired) {
    return <p role="status" className="text-sm">A manager has to approve this. <Link className="underline" href="/dashboard/platform/approvals">Open approvals</Link>, then press it again.</p>;
  }
  return result?.message ? <p role="status" className="text-sm">{result.message}</p> : null;
}

/** One command on a button. `ask` prompts for words that go in the named variable. */
export function Act({ op, vars, children, ask, askKey = 'reason', confirm, primaryStyle }: {
  op: string; vars: Record<string, unknown>; children: React.ReactNode; ask?: string; askKey?: string; confirm?: string; primaryStyle?: boolean;
}) {
  const cmd = useCommand<Waiting>(op, PARTS_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={primaryStyle ? primary : pillClass} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
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

type Supplier = { id: string; name: string; adapter: string };

/** Ask a supplier for a price for one part line of a job. */
export function QuoteForm({ shopId, jobId, partNumber, quantityMilli, suppliers }: { shopId: string; jobId: string; partNumber: string; quantityMilli: number; suppliers: Supplier[] }) {
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? '');
  const quote = useCommand<{ found?: boolean; message?: string }>('requestSupplierQuote', PARTS_PATHS);
  const chosen = suppliers.find(s => s.id === supplierId);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); quote.run({ shopId, supplierId, partNumber, quantityMilli, jobId }); }}>
      <label className={cn(labelClass, 'min-w-40 flex-1')}>Ask
        <select className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}{s.adapter === 'manual' ? ' (phone)' : ''}</option>)}
        </select>
      </label>
      <button type="submit" disabled={quote.pending || !chosen || chosen.adapter === 'manual'} className={pillClass}>{quote.pending ? 'Asking' : 'Get a price'}</button>
      <div className="basis-full"><FormError error={quote.error} />{quote.result?.found === false ? <p role="status" className="text-sm">{quote.result.message}</p> : null}</div>
    </form>
  );
}

/** Write down a price a supplier gave over the phone. */
export function PhoneQuoteForm({ shopId, jobId, partNumber, suppliers }: { shopId: string; jobId: string; partNumber: string; suppliers: Supplier[] }) {
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? '');
  const [price, setPrice] = React.useState('');
  const [who, setWho] = React.useState('');
  const save = useCommand('recordSupplierQuote', PARTS_PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Record a phone quote</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-4" onSubmit={e => {
      e.preventDefault();
      const cost = toMinor(price);
      if (!cost) return;
      save.run({ input: { shopId, jobId, supplierId, source: 'phone', partNumber, unitCostMinor: cost, phoneEvidence: { spokeTo: who.trim() } } }, () => setOpen(false));
    }}>
      <label className={labelClass}>Supplier<select className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className={labelClass}>Their price each<input className={inputClass} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" /></label>
      <label className={labelClass}>Spoke to<input className={inputClass} value={who} onChange={e => setWho(e.target.value)} /></label>
      <div className="flex items-end gap-2"><button type="submit" disabled={save.pending} className={primary}>{save.pending ? 'Saving' : 'Save quote'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-4"><FormError error={save.error} /></div>
    </form>
  );
}

/** Order a chosen quote for its job. */
export function OrderQuoteButton({ shopId, supplierId, quoteId, jobId, quantityMilli }: { shopId: string; supplierId: string; quoteId: string; jobId: string; quantityMilli: number }) {
  return <Act primaryStyle op="createShopSupplierOrder" vars={{ input: { shopId, supplierId, kind: 'job', lines: [{ partQuoteId: quoteId, jobId, quantityMilli }] } }}>Order this</Act>;
}

/** Receive every open line on an order in full, with a slip number as the receipt key. */
export function ReceiveForm({ orderId, lines }: { orderId: string; lines: { id: string; partNumber: string; left: number }[] }) {
  const [open, setOpen] = React.useState(false);
  const [qty, setQty] = React.useState<Record<string, string>>(() => Object.fromEntries(lines.map(l => [l.id, String(l.left / 1000)])));
  const [slip, setSlip] = React.useState('');
  const rec = useCommand('receiveShopSupplierOrder', PARTS_PATHS);
  if (!open) return <button type="button" className={primary} onClick={() => setOpen(true)}>Receive</button>;
  return (
    <form className="w-full space-y-3 rounded-md border p-3" onSubmit={e => {
      e.preventDefault();
      const picked = lines.map(l => ({ orderLineId: l.id, quantityMilli: Math.round(Number(qty[l.id] || 0) * 1000) })).filter(l => l.quantityMilli > 0);
      if (!picked.length) return;
      rec.run({ input: { orderId, receiptKey: `${orderId}:${slip.trim() || crypto.randomUUID()}`, lines: picked } }, () => setOpen(false));
    }}>
      {lines.map(l => (
        <label key={l.id} className={cn(labelClass, 'grid grid-cols-[1fr_6rem] items-center gap-3')}><span className="min-w-0 break-words font-mono text-sm text-foreground">{l.partNumber}</span>
          <input className={inputClass} inputMode="decimal" aria-label={`Received ${l.partNumber}`} value={qty[l.id] ?? ''} onChange={e => setQty({ ...qty, [l.id]: e.target.value })} /></label>
      ))}
      <label className={labelClass}>Packing slip number<input className={inputClass} value={slip} onChange={e => setSlip(e.target.value)} placeholder="Optional. The same slip twice counts once." /></label>
      <div className="flex gap-2"><button type="submit" disabled={rec.pending} className={primary}>{rec.pending ? 'Saving' : 'Put on the shelf'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <FormError error={rec.error} />
    </form>
  );
}

/** Take the order by phone: who answered, and their confirmation number. */
export function PhoneOrderForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [who, setWho] = React.useState('');
  const [conf, setConf] = React.useState('');
  const placed = useCommand('recordPhoneOrder', PARTS_PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Placed by phone</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); placed.run({ orderId, spokeTo: who.trim(), supplierConfirmation: conf.trim() || undefined }, () => setOpen(false)); }}>
      <label className={labelClass}>Who took it<input className={inputClass} value={who} onChange={e => setWho(e.target.value)} /></label>
      <label className={labelClass}>Their confirmation<input className={inputClass} value={conf} onChange={e => setConf(e.target.value)} /></label>
      <div className="flex items-end gap-2"><button type="submit" disabled={placed.pending} className={primary}>{placed.pending ? 'Saving' : 'Save'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-3"><FormError error={placed.error} /></div>
    </form>
  );
}

/** Count a set of stocked parts, then post the variance. */
export function CountForm({ shopId, items }: { shopId: string; items: { id: string; sku: string; onHand: number }[] }) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const start = useCommand('startShopCycleCount', PARTS_PATHS);
  const record = useCommand('recordShopCounts', PARTS_PATHS);
  const post = useCommand<Waiting>('postShopCycleCount', PARTS_PATHS);
  const countId = (start.result as { id?: string } | null)?.id;
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Count stock</button>;
  return (
    <div className="w-full space-y-3 rounded-md border p-3">
      {!countId ? (
        <>
          <p className="text-sm text-muted-foreground">Enter what is on the shelf for the parts you counted. Leave the others blank.</p>
          {items.map(i => (
            <label key={i.id} className={cn(labelClass, 'grid grid-cols-[1fr_6rem] items-center gap-3')}><span className="min-w-0 break-words text-sm text-foreground"><span className="font-mono">{i.sku}</span></span>
              <input className={inputClass} inputMode="decimal" aria-label={`Counted ${i.sku}`} value={picked[i.id] ?? ''} onChange={e => setPicked({ ...picked, [i.id]: e.target.value })} /></label>
          ))}
          <div className="flex gap-2">
            <button type="button" disabled={start.pending} className={primary} onClick={() => {
              const chosen = items.filter(i => (picked[i.id] ?? '').trim() !== '');
              if (!chosen.length) return;
              start.run({ shopId, shopItemIds: chosen.map(i => i.id) });
            }}>{start.pending ? 'Starting' : 'Start the count'}</button>
            <button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <FormError error={start.error} />
        </>
      ) : (
        <>
          <p className="text-sm">Count {(start.result as { reference?: string } | null)?.reference} started.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={record.pending} className={pillClass} onClick={() => record.run({ cycleCountId: countId, counts: Object.entries(picked).filter(([, v]) => v.trim() !== '').map(([shopItemId, v]) => ({ shopItemId, countedMilli: Math.round(Number(v) * 1000) })) })}>{record.pending ? 'Saving' : 'Save the counts'}</button>
            <button type="button" disabled={post.pending || !record.result} className={primary} onClick={() => post.run({ cycleCountId: countId })}>{post.pending ? 'Posting' : 'Post the variance'}</button>
          </div>
          <Waits result={post.result} /><FormError error={record.error || post.error} />
        </>
      )}
    </div>
  );
}

/** Add or remove stock for a reason (damage, found boxes). */
export function AdjustForm({ shopItemId, sku }: { shopItemId: string; sku: string }) {
  const [open, setOpen] = React.useState(false);
  const [delta, setDelta] = React.useState('');
  const [reason, setReason] = React.useState('');
  const adj = useCommand<Waiting>('adjustShopStock', PARTS_PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Adjust</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-3" onSubmit={e => {
      e.preventDefault();
      const n = Math.round(Number(delta) * 1000);
      if (!n) return;
      adj.run({ shopItemId, deltaMilli: n, reason: reason.trim() }, r => { if (!r?.approvalRequired) setOpen(false); });
    }}>
      <label className={labelClass}>{sku}: add or remove<input className={inputClass} inputMode="decimal" value={delta} onChange={e => setDelta(e.target.value)} placeholder="-2 or 3" /></label>
      <label className={labelClass}>Why<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex items-end gap-2"><button type="submit" disabled={adj.pending} className={primary}>{adj.pending ? 'Saving' : 'Save'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-3"><Waits result={adj.result} /><FormError error={adj.error} /></div>
    </form>
  );
}

/** Enter a supplier's invoice, one line per row: part, quantity, unit cost, core credit. */
export function SupplierInvoiceForm({ shopId, suppliers }: { shopId: string; suppliers: Supplier[] }) {
  const [open, setOpen] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? '');
  const [number, setNumber] = React.useState('');
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [total, setTotal] = React.useState('');
  const [text, setText] = React.useState('');
  const [problem, setProblem] = React.useState('');
  const rec = useCommand('recordShopSupplierInvoice', PARTS_PATHS);
  if (!open) return <button type="button" className={primary} onClick={() => setOpen(true)}>Enter an invoice</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-4" onSubmit={e => {
      e.preventDefault();
      setProblem('');
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split(/[,\t]/).map(c => c.trim()));
      const parsed = lines.map(([partNumber, qty, cost, core]) => ({ partNumber, quantityMilli: Math.round(Number(qty) * 1000), unitCostMinor: toMinor(cost ?? ''), coreCreditMinor: core ? toMinor(core) : undefined }));
      if (!parsed.length || parsed.some(l => !l.partNumber || !(l.quantityMilli > 0) || !l.unitCostMinor)) { setProblem('Each line needs a part number, a quantity and a unit cost, separated by commas.'); return; }
      const t = toMinor(total);
      if (!t) { setProblem('Enter the invoice total.'); return; }
      rec.run({ input: { shopId, supplierId, invoiceNumber: number.trim(), invoiceDate: date, totalMinor: t, lines: parsed } }, () => setOpen(false));
    }}>
      <label className={labelClass}>Supplier<select className={inputClass} value={supplierId} onChange={e => setSupplierId(e.target.value)}>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className={labelClass}>Invoice number<input className={inputClass} value={number} onChange={e => setNumber(e.target.value)} /></label>
      <label className={labelClass}>Date<input type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className={labelClass}>Total<input className={inputClass} inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} placeholder="0.00" /></label>
      <label className={cn(labelClass, 'sm:col-span-4')}>Lines: part, quantity, unit cost, core credit (optional)
        <textarea className={cn(inputClass, 'h-28 py-2 font-mono')} value={text} onChange={e => setText(e.target.value)} placeholder={'P06075, 1, 48.00\nALT-11481, 1, 189.00, 45.00'} /></label>
      <div className="flex gap-2 sm:col-span-4"><button type="submit" disabled={rec.pending} className={primary}>{rec.pending ? 'Saving' : 'Save invoice'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-4"><FormError error={problem || rec.error} /></div>
    </form>
  );
}

const METHODS: [string, string][] = [['form_handed_over', 'Form handed to the customer'], ['submitted_electronic', 'Sent in electronically'], ['submitted_paper', 'Sent in on paper']];

/** Finish a tire registration with how it was done. */
export function TireCompleteForm({ obligationId }: { obligationId: string }) {
  const [open, setOpen] = React.useState(false);
  const [method, setMethod] = React.useState(METHODS[0][0]);
  const done = useCommand('completeShopTireRegistration', PARTS_PATHS);
  if (!open) return <button type="button" className={primary} onClick={() => setOpen(true)}>Complete</button>;
  return (
    <form className="flex w-full flex-wrap items-end gap-2 rounded-md border p-3" onSubmit={e => { e.preventDefault(); done.run({ obligationId, method }, () => setOpen(false)); }}>
      <label className={cn(labelClass, 'min-w-48 flex-1')}>How<select className={inputClass} value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <button type="submit" disabled={done.pending} className={primary}>{done.pending ? 'Saving' : 'Save'}</button>
      <button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button>
      <div className="basis-full"><FormError error={done.error} /></div>
    </form>
  );
}

/** Record a tire's DOT number against a job. */
export function TinForm({ jobId }: { jobId: string }) {
  const [tin, setTin] = React.useState('');
  const [position, setPosition] = React.useState('LF');
  const rec = useCommand('recordShopJobTire', PARTS_PATHS);
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); rec.run({ jobId, position, tin: tin.trim() }, () => setTin('')); }}>
      <label className={labelClass}>Position<select className={inputClass} value={position} onChange={e => setPosition(e.target.value)}>{['LF', 'RF', 'LR', 'RR', 'spare', 'other'].map(p => <option key={p}>{p}</option>)}</select></label>
      <label className={cn(labelClass, 'min-w-44 flex-1')}>DOT tire number<input className={cn(inputClass, 'font-mono')} value={tin} onChange={e => setTin(e.target.value)} placeholder="DOT B3HX 4C8R 2423" /></label>
      <button type="submit" disabled={rec.pending || !tin.trim()} className={pillClass}>{rec.pending ? 'Saving' : 'Add'}</button>
      <div className="basis-full"><FormError error={rec.error} /></div>
    </form>
  );
}
