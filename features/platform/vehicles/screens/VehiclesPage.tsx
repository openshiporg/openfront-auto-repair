import Link from 'next/link';
import { q, orgTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { OdometerForm } from './OdometerForm';

type Campaign = { nhtsaCampaignNumber: string; component: string; summary: string; consequence: string; remedy: string; reportReceivedDate: string | null; parkIt: boolean; parkOutSide: boolean };
type Vehicle = {
  id: string; label: string; vin: string; vinValid: string; noVinReason: string; year: number | null; make: string; model: string; trim: string; engine: string; drivetrain: string; fuelType: string; bodyClass: string; color: string;
  lastOdometer: number | null; lastOdometerUnit: string; status: string; version: number;
  ownerships: { role: string; customer: { id: string; displayName: string } | null; businessAccount: { name: string } | null }[];
  plates: { plate: string; state: string }[];
  recallChecks: { id: string; source: string; campaignCount: number; parkItAny: boolean; checkedAt: string; campaigns: Campaign[] }[];
  decodes: { provider: string; errorCode: string; errorText: string; fetchedAt: string }[];
  odometerReadings: { value: number; unit: string; source: string; anomaly: string; overrideReason: string; at: string }[];
};

const LIST = `id label vin vinValid year make model lastOdometer lastOdometerUnit status
  ownerships(where: { endedAt: null }) { customer { displayName } businessAccount { name } }
  recallChecks(orderBy: { checkedAt: desc }, take: 1) { campaignCount parkItAny }`;
const DETAIL = `id label vin vinValid noVinReason year make model trim engine drivetrain fuelType bodyClass color lastOdometer lastOdometerUnit status version
  ownerships(where: { endedAt: null }) { role customer { id displayName } businessAccount { name } }
  plates { plate state }
  recallChecks(orderBy: { checkedAt: desc }, take: 1) { id source campaignCount parkItAny checkedAt campaigns }
  decodes(orderBy: { fetchedAt: desc }, take: 1) { provider errorCode errorText fetchedAt }
  odometerReadings(orderBy: { at: desc }, take: 8) { value unit source anomaly overrideReason at }`;

const VIN_TEXT: Record<string, string> = { valid: 'VIN checks out', check_digit_warning: 'Check digit does not match: confirm the VIN on the vehicle', invalid_format: 'Not a 17-character VIN', none: 'No VIN' };

/** Vehicles: VIN decode and NHTSA recalls (possible recalls by make, model and year; the VIN is not confirmed), owners and odometer history. */
export default async function VehiclesPage({ searchParams }: { searchParams?: Promise<{ id?: string; q?: string }> }) {
  const params = (await searchParams) ?? {};
  const search = (params.q ?? '').trim().toUpperCase().slice(0, 40);
  const where = search ? '{ status: { equals: "active" }, OR: [{ vin: { contains: $q } }, { label: { contains: $q, mode: insensitive } }] }' : '{ status: { equals: "active" } }';
  const vars = [search ? '$q: String!' : '', params.id ? '$id: ID!' : ''].filter(Boolean);
  const [data, tz] = await Promise.all([
    q<{ vehicles: Omit<Vehicle, 'plates' | 'decodes' | 'odometerReadings'>[]; vehiclesCount: number; recalls: number; selected?: Vehicle | null }>(`query${vars.length ? `(${vars.join(', ')})` : ''} {
      vehicles(where: ${where}, orderBy: [{ make: asc }, { model: asc }, { year: desc }], take: 60) { ${LIST} }
      vehiclesCount(where: { status: { equals: "active" } })
      recalls: vehiclesCount(where: { recallChecks: { some: { campaignCount: { gt: 0 } } } })
      ${params.id ? `selected: vehicle(where: { id: $id }) { ${DETAIL} }` : ''}
    }`, { ...(search ? { q: search } : {}), ...(params.id ? { id: params.id } : {}) }),
    orgTimeZone(),
  ]);
  const v = data.selected ?? null;
  const recall = v?.recallChecks[0];
  return (
    <Page title="Vehicles">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat name="Active vehicles" value={data.vehiclesCount} />
        <Stat name="With possible recalls" value={data.recalls} />
        <Stat name="Recall source" value="NHTSA" />
      </div>

      {v ? (
        <Section title={v.label || v.vin} aside={<Link href="/dashboard/platform/vehicles" className="inline-flex min-h-11 items-center text-xs underline md:min-h-0">Close</Link>}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat name="VIN" value={<span className="break-all font-mono text-sm">{v.vin || '—'}</span>} />
            <Stat name="Odometer" value={v.lastOdometer !== null ? `${v.lastOdometer.toLocaleString('en-US')} ${v.lastOdometerUnit}` : '—'} />
            <Stat name="Owner" value={<span className="text-sm">{v.ownerships.map(o => o.customer?.displayName ?? o.businessAccount?.name).filter(Boolean).join(', ') || '—'}</span>} />
            <Stat name="Plate" value={<span className="font-mono text-sm">{v.plates.map(p => `${p.plate} ${p.state}`).join(', ') || '—'}</span>} />
          </div>
          <Row>
            <Meta>{VIN_TEXT[v.vinValid] ?? v.vinValid}{v.noVinReason ? ` · ${v.noVinReason}` : ''}</Meta>
            <Meta>{[v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')}{v.engine ? ` · ${v.engine}` : ''}{v.drivetrain ? ` · ${v.drivetrain}` : ''}{v.fuelType ? ` · ${v.fuelType}` : ''}{v.bodyClass ? ` · ${v.bodyClass}` : ''}</Meta>
          </Row>
          <Row>
            <Meta>{v.decodes[0] ? `Decoded by ${v.decodes[0].provider.toUpperCase()} ${when(v.decodes[0].fetchedAt, tz)}${v.decodes[0].errorCode && v.decodes[0].errorCode !== '0' ? ` · codes ${v.decodes[0].errorCode}` : ''}` : 'Not decoded yet'}</Meta>
            <div className="flex flex-wrap gap-2">
              {v.vin ? <ActionButton op="decodeVehicleVin" vars={{ vehicleId: v.id }}>Decode VIN</ActionButton> : null}
              <ActionButton op="checkVehicleRecalls" vars={{ vehicleId: v.id }}>Check recalls</ActionButton>
            </div>
          </Row>

          <div className={`space-y-2 rounded-lg border p-3 ${recall?.parkItAny ? 'border-red-500/60 bg-red-500/5' : recall?.campaignCount ? 'border-amber-500/60 bg-amber-500/5' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {!recall ? 'Recalls not checked yet' : recall.campaignCount === 0 ? 'No recalls listed for this year, make and model' : `${recall.campaignCount} possible recall${recall.campaignCount === 1 ? '' : 's'} for this year, make and model`}
              </span>
              {recall ? <Meta>{recall.source === 'fixture' ? 'Recorded sample' : 'NHTSA'} · {when(recall.checkedAt, tz)}</Meta> : null}
            </div>
            {recall?.campaignCount ? <p className="text-xs text-muted-foreground">NHTSA lists these by model, not by VIN. Confirm with the manufacturer or nhtsa.gov/recalls whether this vehicle is affected and still open.</p> : null}
            {(recall?.campaigns ?? []).slice(0, 10).map(c => (
              <div key={c.nhtsaCampaignNumber} className="space-y-1 border-t pt-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{c.nhtsaCampaignNumber}</span>
                  <span className="font-medium">{c.component}</span>
                  {c.parkIt ? <span className="font-mono text-xs uppercase tracking-wide text-red-600">do not drive</span> : null}
                  {c.parkOutSide ? <span className="font-mono text-xs uppercase tracking-wide text-red-600">park outside</span> : null}
                </div>
                {/* Provider text is untrusted: rendered as plain text, never as markup or instructions. */}
                <p className="whitespace-pre-line break-words text-xs text-muted-foreground">{c.summary.slice(0, 600)}</p>
                {c.remedy ? <p className="break-words text-xs"><span className="text-muted-foreground">Remedy:</span> {c.remedy.slice(0, 400)}</p> : null}
              </div>
            ))}
          </div>

          <Section title="Odometer history">
            <OdometerForm vehicleId={v.id} last={v.lastOdometer} unit={v.lastOdometerUnit || 'mi'} />
            {v.odometerReadings.length ? v.odometerReadings.map((r, i) => (
              <Row key={i}>
                <span className="font-mono">{r.value.toLocaleString('en-US')} {r.unit}</span>
                <Meta>{label(r.source)} · {when(r.at, tz)}{r.anomaly && r.anomaly !== 'none' ? ` · ${label(r.anomaly)}${r.overrideReason ? `: ${r.overrideReason}` : ''}` : ''}</Meta>
              </Row>
            )) : <Empty>No readings yet.</Empty>}
          </Section>
        </Section>
      ) : null}

      <Section title={search ? `Matching “${search}”` : 'Vehicles'} aside={
        <form className="flex gap-2" action="/dashboard/platform/vehicles">
          <input name="q" defaultValue={search} placeholder="VIN or model" aria-label="Search vehicles by VIN or model" className="h-8 max-md:h-11 w-40 rounded-md border bg-background px-2 font-mono text-sm sm:w-56" />
        </form>
      }>
        {data.vehicles.length ? data.vehicles.map(x => (
          <Row key={x.id} href={`/dashboard/platform/vehicles?id=${x.id}`}>
            <div className="min-w-0 space-y-1">
              <div className="font-medium">{x.label || 'Unnamed vehicle'}</div>
              <Meta><span className="break-all font-mono">{x.vin || 'no VIN'}</span> · {x.ownerships.map(o => o.customer?.displayName ?? o.businessAccount?.name).filter(Boolean).join(', ') || 'no owner'}</Meta>
            </div>
            <div className="flex items-center gap-3">
              {x.recallChecks[0]?.parkItAny ? <span className="font-mono text-xs text-red-600">PARK OUTSIDE / DO NOT DRIVE</span> : x.recallChecks[0]?.campaignCount ? <span className="font-mono text-xs text-amber-600">{x.recallChecks[0].campaignCount} recalls</span> : null}
              {x.vinValid === 'check_digit_warning' ? <span className="font-mono text-xs text-amber-600">VIN?</span> : null}
              <Meta>{x.lastOdometer !== null ? `${x.lastOdometer.toLocaleString('en-US')} ${x.lastOdometerUnit}` : ''}</Meta>
              <Status value={x.status} />
            </div>
          </Row>
        )) : <Empty>{search ? 'No vehicle matches.' : 'No vehicles yet.'}</Empty>}
      </Section>
    </Page>
  );
}
