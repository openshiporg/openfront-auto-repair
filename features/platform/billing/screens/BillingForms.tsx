'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { toMinor } from '../../repair-orders/screens/RepairOrderForms';
import { cn } from '@/lib/utils';

const PATHS = ['/dashboard/platform/repair-orders', '/dashboard/platform/board', '/dashboard/platform/day-close', '/dashboard/platform/receivables'];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');
type Waiting = { approvalRequired?: boolean; approvalRequestId?: string };

function NeedsApproval({ result }: { result: Waiting | null }) {
  return result?.approvalRequired ? (
    <p role="status" className="text-sm">
      This needs a second person to approve it. <Link className="underline" href="/dashboard/platform/approvals">Open approvals</Link>, then send it again.
    </p>
  ) : null;
}

/** Check the odometer and PO, then lock the invoice. Nothing about a finalized invoice can be edited afterward. */
export function FinalizeForm({ repairOrderId, version, odometerHint, poRequired }: { repairOrderId: string; version: number; odometerHint: number | null; poRequired: boolean }) {
  const [odometer, setOdometer] = React.useState(odometerHint ? String(odometerHint) : '');
  const [po, setPo] = React.useState('');
  const fin = useCommand('finalizeShopInvoice', PATHS);
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => {
      e.preventDefault();
      const n = Number(odometer.replace(/,/g, ''));
      fin.run({ input: { repairOrderId, expectedVersion: version, odometerOut: Number.isFinite(n) && n > 0 ? n : undefined, poNumber: po.trim() || undefined } });
    }}>
      <label className={labelClass}>Odometer out<input className={inputClass} inputMode="numeric" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="Reading as it leaves" /></label>
      <label className={labelClass}>PO number{poRequired ? ' (required)' : ''}<input className={inputClass} value={po} onChange={e => setPo(e.target.value)} /></label>
      <div className="flex items-end"><button type="submit" disabled={fin.pending} className={primary}>{fin.pending ? 'Working' : 'Finalize the invoice'}</button></div>
      <div className="sm:col-span-3"><FormError error={fin.error} /></div>
    </form>
  );
}

const TENDERS: [string, string][] = [['cash', 'Cash'], ['check', 'Check'], ['card_present', 'Card on the terminal'], ['card_link', 'Card by link'], ['ach', 'Bank transfer'], ['financing', 'Financing']];

/** Cash, check, a card on the terminal, or a card link. A card link opens the processor's page; the result is checked until it settles. */
export function PaymentForm({ purpose, invoiceIds, repairOrderId, balanceMinor, cardReady, defaultPayer }: {
  purpose: 'invoice' | 'deposit'; invoiceIds?: string[]; repairOrderId?: string; balanceMinor?: string; cardReady: boolean; defaultPayer: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [tender, setTender] = React.useState('cash');
  const [amount, setAmount] = React.useState(balanceMinor ? (Number(balanceMinor) / 100).toFixed(2) : '');
  const [check, setCheck] = React.useState('');
  const [payer, setPayer] = React.useState(defaultPayer);
  const pay = useCommand<{ checkoutUrl?: string }>('takeShopPayment', PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>{purpose === 'deposit' ? 'Take a deposit' : 'Take a payment'}</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-4" onSubmit={e => {
      e.preventDefault();
      const minor = toMinor(amount);
      if (!minor || minor === '0') return;
      pay.run({ input: { purpose, invoiceIds, repairOrderId, tender, amountMinor: minor, payerName: payer.trim() || undefined, checkNumber: tender === 'check' ? check.trim() || undefined : undefined } }, data => {
        if (data?.checkoutUrl) window.open(data.checkoutUrl, '_blank', 'noopener');
      });
    }}>
      <label className={labelClass}>Tender
        <select className={inputClass} value={tender} onChange={e => setTender(e.target.value)}>
          {TENDERS.filter(([k]) => cardReady || k !== 'card_link').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className={labelClass}>Amount<input className={inputClass} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
      {tender === 'check' ? <label className={labelClass}>Check number<input className={inputClass} value={check} onChange={e => setCheck(e.target.value)} /></label> : <label className={labelClass}>Paid by<input className={inputClass} value={payer} onChange={e => setPayer(e.target.value)} /></label>}
      <div className="flex items-end gap-2">
        <button type="submit" disabled={pay.pending} className={primary}>{pay.pending ? 'Working' : tender === 'card_link' ? 'Open the card page' : 'Record it'}</button>
        <button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <div className="space-y-1 sm:col-span-4">
        <FormError error={pay.error} />
        {pay.result?.checkoutUrl ? <p className="text-sm">The card page opened in a new tab. <a className="underline" href={pay.result.checkoutUrl} target="_blank" rel="noreferrer">Open it again</a>. This screen updates when the payment settles.</p> : null}
      </div>
    </form>
  );
}

export function PayLinkButton({ invoiceId }: { invoiceId: string }) {
  const link = useCommand<{ path: string }>('createInvoicePayLink', PATHS);
  const url = link.result?.path ? `${typeof window === 'undefined' ? '' : window.location.origin}${link.result.path}` : '';
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={link.pending} className={pillClass} onClick={() => link.run({ invoiceId })}>{link.pending ? 'Working' : 'Make a pay link'}</button>
      {url ? <input readOnly aria-label="Pay link" className={cn(inputClass, 'w-72 max-w-full font-mono text-xs')} value={url} onFocus={e => e.currentTarget.select()} /> : null}
      <FormError error={link.error} />
    </span>
  );
}

