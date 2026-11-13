'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

const primary = cn(pillClass, 'bg-primary text-primary-foreground');
const ACCT = ['/dashboard/platform/accounting'];
const IMP = ['/dashboard/platform/imports'];
const INT = ['/dashboard/platform/integrations'];
type R = Record<string, any>;

function download(text: string, name: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/** One small button: a command, a label, optional extra variables. */
export function Act({ op, vars, paths, children, tone = 'pill', confirmText }: { op: string; vars: R; paths: string[]; children: React.ReactNode; tone?: 'pill' | 'primary'; confirmText?: string }) {
  const cmd = useCommand<R>(op, paths);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={tone === 'primary' ? primary : pillClass} onClick={() => { if (!confirmText || window.confirm(confirmText)) cmd.run(vars); }}>{cmd.pending ? 'Working' : children}</button>
      <FormError error={cmd.error} />
    </span>
  );
}
export const accountingPaths = ACCT;
export const importPaths = IMP;
export const integrationPaths = INT;

export function StageDay({ shopId }: { shopId: string }) {
  const cmd = useCommand<R>('stageAccountingBatch', ACCT);
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  return (
    <span className="inline-flex flex-wrap items-end gap-2">
      <label className={labelClass}>Business date<input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button type="button" disabled={cmd.pending} className={primary} onClick={() => cmd.run({ shopId, businessDate: date })}>{cmd.pending ? 'Working' : 'Stage the day'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

export function ExportBatch({ batchId, reference }: { batchId: string; reference: string }) {
  const cmd = useCommand<R>('exportAccountingBatch', ACCT);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={primary} onClick={() => cmd.run({ batchId }, async (d) => { if (d.content) download(String(d.content), `${reference}.csv`); })}>{cmd.pending ? 'Working' : 'Export file'}</button>
      <FormError error={cmd.error} />
    </span>
  );
}

export function DownloadExport({ content, name }: { content: string; name: string }) {
  return <button type="button" className={pillClass} onClick={() => download(content, name)}>Download again</button>;
}

/** What the books said about a file a person loaded. Only this makes a day POSTED. */
export function RecordResponse({ batchId }: { batchId: string }) {
  const cmd = useCommand<R>('recordAccountingResponse', ACCT);
  const [f, setF] = React.useState({ outcome: 'accepted', providerRef: '', message: '' });
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { batchId, ...f } }); }}>
      <label className={labelClass}>The books said<select className={inputClass} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="partial">Partly accepted</option><option value="error">Error</option></select></label>
      <label className={labelClass}>Their reference<input className={inputClass} value={f.providerRef} onChange={(e) => setF({ ...f, providerRef: e.target.value })} /></label>
      <label className={labelClass}>Note<input className={inputClass} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></label>
      <button className={primary} disabled={cmd.pending}>{cmd.pending ? 'Working' : 'Record'}</button>
      <FormError error={cmd.error} />
    </form>
  );
}

export function MappingForm({ shopId, sourceKeys, current }: { shopId: string; sourceKeys: string[]; current: Record<string, { accountCode: string; accountName: string }> }) {
  const cmd = useCommand<R>('saveAccountingMappings', ACCT);
  const [rows, setRows] = React.useState(Object.fromEntries(sourceKeys.map((k) => [k, current[k] ?? { accountCode: '', accountName: '' }])));
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); cmd.run({ shopId, mappings: Object.entries(rows).filter(([, v]) => v.accountCode.trim()).map(([sourceKey, v]) => ({ sourceKey, ...v })) }); }}>
      {sourceKeys.map((k) => (
        <div key={k} className="grid grid-cols-[1fr_7rem_1fr] items-center gap-2 text-sm">
          <span className="break-words font-mono text-xs">{k}</span>
          <input aria-label={`${k} account code`} className={inputClass} placeholder="Code" value={rows[k].accountCode} onChange={(e) => setRows({ ...rows, [k]: { ...rows[k], accountCode: e.target.value } })} />
          <input aria-label={`${k} account name`} className={inputClass} placeholder="Account name" value={rows[k].accountName} onChange={(e) => setRows({ ...rows, [k]: { ...rows[k], accountName: e.target.value } })} />
        </div>
      ))}
      <button className={primary} disabled={cmd.pending}>{cmd.pending ? 'Working' : 'Save mapping'}</button>
      <FormError error={cmd.error} />
    </form>
  );
}

export function ImportForm({ shopId }: { shopId: string }) {
  const cmd = useCommand<R>('previewDataImport', IMP);
  const [f, setF] = React.useState({ format: 'tekmetric_csv', entity: 'customers', fileName: '', text: '' });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { shopId, ...f } }); }}>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className={labelClass}>Comes from<select className={inputClass} value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="tekmetric_csv">Tekmetric export</option><option value="shopmonkey_csv">Shopmonkey export</option><option value="generic_csv">Any CSV</option></select></label>
        <label className={labelClass}>What is in it<select className={inputClass} value={f.entity} onChange={(e) => setF({ ...f, entity: e.target.value })}><option value="customers">Customers</option><option value="vehicles">Vehicles</option></select></label>
        <label className={labelClass}>File<input type="file" accept=".csv,text/csv" className={inputClass} onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, fileName: file.name, text: await file.text() }); }} /></label>
      </div>
      <button className={primary} disabled={cmd.pending || !f.text}>{cmd.pending ? 'Working' : 'Preview'}</button>
      <FormError error={cmd.error} />
    </form>
  );
}

export function ConnectionForm({ shopId }: { shopId: string }) {
  const cmd = useCommand<R>('saveIntegrationConnection', INT);
  const [f, setF] = React.useState({ kind: 'accounting', providerKey: 'manual', mode: 'manual' });
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { shopId, ...f } }); }}>
      <label className={labelClass}>Kind<input className={inputClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} /></label>
      <label className={labelClass}>Provider<input className={inputClass} value={f.providerKey} onChange={(e) => setF({ ...f, providerKey: e.target.value })} /></label>
      <label className={labelClass}>Mode<select className={inputClass} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="manual">Manual</option><option value="sandbox">Sandbox</option><option value="live">Live</option></select></label>
      <button className={primary} disabled={cmd.pending}>{cmd.pending ? 'Working' : 'Add'}</button>
      <FormError error={cmd.error} />
    </form>
  );
}

export function WebhookForm({ shopId, topics }: { shopId: string; topics: string[] }) {
  const cmd = useCommand<R>('addWebhookEndpoint', INT);
  const [url, setUrl] = React.useState('');
  const [events, setEvents] = React.useState<string[]>([]);
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); cmd.run({ input: { shopId, url, events } }); }}>
      <label className={labelClass}>Address (https)<input className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hook" /></label>
      <fieldset className="flex flex-wrap gap-3 text-sm">{topics.map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" checked={events.includes(t)} onChange={(e) => setEvents(e.target.checked ? [...events, t] : events.filter((x) => x !== t))} />{t}</label>)}</fieldset>
      <button className={primary} disabled={cmd.pending || !events.length}>{cmd.pending ? 'Working' : 'Add webhook'}</button>
      {cmd.result?.secret ? <p role="status" className="break-all text-sm">Signing secret, shown once: <span className="font-mono">{String(cmd.result.secret)}</span></p> : null}
      <FormError error={cmd.error} />
    </form>
  );
}
