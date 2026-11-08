'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/** Starts the card page, and after the customer comes back asks where the payment stands until it settles. */
export function PayClient({ token, balance, returned, inProgress }: { token: string; balance: string; returned: string; inProgress: string | null }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState('');
  const [checking, setChecking] = React.useState(returned === 'paid' && !!inProgress);
  const api = `/api/public/invoices/${token}`;

  React.useEffect(() => {
    if (!checking || !inProgress) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries += 1;
      const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentId: inProgress }) }).then(x => x.json()).catch(() => null);
      if (r?.status === 'succeeded') { clearInterval(id); router.refresh(); }
      else if (r?.status === 'failed' || tries > 30) { clearInterval(id); setChecking(false); }
    }, 2000);
    return () => clearInterval(id);
  }, [checking, inProgress, api, router]);

  async function start() {
    setPending(true); setError('');
    const r = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const body = await r.json().catch(() => ({}));
    if (r.ok && body.checkoutUrl) { window.location.assign(body.checkoutUrl); return; }
    setPending(false);
    setError(body?.error?.message || body?.message || 'We could not open the card page. Please try again or call the shop.');
  }

  return (
    <div className="space-y-3">
      {returned === 'canceled' ? <p role="status" className="text-sm text-muted-foreground">Nothing was charged. You can try again when you are ready.</p> : null}
      {checking ? <p role="status" className="text-sm">Confirming your payment. This takes a few seconds.</p> : null}
      <button type="button" onClick={start} disabled={pending || checking} className="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-60">
        {pending ? 'Opening the card page' : `Pay ${balance} by card`}
      </button>
      {error ? <p role="alert" className="break-words text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