export function RefundForm({ paymentId, maxMinor }: { paymentId: string; maxMinor: string }) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState((Number(maxMinor) / 100).toFixed(2));
  const [reason, setReason] = React.useState('');
  const refund = useCommand<Waiting & { status?: string }>('refundShopPayment', PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Refund</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-3" onSubmit={e => {
      e.preventDefault();
      const minor = toMinor(amount);
      if (!minor || minor === '0' || !reason.trim()) return;
      refund.run({ input: { paymentId, amountMinor: minor, reason: reason.trim() } });
    }}>
      <label className={labelClass}>Amount back<input className={inputClass} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label className={cn(labelClass, 'sm:col-span-2')}>Why<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" /></label>
      <div className="flex gap-2"><button type="submit" disabled={refund.pending} className={primary}>{refund.pending ? 'Working' : 'Send the refund'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="space-y-1 sm:col-span-3"><FormError error={refund.error} /><NeedsApproval result={refund.result} /></div>
    </form>
  );
}

export function CreditMemoForm({ invoiceId, lines }: { invoiceId: string; lines: { id: string; description: string; extendedMinor: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [lineId, setLineId] = React.useState(lines[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const memo = useCommand<Waiting>('issueShopCreditMemo', PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Credit memo</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-3" onSubmit={e => {
      e.preventDefault();
      const minor = toMinor(amount);
      if (!minor || minor === '0' || !reason.trim() || !lineId) return;
      memo.run({ input: { invoiceId, reason: reason.trim(), lines: [{ invoiceLineId: lineId, amountMinor: minor }] } });
    }}>
      <label className={cn(labelClass, 'sm:col-span-2')}>Line
        <select className={inputClass} value={lineId} onChange={e => setLineId(e.target.value)}>{lines.map(l => <option key={l.id} value={l.id}>{l.description}</option>)}</select>
      </label>
      <label className={labelClass}>Amount off<input className={inputClass} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label>
      <label className={cn(labelClass, 'sm:col-span-3')}>Why<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" /></label>
      <div className="flex gap-2"><button type="submit" disabled={memo.pending} className={primary}>{memo.pending ? 'Working' : 'Issue the memo'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="space-y-1 sm:col-span-3"><FormError error={memo.error} /><NeedsApproval result={memo.result} /></div>
    </form>
  );
}

/** Release the vehicle with a balance still owing: needs a reason and a second person. Paying in full closes the order on its own. */
export function ReleaseForm({ repairOrderId }: { repairOrderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const rel = useCommand<Waiting>('releaseShopVehicle', PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Release with a balance</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); if (reason.trim()) rel.run({ repairOrderId, reason: reason.trim() }); }}>
      <label className={cn(labelClass, 'sm:col-span-2')}>Why the car leaves unpaid<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" /></label>
      <div className="flex items-end gap-2"><button type="submit" disabled={rel.pending} className={primary}>{rel.pending ? 'Working' : 'Ask to release'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="space-y-1 sm:col-span-3"><FormError error={rel.error} /><NeedsApproval result={rel.result} /></div>
    </form>
  );
}

/** Count the drawer. A difference needs a reason; the day is then frozen. */
export function CloseDayForm({ shopId, businessDate, expectedMinor }: { shopId: string; businessDate: string; expectedMinor: string }) {
  const [count, setCount] = React.useState('');
  const [reason, setReason] = React.useState('');
  const close = useCommand('closeShopDay', PATHS);
  const minor = toMinor(count);
  const diff = minor === null ? null : BigInt(minor) - BigInt(expectedMinor);
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); if (minor !== null) close.run({ shopId, businessDate, drawerCountMinor: minor, varianceReason: reason.trim() || undefined }); }}>
      <label className={labelClass}>Cash in the drawer<input className={inputClass} inputMode="decimal" value={count} onChange={e => setCount(e.target.value)} placeholder="0.00" /></label>
      <label className={cn(labelClass, 'sm:col-span-2')}>{diff !== null && diff !== 0n ? 'Why it differs (required)' : 'Note if it differs'}<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div><button type="submit" disabled={close.pending || minor === null} className={primary}>{close.pending ? 'Working' : 'Close the day'}</button></div>
      <div className="sm:col-span-3"><FormError error={close.error} /></div>
    </form>
  );
}

export function ReopenDayForm({ dayCloseId }: { dayCloseId: string }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const reopen = useCommand<Waiting>('reopenShopDay', PATHS);
  if (!open) return <button type="button" className={pillClass} onClick={() => setOpen(true)}>Reopen</button>;
  return (
    <form className="grid w-full gap-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); if (reason.trim()) reopen.run({ dayCloseId, reason: reason.trim() }); }}>
      <label className={cn(labelClass, 'sm:col-span-2')}>Why<input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="Required" /></label>
      <div className="flex items-end"><button type="submit" disabled={reopen.pending} className={primary}>{reopen.pending ? 'Working' : 'Ask to reopen'}</button></div>
      <div className="space-y-1 sm:col-span-3"><FormError error={reopen.error} /><NeedsApproval result={reopen.result} /></div>
    </form>
  );
}
