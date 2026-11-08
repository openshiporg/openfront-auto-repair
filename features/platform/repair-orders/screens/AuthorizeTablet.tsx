'use client';

import * as React from 'react';
import Link from 'next/link';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { SignaturePad } from '../../components/SignaturePad';
import { money } from '../../lib/format';
import { cn } from '@/lib/utils';
import { DecisionPicker } from './RepairOrderForms';

export function AuthorizeTablet({ estimateVersionId, back, customerName, jobs, replacedPartsText, consentText }: {
  estimateVersionId: string; back: string; customerName: string; replacedPartsText: string; consentText: string
  jobs: { id: string; number: number; title: string; totalMinor: string }[]
}) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [signerName, setSigner] = React.useState(customerName);
  const [strokes, setStrokes] = React.useState<number[][][]>([]);
  const [parts, setParts] = React.useState('');
  const [agreed, setAgreed] = React.useState(false);
  const save = useCommand<{ approved: { amountMinor: string }[] }>('recordCustomerAuthorization', ['/dashboard/platform/board', back]);
  const approved = jobs.filter(j => answers[j.id] === 'approve');
  const total = approved.reduce((n, j) => n + BigInt(j.totalMinor), 0n);
  const points = strokes.reduce((n, s) => n + s.length, 0);
  const ready = jobs.every(j => answers[j.id]) && signerName.trim() && points >= 8 && agreed && (!replacedPartsText || parts);

  if (save.result) {
    return (
      <div className="space-y-3 rounded-lg border p-4">
        <div className="text-lg font-medium">Thank you. {approved.length ? `${approved.length} job${approved.length === 1 ? '' : 's'} approved for ${money(String(total))}.` : 'Nothing approved.'}</div>
        <p className="text-sm text-muted-foreground">Hand the tablet back to the service advisor.</p>
        <Link href={back} className={cn(pillClass, 'bg-primary text-primary-foreground')}>Back to the repair order</Link>
      </div>
    );
  }
  return (
    <form className="space-y-4" onSubmit={e => {
      e.preventDefault();
      save.run({ input: { estimateVersionId, method: 'in_person_signature', actorName: signerName.trim(), answers: jobs.map(j => ({ jobId: j.id, decision: answers[j.id] })), signature: { signerName: signerName.trim(), strokes }, ...(parts ? { replacedPartsElection: parts } : {}) } });
    }}>
      <section className="space-y-3">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">Your choice for each job</h2>
        <DecisionPicker jobs={jobs} value={answers} onChange={setAnswers} />
        <div className="flex justify-between border-t pt-2 text-base"><span>Approved total</span><span className="font-mono">{money(String(total))}</span></div>
      </section>
      {replacedPartsText ? (
        <label className={labelClass}>{replacedPartsText}
          <select className={inputClass} value={parts} onChange={e => setParts(e.target.value)} required>
            <option value="">Choose one</option><option value="return">Return my old parts</option><option value="show_only">Show me, then dispose of them</option><option value="do_not_return">I don&apos;t need them back</option>
          </select>
        </label>
      ) : null}
      <p className="text-sm">{consentText}</p>
      <label className={labelClass}>Your name<input className={inputClass} value={signerName} onChange={e => setSigner(e.target.value)} /></label>
      <SignaturePad strokes={strokes} onChange={setStrokes} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={cn(pillClass, 'bg-transparent shadow-none')} onClick={() => setStrokes([])}>Clear signature</button>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /> I read the estimate and agree</label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={cn(pillClass, 'h-10 bg-primary px-5 text-primary-foreground')} disabled={!ready || save.pending}>{save.pending ? 'Saving' : 'Sign and submit'}</button>
        <FormError error={save.error} />
      </div>
    </form>
  );
}
