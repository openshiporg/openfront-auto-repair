import { keystoneContext } from '@/features/keystone/context';
import { getInvoice } from '@/features/keystone/public/handlers';
import { money } from '../../lib/format';
import { PayClient } from './PayClient';

type View = {
  invoiceNumber: string; status: string; customerName: string; roNumber?: string; vehicle?: string; invoiceDate?: string; dueDate?: string
  shop: { name: string; legalName: string; phone: string } | null
  totals: { subtotalMinor: string; taxMinor: string; totalMinor: string; paidMinor: string; creditedMinor: string; balanceMinor: string }
  lines: { job: number | null; kind: string; description: string; extendedMinor: string }[]
  canPayByCard: boolean; paymentInProgress: string | null
}

const day = (iso?: string) => (iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00Z`)) : '');

/** What the customer sees from a pay link: the invoice, what is owed, and one button. No sign-in; the link is the key. */
export default async function PayPage({ token, returned }: { token: string; returned: string }) {
  const res = await getInvoice(keystoneContext.sudo().prisma, new Request('http://internal/pay', { headers: { 'x-forwarded-for': 'pay-page' } }), token);
  if (res.status !== 200) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-5 py-10">
        <h1 className="text-xl font-semibold">This link no longer works</h1>
        <p className="text-sm text-muted-foreground">The link may have expired or been replaced. Please call the shop and they will send you a new one.</p>
      </main>
    );
  }
  const v = (await res.json()) as View;
  const owed = BigInt(v.totals.balanceMinor);
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-6 px-5 py-8">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">{v.shop?.legalName || v.shop?.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Invoice {v.invoiceNumber}</h1>
        <p className="text-sm text-muted-foreground">{[v.vehicle, v.roNumber ? `Repair order ${v.roNumber}` : '', v.invoiceDate ? `Invoiced ${day(v.invoiceDate)}` : ''].filter(Boolean).join(' · ')}</p>
      </header>

      <section className="space-y-1">
        {v.lines.map((l, i) => (
          <div key={i} className="flex items-start justify-between gap-4 border-b py-2 text-sm">
            <span className="min-w-0 break-words">{l.description}</span>
            <span className="shrink-0 font-mono">{money(l.extendedMinor)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-4 pt-2 text-sm"><span>Sales tax</span><span className="font-mono">{money(v.totals.taxMinor)}</span></div>
        <div className="flex justify-between gap-4 text-sm font-semibold"><span>Total</span><span className="font-mono">{money(v.totals.totalMinor)}</span></div>
        {BigInt(v.totals.paidMinor) > 0n ? <div className="flex justify-between gap-4 text-sm"><span>Paid</span><span className="font-mono">{money(v.totals.paidMinor)}</span></div> : null}
        {BigInt(v.totals.creditedMinor) > 0n ? <div className="flex justify-between gap-4 text-sm"><span>Credited</span><span className="font-mono">{money(v.totals.creditedMinor)}</span></div> : null}
        <div className="flex justify-between gap-4 border-t pt-2 text-lg font-semibold"><span>Balance due</span><span className="font-mono">{money(v.totals.balanceMinor)}</span></div>
      </section>

      {owed <= 0n ? (
        <p role="status" className="rounded-md border p-4 text-sm">{returned === 'paid' ? 'Thank you. Your payment went through and this invoice is paid.' : 'This invoice is paid. Thank you.'}</p>
      ) : v.canPayByCard ? (
        <PayClient token={token} balance={money(v.totals.balanceMinor)} returned={returned} inProgress={v.paymentInProgress} />
      ) : (
        <p className="rounded-md border p-4 text-sm">To pay this invoice, please call {v.shop?.name}{v.shop?.phone ? ` on ${v.shop.phone}` : ''}.</p>
      )}
    </main>
  );
}
