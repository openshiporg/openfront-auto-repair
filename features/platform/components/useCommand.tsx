'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { runCommand } from '../actions/commands';

/**
 * One command per form. The idempotency key is made once per intent (the same variables) and kept
 * until the command succeeds, so a retry after a timeout replays the first result instead of acting twice.
 */
export function useCommand<T = Record<string, unknown>>(op: string, paths: string[] = []) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<T | null>(null);
  const key = React.useRef<{ key: string; body: string } | null>(null);

  const run = React.useCallback((variables: Record<string, unknown>, onDone?: (data: T) => void) => {
    setError('');
    const body = JSON.stringify(variables);
    if (key.current?.body !== body) key.current = { key: `${op}:${crypto.randomUUID()}`, body };
    const idempotencyKey = key.current.key;
    start(async () => {
      const r = await runCommand(op, variables, idempotencyKey, paths);
      if (!r.ok) { setError(r.error); return; }
      key.current = null;
      setResult(r.data as T);
      onDone?.(r.data as T);
      router.refresh();
    });
  }, [op, paths, router]);

  return { run, pending, error, result, reset: () => { setError(''); setResult(null); } };
}

export const inputClass = 'h-9 max-md:h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50';
export const labelClass = 'block space-y-1 text-xs font-medium text-muted-foreground';

export function FormError({ error }: { error: string }) {
  return error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null;
}
