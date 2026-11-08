import Link from 'next/link';
import { notFound } from 'next/navigation';
import { money, label, milli, hours } from '../../lib/format';
import { Page, Empty, Section, Meta } from '../../components/ui';
import { answerableJobs, repairOrder } from '../lib/queries';
import { AuthorizeTablet } from './AuthorizeTablet';

/**
 * The in-shop authorization tablet (a staff route). The advisor hands the tablet to the customer, who
 * reads the frozen estimate version, chooses per job and signs. Recorded as in_person_signature with
 * the advisor as witness.
 */
export default async function AuthorizePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ro = await repairOrder(id);
  if (!ro) notFound();
  const sent = ro.estimateVersions.find(e => e.status === 'sent');
  // The customer reads and answers the frozen version; a job changed since it was sent needs a new version.
  const { answerable: jobs, changed } = sent ? answerableJobs(sent, ro.jobs) : { answerable: [], changed: [] as string[] };
  const law = ro.jurisdictionPolicyVersion;
  const back = `/dashboard/platform/repair-orders/${ro.id}`;
  return (
    <Page title="Authorize work" crumbs={[{ label: 'Repair orders', href: '/dashboard/platform/repair-orders' }, { label: ro.roNumber, href: back }]}>
      {!sent || !jobs.length ? (
        <Empty>Nothing is waiting for the customer on {ro.roNumber}. <Link className="underline" href={back}>Back to the repair order</Link></Empty>
      ) : !(law?.allowedAuthorizationMethods ?? []).includes('in_person_signature') ? (
        <Empty>The {law?.pack?.name ?? 'state'} rules for this shop don&apos;t allow a tablet signature. Record the authorization another way.</Empty>
      ) : (
        <>
          <Section title={`${sent.reference} · ${ro.customer?.displayName} · ${ro.vehicle?.label}`}>
            {changed.length ? <Meta>{changed.length === 1 ? 'One job changed' : `${changed.length} jobs changed`} after this version was sent and is not shown. The advisor will send a new version for it.</Meta> : null}
            <div className="space-y-4">
              {jobs.map(j => (
                <div key={j.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-base font-medium">{j.title}</span>
                    <span className="font-mono text-base">{money(j.totalMinor)}</span>
                  </div>
                  {j.description ? <p className="text-sm text-muted-foreground">{j.description}</p> : null}
                  <ul className="space-y-1 text-sm">
                    {j.lines.map((l, i) => (
                      <li key={i} className="flex flex-wrap justify-between gap-2">
                        <span className="min-w-0">{l.description}{l.condition ? <span className="text-muted-foreground"> · {label(l.condition)} part</span> : null}<span className="text-muted-foreground"> · {l.kind === 'labor' ? hours(l.hours ?? 0) : `qty ${milli(l.quantityMilli ?? 0)}`}</span></span>
                        <span className="font-mono">{money(l.extendedMinor)}</span>
                      </li>
                    ))}
                  </ul>
                  <Meta>Parts and fees {money(String(BigInt(j.partsMinor) + BigInt(j.feesMinor)))} · labor {money(j.laborMinor)} · tax {money(j.taxMinor)}</Meta>
                </div>
              ))}
            </div>
          </Section>
          <AuthorizeTablet
            estimateVersionId={sent.id}
            back={back}
            customerName={ro.designee?.name && !ro.customer ? ro.designee.name : ro.customer?.displayName ?? ''}
            jobs={jobs.map(j => ({ id: j.id, number: j.number, title: j.title, totalMinor: j.totalMinor }))}
            consentText={sent.snapshot?.disclosures?.consentText ?? ''}
            replacedPartsText={law?.replacedPartsOfferRequired ? law.replacedPartsOfferText : ''}
          />
        </>
      )}
    </Page>
  );
}
