'use client';

import * as React from 'react';
import { FormError, inputClass, labelClass, useCommand } from '../../components/useCommand';
import { pillClass } from '../../components/ActionButton';
import { cn } from '@/lib/utils';

export const AGENT_PATHS = ['/dashboard/platform/agents', '/dashboard/platform/proposals', '/dashboard/platform/diagnosis'];
const primary = cn(pillClass, 'bg-primary text-primary-foreground');

/** One command on a button; `ask` prompts for words that go in `reason`. */
export function Act({ op, vars, children, ask, confirm, strong }: { op: string; vars: Record<string, unknown>; children: React.ReactNode; ask?: string; confirm?: string; strong?: boolean }) {
  const cmd = useCommand<{ message?: string; status?: string }>(op, AGENT_PATHS);
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button type="button" disabled={cmd.pending} className={strong ? primary : pillClass} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        let extra: Record<string, unknown> = {};
        if (ask) { const a = window.prompt(ask); if (a === null) return; extra = { reason: a.trim() }; }
        cmd.run({ ...vars, ...extra });
      }}>{cmd.pending ? 'Working' : children}</button>
      <FormError error={cmd.error} />
      {cmd.result?.message ? <span role="status" className="text-xs">{cmd.result.message}</span> : null}
    </span>
  );
}

export function NewAssistantForm({ shops }: { shops: { id: string; name: string }[] }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [shopIds, setShopIds] = React.useState<string[]>(shops.map(s => s.id));
  const cmd = useCommand('createAssistant', AGENT_PATHS);
  if (!open) return <button type="button" className={primary} onClick={() => setOpen(true)}>Add an assistant</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); cmd.run({ input: { name: name.trim(), shopIds } }, () => setOpen(false)); }}>
      <label className={labelClass}>Name<input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Front counter helper" /></label>
      <fieldset className="space-y-1"><legend className={labelClass}>Shops it may work in</legend>
        {shops.map(s => <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={shopIds.includes(s.id)} onChange={e => setShopIds(e.target.checked ? [...shopIds, s.id] : shopIds.filter(x => x !== s.id))} />{s.name}</label>)}
      </fieldset>
      <div className="flex gap-2 sm:col-span-2"><button type="submit" disabled={cmd.pending || !name.trim()} className={primary}>{cmd.pending ? 'Saving' : 'Save assistant'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-2"><FormError error={cmd.error} /></div>
    </form>
  );
}

export function GrantForm({ agentId, options }: { agentId: string; options: { scope: string; label: string }[] }) {
  const [scope, setScope] = React.useState(options[0]?.scope ?? '');
  const cmd = useCommand('grantAssistantScope', AGENT_PATHS);
  if (!options.length) return null;
  return (
    <form className="flex w-full flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); cmd.run({ agentId, scope }); }}>
      <label className={cn(labelClass, 'min-w-0 flex-1')}>Allow it to<select className={inputClass} value={scope} onChange={e => setScope(e.target.value)}>{options.map(o => <option key={o.scope} value={o.scope}>{o.label}</option>)}</select></label>
      <button type="submit" disabled={cmd.pending} className={pillClass}>{cmd.pending ? 'Saving' : 'Allow'}</button>
      <FormError error={cmd.error} />
    </form>
  );
}

export function ProviderForm({ connected }: { connected: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [baseUrl, setBaseUrl] = React.useState('https://api.openai.com/v1');
  const [model, setModel] = React.useState('');
  const [apiKey, setApiKey] = React.useState('');
  const cmd = useCommand('saveAiProvider', AGENT_PATHS);
  if (!open) return <button type="button" className={connected ? pillClass : primary} onClick={() => setOpen(true)}>{connected ? 'Change the provider' : 'Connect your AI provider'}</button>;
  return (
    <form className="grid w-full gap-3 rounded-md border p-3 sm:grid-cols-3" onSubmit={e => { e.preventDefault(); cmd.run({ input: { baseUrl: baseUrl.trim(), model: model.trim(), apiKey: apiKey.trim() } }, () => { setApiKey(''); setOpen(false); }); }}>
      <label className={labelClass}>Address<input className={inputClass} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></label>
      <label className={labelClass}>Model name<input className={inputClass} value={model} onChange={e => setModel(e.target.value)} /></label>
      <label className={labelClass}>Your key<input className={inputClass} type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} /></label>
      <p className="text-xs text-muted-foreground sm:col-span-3">The key is stored sealed and is never shown again. Without one, assistants only take plans that staff type in.</p>
      <div className="flex gap-2 sm:col-span-3"><button type="submit" disabled={cmd.pending || !model.trim() || !apiKey.trim()} className={primary}>{cmd.pending ? 'Saving' : 'Save'}</button><button type="button" className={pillClass} onClick={() => setOpen(false)}>Cancel</button></div>
      <div className="sm:col-span-3"><FormError error={cmd.error} /></div>
    </form>
  );
}

