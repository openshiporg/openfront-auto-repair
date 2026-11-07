import Link from 'next/link';
import { q, orgTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { CheckInForm } from './CheckInForm';

type Appointment = {
  id: string; reference: string; startsAt: string; kind: string; status: string; concernText: string; requestedServices: string[] | null;
  shop: { id: string; code: string; name: string; timeZone: string } | null;
  customer: { id: string; displayName: string } | null;
  vehicle: { id: string; label: string; vin: string; lastOdometer: number | null; lastOdometerUnit: string; recallChecks: { campaignCount: number; parkItAny: boolean }[] } | null;
};
type Law = { requireOdometerIn: boolean; requireSignedWorkOrder: boolean; replacedPartsOfferRequired: boolean; replacedPartsOfferText: string; requiredNotices: { key: string; text: string; where: string }[] | null; pack: { code: string; name: string; verified: boolean } | null };

const APPOINTMENT = `id reference startsAt kind status concernText requestedServices shop { id code name timeZone } customer { id displayName }
  vehicle { id label vin lastOdometer lastOdometerUnit recallChecks(orderBy: { checkedAt: desc }, take: 1) { campaignCount parkItAny } }`;

/**
 * The in-shop tablet check-in (a staff screen, not a customer page): concerns in the customer's words,
 * odometer in, a promised time and the customer's signature on the work order with the state's wording.
 */
export default async function CheckInPage({ searchParams }: { searchParams?: Promise<{ appointment?: string }> }) {
  const params = (await searchParams) ?? {};
  const tz = await orgTimeZone();
  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const until = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const data = await q<{ due: Appointment[]; selected?: Appointment | null; recent: { id: string; reference: string; at: string; signerName: string; signedAt: string | null; shop: { code: string } | null; customer: { displayName: string } | null; vehicle: { label: string } | null; recallWarning: { count: number; doNotDrive: boolean } | null }[] }>(`query(${params.appointment ? '$id: ID!, ' : ''}$since: DateTime!, $until: DateTime!) {
    due: appointments(where: { status: { in: ["requested", "confirmed"] }, startsAt: { gte: $since, lte: $until }, customer: { id: { not: null } } }, orderBy: { startsAt: asc }, take: 30) { ${APPOINTMENT} }
    ${params.appointment ? `selected: appointment(where: { id: $id }) { ${APPOINTMENT} }` : ''}
    recent: checkIns(orderBy: { at: desc }, take: 8) { id reference at signerName signedAt shop { code } customer { displayName } vehicle { label } recallWarning }
  }`, { ...(params.appointment ? { id: params.appointment } : {}), since, until });

  const a = data.selected && ['requested', 'confirmed'].includes(data.selected.status) ? data.selected : null;
  let law: Law | null = null;
  if (a?.shop) {
    const l = await q<{ shop: { jurisdictionPolicy: Law | null } | null }>(`query($id: ID!) { shop(where: { id: $id }) { jurisdictionPolicy { requireOdometerIn requireSignedWorkOrder replacedPartsOfferRequired replacedPartsOfferText requiredNotices pack { code name verified } } } }`, { id: a.shop.id });
    law = l.shop?.jurisdictionPolicy ?? null;
  }

  return (
    <Page title="Check-in">
      {a && a.customer && a.vehicle && a.shop ? (
        <Section title={`${a.reference} · ${a.shop.code}`} aside={<Link href="/dashboard/platform/check-in" className="text-xs underline">Back to the list</Link>}>
          {law?.pack && !law.pack.verified ? (
            <div role="note" className="rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
              The {law.pack.name} rules are a draft that has not been checked against the regulations. Check the work-order wording with the state before relying on it.
            </div>
          ) : null}
          <CheckInForm
            appointment={{ id: a.id, shopId: a.shop.id, customerId: a.customer.id, customerName: a.customer.displayName, vehicleId: a.vehicle.id, vehicleLabel: a.vehicle.label, vin: a.vehicle.vin, lastOdometer: a.vehicle.lastOdometer, unit: a.vehicle.lastOdometerUnit || 'mi', concern: a.concernText, services: a.requestedServices ?? [], waiter: a.kind === 'waiter', timeZone: a.shop.timeZone, recall: a.vehicle.recallChecks[0] ?? null }}
            law={{ requireOdometerIn: law?.requireOdometerIn ?? true, requireSignedWorkOrder: law?.requireSignedWorkOrder ?? true, notices: (law?.requiredNotices ?? []).filter(n => n.where === 'work_order').map(n => n.text), replacedPartsOfferText: law?.replacedPartsOfferRequired ? law.replacedPartsOfferText : '' }}
          />
        </Section>
      ) : (
        <Section title="Due in (the next 4 days)">
          {data.due.length ? data.due.map(x => (
            <Row key={x.id}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{x.customer?.displayName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{x.shop?.code} · {x.reference}</span>
                  {x.vehicle?.recallChecks[0]?.parkItAny ? <span className="font-mono text-xs text-red-600">RECALL: PARK OUTSIDE</span> : x.vehicle?.recallChecks[0]?.campaignCount ? <span className="font-mono text-xs text-amber-600">{x.vehicle.recallChecks[0].campaignCount} recalls</span> : null}
                </div>
                <Meta>{when(x.startsAt, x.shop?.timeZone ?? tz)} · {label(x.kind)} · {x.vehicle?.label ?? 'vehicle not chosen'}</Meta>
              </div>
              <div className="flex items-center gap-3">
                <Status value={x.status} />
                {x.vehicle ? <Link className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" href={`/dashboard/platform/check-in?appointment=${x.id}`}>Check in</Link> : <Meta>Add the vehicle on the Schedule first</Meta>}
              </div>
            </Row>
          )) : <Empty>Nobody is due in. Book from the Schedule.</Empty>}
        </Section>
      )}

      <Section title="Recent check-ins">
        {data.recent.length ? data.recent.map(c => (
          <Row key={c.id}>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm">{c.reference}</span><span className="font-medium">{c.customer?.displayName}</span></div>
              <Meta>{c.vehicle?.label} · {when(c.at, tz)} · {c.signedAt ? `signed by ${c.signerName}` : 'not signed'}</Meta>
            </div>
            {c.recallWarning ? <span className={`font-mono text-xs ${c.recallWarning.doNotDrive ? 'text-red-600' : 'text-amber-600'}`}>{c.recallWarning.count} recall{c.recallWarning.count === 1 ? '' : 's'} flagged</span> : <Meta>No recall flags</Meta>}
          </Row>
        )) : <Empty>No check-ins yet.</Empty>}
      </Section>
    </Page>
  );
}
