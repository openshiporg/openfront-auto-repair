import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BOARD_LABELS, promisedRisk } from '@/lib/board';
import { q, orgTimeZone } from '../../lib/server';
import { money, when, label, hours, milli } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { answerableJobs, repairOrder, type JobDetail, type RoDetail } from '../lib/queries';
import { BillingSection } from '../../billing/screens/BillingSection';
import { AddJobForm, AddLineForm, VariantChooser, CallbackTaskForm, AuthorizationLinkButton, PhoneAuthorizationForm, CloseTaskButton, HoldForm } from './RepairOrderForms';

const EDITABLE = ['draft', 'priced', 'offered', 'authorized', 'in_progress', 'needs_reauthorization'];

function JobBlock({ job, ro }: { job: JobDetail; ro: RoDetail }) {
  const problems = job.priceSnapshot?.problems ?? [];
  const candidates = job.priceSnapshot?.candidates ?? [];
  const current = job.authorizations.find(a => a.status === 'recorded');
  const over = job.status === 'needs_reauthorization';
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">JOB {job.number}</span>
            <span className="font-medium">{job.title}</span>
            {job.source === 'agent' ? <span className="font-mono text-xs text-amber-600">ASSISTANT DRAFT</span> : null}
            {job.urgency && job.urgency !== 'none' ? <span className={`font-mono text-xs ${job.urgency === 'safety' ? 'text-red-600' : 'text-muted-foreground'}`}>{label(job.urgency).toUpperCase()}</span> : null}
          </div>
          <Meta>
            {job.concern ? `For "${job.concern.customerWords}"` : job.inspectionItemResult ? `From the inspection: ${job.inspectionItemResult.templateItem?.label} (${job.inspectionItemResult.condition})` : label(job.source)}
          </Meta>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm">{money(job.totalMinor)}</span>
          <Status value={job.status} />
        </div>
      </div>

      {over ? (
        <div role="alert" className="rounded-md border border-red-500/50 bg-red-500/5 p-3 text-sm">
          The job is now {money(job.totalMinor)}, over the {money(job.chargeCeilingMinor)} the customer authorized. Stop work and send a new estimate before going on.
        </div>
      ) : null}
      {problems.length && job.status === 'draft' ? (
        <div role="note" className="space-y-1 rounded-md border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
          {problems.map(p => <div key={p}>{p}</div>)}
        </div>
      ) : null}
      {candidates.length ? <VariantChooser jobId={job.id} version={job.version} candidates={candidates} /> : null}

      {job.lines.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left font-mono text-xs uppercase tracking-wide text-muted-foreground"><th className="py-2 pr-3 font-normal">Line</th><th className="py-2 pr-3 font-normal">Qty</th><th className="py-2 pr-3 text-right font-normal max-sm:hidden">Each</th><th className="py-2 pr-3 text-right font-normal">Amount</th><th className="py-2 pr-3 text-right font-normal max-sm:hidden">Tax</th><th className="py-2 font-normal" /></tr></thead>
            <tbody>
              {job.lines.map(l => (
                <tr key={l.id} className="border-b last:border-b-0 align-top">
                  <td className="py-2 pr-3">
                    <div>{l.description}</div>
                    <div className="text-xs text-muted-foreground">
                      {label(l.kind)}{l.partNumber ? ` · ${l.brand ? `${l.brand} ` : ''}${l.partNumber}` : ''}{l.condition ? ` · ${label(l.condition)}` : l.kind === 'part' || l.kind === 'tire' ? ' · condition not set' : ''}{l.subletVendorName ? ` · by ${l.subletVendorName}` : ''}{l.overlapCentiHours ? ` · overlap −${hours(l.overlapCentiHours)}` : ''}{l.auto ? ' · added by the fee rules' : ''}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono">{l.kind === 'labor' ? hours(l.soldCentiHours) : milli(l.quantityMilli)}</td>
                  <td className="py-2 pr-3 text-right font-mono max-sm:hidden">{l.kind === 'labor' ? '' : money(l.unitPriceMinor)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{money(l.extendedMinor)}</td>
                  <td className="py-2 pr-3 text-right font-mono max-sm:hidden">{l.taxable ? money(l.taxMinor) : 'none'}</td>
                  <td className="py-2 text-right">{!l.auto && EDITABLE.includes(job.status) ? <ActionButton op="editRepairJobLines" vars={{ jobId: job.id, expectedVersion: job.version, removeLineId: l.id }} confirm="Remove this line?" className="h-7 bg-transparent px-2 text-xs shadow-none">Remove</ActionButton> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Meta>No lines yet.</Meta>}

      <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
        <span>LABOR {money(job.laborMinor)}</span><span>PARTS {money(job.partsMinor)}</span><span>FEES {money(job.feesMinor)}</span><span>TAX {money(job.taxMinor)}</span>
        {current ? <span className="text-foreground">AUTHORIZED {money(current.amountMinor)} · {label(current.method)} · {current.actorName}</span> : null}
      </div>

      <div className="flex flex-wrap items-start gap-2">
        {EDITABLE.includes(job.status) ? <AddLineForm jobId={job.id} version={job.version} /> : null}
        {job.status === 'authorized' ? <ActionButton op="transitionRepairJob" vars={{ jobId: job.id, to: 'in_progress', expectedVersion: job.version }}>Start work</ActionButton> : null}
        {job.status === 'in_progress' ? <ActionButton op="transitionRepairJob" vars={{ jobId: job.id, to: 'completed', expectedVersion: job.version, cause: job.title, correction: 'Completed as authorized' }} confirm="Mark this job complete?">Complete</ActionButton> : null}
        {['draft', 'priced', 'offered'].includes(job.status) ? <ActionButton op="transitionRepairJob" vars={{ jobId: job.id, to: 'voided', expectedVersion: job.version }} ask="Why remove this job?">Void</ActionButton> : null}
      </div>
      {job.authorizations.length || job.decisions.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer py-3 font-mono text-xs uppercase md:py-0 tracking-wide text-muted-foreground">Authorization history</summary>
          <div className="mt-2 space-y-1">
            {job.authorizations.map(a => <div key={a.id} className="text-xs"><span className="font-mono">{a.estimateVersion?.reference}</span> · {money(a.amountMinor)} · {label(a.method)} by {a.actorName}{a.contactUsed ? ` at ${a.contactUsed}` : ''} · recorded by {a.recordedByUser?.name ?? 'link'} · {when(a.authorizedAt, ro.shop?.timeZone)} · <Status value={a.status} /></div>)}
            {job.decisions.filter(d => d.decision !== 'approved').map(d => <div key={d.id} className="text-xs">{label(d.decision)} by {d.actorName} · {label(d.method)} · {when(d.at, ro.shop?.timeZone)}{d.reason ? ` · ${d.reason}` : ''}</div>)}
          </div>
        </details>
      ) : null}
    </div>
  );
}

/** The repair order workspace: concerns, jobs and lines, the inspection, estimate versions and the authorization log. */
export default async function RepairOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ro, tz] = await Promise.all([repairOrder(id), orgTimeZone()]);
  if (!ro) notFound();
  const zone = ro.shop?.timeZone ?? tz;
  const extra = await q<{ cannedJobs: { id: string; code: string; name: string }[]; templates: { id: string; name: string }[]; contacts: { id: string; kind: string; label: string }[] }>(`query($shop: ID!, $customer: ID!) {
    cannedJobs(where: { active: { equals: true }, OR: [{ shop: null }, { shop: { id: { equals: $shop } } }] }, orderBy: { code: asc }) { id code name }
    templates: inspectionTemplates(orderBy: { name: asc }) { id name }
    contacts: customerContacts(where: { customer: { id: { equals: $customer } }, status: { equals: "active" } }) { id kind label }
  }`, { shop: ro.shop?.id ?? '', customer: ro.customer?.id ?? '' });
  const open = ro.status !== 'void' && ro.status !== 'invoiced' && ro.status !== 'closed';
  const sent = ro.estimateVersions.find(e => e.status === 'sent');
  const jobs = ro.jobs.filter(j => j.status !== 'voided');
  const { answerable: offered, changed } = sent ? answerableJobs(sent, jobs) : { answerable: [], changed: [] as string[] };
  const unsent = jobs.some(j => ['priced', 'needs_reauthorization'].includes(j.status));
  const risk = promisedRisk(ro.promisedAt, new Date(), ro.status === 'ready_to_invoice');
  const methods = ro.jurisdictionPolicyVersion?.allowedAuthorizationMethods ?? [];
  const openTasks = ro.tasks.filter(t => t.status === 'open');
  const inspection = ro.inspections[0];

  return (
    <Page title={ro.roNumber} crumbs={[{ label: 'Repair orders', href: '/dashboard/platform/repair-orders' }]}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat name="Customer" value={<Link className="underline-offset-2 hover:underline" href={`/dashboard/platform/customers?q=${encodeURIComponent(ro.customer?.displayName ?? '')}`}>{ro.customer?.displayName}</Link>} />
        <Stat name="Vehicle" value={<span className="text-base">{ro.vehicle?.label}</span>} />
        <Stat name="Stage" value={<span className="text-base">{BOARD_LABELS[ro.boardStage] ?? label(ro.boardStage)}</span>} />
        <Stat name="Promised" value={<span className={`text-base ${risk === 'late' ? 'text-red-600' : risk === 'due_soon' ? 'text-amber-600' : ''}`}>{ro.promisedAt ? when(ro.promisedAt, zone) : 'Not set'}{risk === 'late' ? ' (late)' : ''}</span>} />
        <Stat name="Total / authorized" value={<span className="font-mono text-base">{money(ro.currentTotalMinor)} / {money(ro.authorizedTotalMinor)}</span>} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Meta>{ro.shop?.name} · advisor {ro.serviceAdvisor?.name ?? 'none'} · odometer in {ro.odometerIn ? `${ro.odometerIn.value.toLocaleString('en-US')} ${ro.odometerIn.unit}` : 'not recorded'} · work order signed by {ro.checkIn?.signerName ?? 'nobody'}{ro.designee?.name ? ` · designee ${ro.designee.name}` : ''} · replaced parts: {label(ro.replacedPartsElection)}</Meta>
        {ro.jurisdictionPolicyVersion?.pack ? <span className="font-mono text-xs text-muted-foreground">{ro.jurisdictionPolicyVersion.pack.name} rules, version {ro.jurisdictionPolicyVersion.versionNumber}{ro.jurisdictionPolicyVersion.pack.verified ? "" : " (draft, not checked)"}</span> : null}
        {ro.status === 'on_hold' ? <span className="font-mono text-xs text-amber-600">ON HOLD: {label(ro.holdReason).toUpperCase()}</span> : null}
        {open ? <HoldForm repairOrderId={ro.id} version={ro.version} onHold={ro.status === 'on_hold'} /> : null}
      </div>

      {openTasks.length ? (
        <Section title="Callbacks for staff">
          {openTasks.map(t => (
            <Row key={t.id}>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{t.title}</span>{t.source === 'agent' ? <span className="font-mono text-xs text-amber-600">FROM THE ASSISTANT</span> : null}</div>
                <Meta>{label(t.kind)} · {when(t.createdAt, zone)}{t.detail ? ` · ${t.detail}` : ''}</Meta>
              </div>
              <CloseTaskButton taskId={t.id} version={t.version} />
            </Row>
          ))}
          <Meta>A callback is a reminder only. If the customer says yes, record the authorization below with their name and the number you called.</Meta>
        </Section>
      ) : null}

      <Section title="Concerns">
        {ro.concerns.map(c => (
          <Row key={c.id}>
            <div className="min-w-0 space-y-1"><div>&ldquo;{c.customerWords}&rdquo;</div>{c.cause ? <Meta>Cause: {c.cause}{c.correction ? ` · Correction: ${c.correction}` : ''}</Meta> : null}</div>
            <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{label(c.category)}</span>
          </Row>
        ))}
      </Section>

      <Section title={`Jobs (${jobs.length})`} aside={open ? <AddJobForm repairOrderId={ro.id} concerns={ro.concerns} cannedJobs={extra.cannedJobs} /> : null}>
        {jobs.length ? <div className="space-y-3">{jobs.map(j => <JobBlock key={j.id} job={j} ro={ro} />)}</div> : <Empty>No jobs yet. Add one from the shop&apos;s canned jobs or type the lines.</Empty>}
        {ro.jobs.length !== jobs.length ? <Meta>{ro.jobs.length - jobs.length} voided job{ro.jobs.length - jobs.length === 1 ? '' : 's'} hidden.</Meta> : null}
      </Section>

      <Section title="Inspection" aside={inspection ? <Link className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/dashboard/platform/inspections/${inspection.id}`}>Open the inspection</Link> : null}>
        {inspection ? (
          <Row href={`/dashboard/platform/inspections/${inspection.id}`}>
            <div className="min-w-0 space-y-1"><div className="font-medium">{inspection.templateVersion?.template?.name} v{inspection.templateVersion?.versionNumber}</div><Meta>{inspection.technician?.name ?? 'unassigned'} · {inspection.resultsCount} items{inspection.completedAt ? ` · completed ${when(inspection.completedAt, zone)}` : ''}{inspection.sentAt ? ` · sent ${when(inspection.sentAt, zone)}` : ''}</Meta></div>
            <Status value={inspection.status} />
          </Row>
        ) : open ? (
          <div className="flex flex-wrap gap-2">{extra.templates.map(t => <ActionButton key={t.id} op="startShopInspection" vars={{ repairOrderId: ro.id, templateId: t.id }}>Start {t.name}</ActionButton>)}</div>
        ) : <Empty>No inspection.</Empty>}
      </Section>

      <Section title="Estimate and authorization" aside={sent ? <a className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/api/estimates/${sent.id}/pdf`}>Estimate PDF</a> : null}>
        {open && unsent ? (
          <div className="flex flex-wrap items-center gap-3">
            <ActionButton op="sendRepairEstimate" vars={{ repairOrderId: ro.id, expectedVersion: ro.version }} className="bg-primary text-primary-foreground">{sent ? 'Send a new estimate version' : 'Send the estimate'}</ActionButton>
            <Meta>Freezes the priced jobs as version {(ro.estimateVersions[0]?.versionNumber ?? 0) + 1}. A sent version never changes.</Meta>
          </div>
        ) : null}
        {sent && offered.length ? (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{sent.reference} waiting on the customer · {money(sent.totalMinor)}</div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/dashboard/platform/repair-orders/${ro.id}/authorize`} className="inline-flex h-8 max-md:h-11 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">Customer is here: sign on the tablet</Link>
                <AuthorizationLinkButton estimateVersionId={sent.id} contacts={extra.contacts} />
              </div>
            </div>
            {methods.includes('oral_phone') ? <PhoneAuthorizationForm estimateVersionId={sent.id} jobs={offered.map(j => ({ id: j.id, number: j.number, title: j.title, totalMinor: j.totalMinor }))} customerName={ro.customer?.displayName ?? ''} replacedParts={ro.jurisdictionPolicyVersion?.replacedPartsOfferRequired ? ro.jurisdictionPolicyVersion.replacedPartsOfferText : ''} /> : null}
          </div>
        ) : null}
        {sent && changed.length ? <Meta>{changed.length === 1 ? 'One job has' : `${changed.length} jobs have`} changed since {sent.reference} was sent: send a new version for the customer to answer {changed.length === 1 ? 'it' : 'them'}.</Meta> : null}
        {ro.estimateVersions.length ? ro.estimateVersions.map(e => (
          <Row key={e.id}>
            <div className="min-w-0 space-y-1"><span className="font-mono text-sm">{e.reference}</span><Meta>Sent {when(e.sentAt, zone)} by {e.sentBy?.name ?? 'staff'} · {(e.includedJobIds ?? []).length} jobs · tax {money(e.taxMinor)}</Meta></div>
            <div className="flex items-center gap-4"><span className="font-mono text-sm">{money(e.totalMinor)}</span><Status value={e.status} /><a className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/api/estimates/${e.id}/pdf`}>PDF</a></div>
          </Row>
        )) : <Empty>No estimate sent yet.</Empty>}
        {ro.authorizationRequests.length ? (
          <div className="space-y-1">
            {ro.authorizationRequests.map(r => <div key={r.id} className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><span className="font-mono">{r.estimateVersion?.reference}</span><span>link by {label(r.channel)}{r.contactLabel ? ` to ${r.contactLabel}` : ''}</span><span>{r.viewedAt ? `viewed ${when(r.viewedAt, zone)}` : 'not viewed'}</span><span>expires {when(r.expiresAt, zone)}</span><Status value={r.status} /></div>)}
          </div>
        ) : null}
      </Section>

      <BillingSection ro={ro} zone={zone} odometerHint={ro.odometerIn?.value ?? null} cardReady={/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? '')} />

      {open ? (
        <Section title="Leave a callback for staff">
          <CallbackTaskForm repairOrderId={ro.id} />
        </Section>
      ) : null}
      {ro.tasks.length !== openTasks.length ? (
        <Section title="Closed callbacks">
          {ro.tasks.filter(t => t.status !== 'open').map(t => <Row key={t.id}><span>{t.title}</span><Meta>{t.outcome || label(t.status)}</Meta></Row>)}
        </Section>
      ) : null}
    </Page>
  );
}