type Step = { tool: string; label: string };
/** The chat panel: ask in words (needs the owner's provider) or pick a step by hand. Either way the result is a plan to preview. */
export function AskPanel({ agents, orders, tools, connected }: { agents: { id: string; name: string }[]; orders: { id: string; label: string }[]; tools: Step[]; connected: boolean }) {
  const [agentId, setAgentId] = React.useState(agents[0]?.id ?? '');
  const [repairOrderId, setRo] = React.useState(orders[0]?.id ?? '');
  const [message, setMessage] = React.useState('');
  const [tool, setTool] = React.useState(tools[0]?.tool ?? '');
  const [args, setArgs] = React.useState('');
  const [problem, setProblem] = React.useState('');
  const ask = useCommand<{ status?: string; preview?: { summary: string }[] }>('askAssistant', AGENT_PATHS);
  if (!agents.length) return <p className="text-sm text-muted-foreground">Add an assistant first.</p>;
  return (
    <div className="space-y-3 rounded-md border p-3">
      {!connected ? <p role="status" className="text-sm">No AI provider connected. Type a step below and the assistant will lay it out for you to confirm.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>Assistant<select className={inputClass} value={agentId} onChange={e => setAgentId(e.target.value)}>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label className={labelClass}>Repair order<select className={inputClass} value={repairOrderId} onChange={e => setRo(e.target.value)}>{orders.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      </div>
      {connected ? (
        <form className="space-y-2" onSubmit={e => { e.preventDefault(); ask.run({ agentId, repairOrderId, message: message.trim() }, () => setMessage('')); }}>
          <label className={labelClass}>What should it do?<textarea className={cn(inputClass, 'h-20 py-2')} value={message} onChange={e => setMessage(e.target.value)} placeholder="Add a brake inspection to this order and price it" /></label>
          <button type="submit" disabled={ask.pending || !message.trim()} className={primary}>{ask.pending ? 'Planning' : 'Make a plan'}</button>
        </form>
      ) : null}
      <form className="space-y-2" onSubmit={e => {
        e.preventDefault(); setProblem('');
        let parsed: Record<string, unknown> = {};
        try { parsed = args.trim() ? JSON.parse(args) : {}; } catch { setProblem('The details need to be written as {"name": "value"}.'); return; }
        ask.run({ agentId, repairOrderId, title: tools.find(t => t.tool === tool)?.label ?? 'Plan', steps: [{ tool, args: { repairOrderId, ...parsed } }] });
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Step<select className={inputClass} value={tool} onChange={e => setTool(e.target.value)}>{tools.map(t => <option key={t.tool} value={t.tool}>{t.label}</option>)}</select></label>
          <label className={labelClass}>Details (optional)<input className={cn(inputClass, 'font-mono')} value={args} onChange={e => setArgs(e.target.value)} placeholder='{"title": "Brake inspection"}' /></label>
        </div>
        <button type="submit" disabled={ask.pending} className={pillClass}>{ask.pending ? 'Planning' : 'Preview this step'}</button>
      </form>
      <FormError error={problem || ask.error} />
      {ask.result?.preview?.length ? <ol className="list-decimal space-y-1 pl-5 text-sm">{ask.result.preview.map((p, i) => <li key={i}>{p.summary}</li>)}</ol> : null}
    </div>
  );
}
