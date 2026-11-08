import Link from 'next/link';
import { q, orgTimeZone } from '../../lib/server';
import { when, money, percent, label } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Tabs, Stat } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';

/** Older published wording carried build notes; show the customer-facing text only. */
const clean = (t: string) => t.replace(/\s*-\s*placeholder rate/gi, '').replace(/\s*Battery deposit amount: placeholder rate \(BUILD-PLAN[^)]*\)\.?/gi, '').replace(/\s*·\s*$/, '').trim();

type Version = { id: string; versionNumber: number; status: string; version: number; publishedAt: string | null; notes: string; author: { name: string } | null; publishedBy: { name: string } | null };
type Kind = { kind: string; label: string; list: string; path: string; gql: string; pointer: string; detail: string };

/** One row per policy kind (lib/policy POLICY_KINDS). `path` is the generic list screen used to edit a draft. */
const KINDS: Kind[] = [
  { kind: 'shop_policy', label: 'Shop policy', list: 'shopPolicyVersions', path: 'shop-policy-versions', gql: 'shopPolicy', pointer: 'shopPolicy', detail: 'diagnosisTrustThreshold noShowGraceMinutes promisedTimeRequired agentOrderLimitMinor agentAutonomy' },
  { kind: 'labor_rates', label: 'Labor rates', list: 'laborRateClassSetVersions', path: 'labor-rate-class-set-versions', gql: 'laborRateClassSet', pointer: 'laborRateClassSet', detail: 'classes(orderBy: { rateMinor: asc }) { code name rateMinor isDefault }' },
  { kind: 'parts_matrix', label: 'Parts matrix', list: 'partsMatrixVersions', path: 'parts-matrix-versions', gql: 'partsMatrix', pointer: 'partsMatrix', detail: 'tiers marginFloorPct' },
  { kind: 'fees', label: 'Fees', list: 'feePolicyVersions', path: 'fee-policy-versions', gql: 'feePolicy', pointer: 'feePolicy', detail: 'rules { code kind percent flatMinor perUnitMinor itemCategory taxTreatment invoiceText }' },
  { kind: 'tax', label: 'Sales tax', list: 'taxRuleSetVersions', path: 'tax-rule-set-versions', gql: 'taxRuleSet', pointer: 'taxRuleSet', detail: 'rounding rules { taxable rate category { code name } }' },
  { kind: 'warranty', label: 'Warranty', list: 'warrantyTermSetVersions', path: 'warranty-term-set-versions', gql: 'warrantyTermSet', pointer: 'warrantyTermSet', detail: 'terms { code name months miles }' },
];
const META = 'id versionNumber status version publishedAt notes author { name } publishedBy { name }';

type Law = Version & { estimateThresholdMinor: string | null; toleranceRule: { kind: string; fixedMinor?: string; percent?: string; capMinor?: string; includesTax?: boolean } | null; requireOdometerIn: boolean; requireSignedWorkOrder: boolean; shopSuppliesGenericAllowed: boolean; recordRetentionYears: number; allowedAuthorizationMethods: string[] | null };
type Pack = { id: string; code: string; name: string; verified: boolean; sourceRefs: { title?: string; url?: string }[] | null; versions: Law[] };

function tolerance(rule: Law['toleranceRule']) {
  if (!rule) return '—';
  const tax = rule.includesTax ? ' including tax' : ', before tax';
  switch (rule.kind) {
    case 'fixed': return rule.fixedMinor === '0' ? 'none; any increase needs new authorization' : `${money(rule.fixedMinor)}${tax}`;
    case 'percent': return `${percent(rule.percent)}${tax}`;
    case 'max_of': return `the greater of ${percent(rule.percent)} or ${money(rule.fixedMinor)}${rule.capMinor ? `, at most ${money(rule.capMinor)}` : ''}${tax}`;
    case 'min_of': return `the lesser of ${percent(rule.percent)} or ${money(rule.fixedMinor)}${tax}`;
    default: return label(rule.kind);
  }
}

/** Summary of a published version's content for the row under it. */
function summary(kind: string, v: Record<string, any>) {
  switch (kind) {
    case 'shop_policy': return `Diagnosis trust gate ${percent(v.diagnosisTrustThreshold)} · no-show grace ${v.noShowGraceMinutes} min · ${BigInt(v.agentOrderLimitMinor ?? 0) > 0n ? `assistants may order up to ${money(v.agentOrderLimitMinor)}` : 'assistants may not place orders'} · authorizations recorded by assistants: ${v.agentAutonomy?.record_authorization ?? 'off'}`;
    case 'labor_rates': return (v.classes ?? []).map((c: any) => `${c.name || c.code} ${money(c.rateMinor)}/h${c.isDefault ? ' (default)' : ''}`).join(' · ');
    case 'parts_matrix': return `${(v.tiers ?? []).length} cost tiers · margin floor ${percent(v.marginFloorPct)}`;
    case 'fees': return (v.rules ?? []).map((r: any) => `${clean(r.invoiceText || label(r.code))} ${r.perUnitMinor ? `${money(r.perUnitMinor)} each` : r.flatMinor ? money(r.flatMinor) : percent(r.percent)}`).join(' · ') || 'No fees';
    case 'tax': return (v.rules ?? []).map((r: any) => `${r.category?.name ?? '?'} ${r.taxable ? percent(r.rate) : 'not taxed'}`).join(' · ');
    case 'warranty': return (v.terms ?? []).map((t: any) => t.name || `${label(t.code)} ${t.months} mo / ${Number(t.miles).toLocaleString('en-US')} mi`).join(' · ');
    default: return '';
  }
}

/**
 * Policies are versioned: a published version never changes. To change one, make a draft (a copy),
 * edit it, then publish. Publishing needs a second person when someone else holds the permission,
 * and agent-autonomy changes always need canApproveAgentAutonomy. Repair orders pin the versions they used.
 */
export default async function PoliciesPage({ searchParams }: { searchParams?: Promise<{ shop?: string; view?: string }> }) {
  const params = (await searchParams) ?? {};
  const tz = await orgTimeZone();
  const base = await q<{ shops: { id: string; code: string; name: string }[]; jurisdictionPacks: Pack[] }>(`{
    shops(orderBy: { code: asc }) { id code name }
    jurisdictionPacks(orderBy: { code: asc }) { id code name verified sourceRefs versions(orderBy: { versionNumber: desc }, take: 2) { ${META} estimateThresholdMinor toleranceRule requireOdometerIn requireSignedWorkOrder shopSuppliesGenericAllowed recordRetentionYears allowedAuthorizationMethods } }
  }`);
  const view = params.view === 'law' ? 'law' : 'shop';
  const shop = base.shops.find(s => s.code === params.shop) ?? base.shops[0];
  const tabs = [
    ...base.shops.map(s => ({ key: s.code, label: s.name, href: `/dashboard/platform/policies?shop=${s.code}` })),
    { key: 'law', label: 'State rules', href: '/dashboard/platform/policies?view=law', count: base.jurisdictionPacks.length },
  ];

  if (view === 'law' || !shop) {
    return (
      <Page title="Policies">
        <Tabs active="law" items={tabs} />
        <Section title="State rules (jurisdiction packs)">
          {base.jurisdictionPacks.length ? base.jurisdictionPacks.map(p => {
            const v = p.versions.find(x => x.status === 'published');
            return (
              <Row key={p.id}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.verified ? <span className="font-mono text-xs text-emerald-700 dark:text-emerald-400">VERIFIED</span> : <span className="font-mono text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400">draft · not checked against the regulations</span>}
                  </div>
                  {v ? (
                    <Meta>
                      Price over the authorized amount: {tolerance(v.toleranceRule)} · written estimate {v.estimateThresholdMinor ? `over ${money(v.estimateThresholdMinor)}` : 'always'} · odometer in {v.requireOdometerIn ? 'required' : 'optional'} · signed work order {v.requireSignedWorkOrder ? 'required' : 'optional'} · generic shop supplies {v.shopSuppliesGenericAllowed ? 'allowed' : 'not allowed'} · keep records {v.recordRetentionYears} year{v.recordRetentionYears === 1 ? '' : 's'}
                    </Meta>
                  ) : <Meta>No published version</Meta>}
                  {p.sourceRefs?.length ? <Meta><br />Sources: {p.sourceRefs.slice(0, 4).map(s => s.title).filter(Boolean).join(' · ')}</Meta> : null}
                </div>
                <Status value={v ? `v${v.versionNumber}` : 'none'} />
              </Row>
            );
          }) : <Empty>No state rules loaded.</Empty>}
        </Section>
      </Page>
    );
  }

  const data = await q<Record<string, any>>(`query($shop: ID!) {
    shop(where: { id: $shop }) {
      id code jurisdictionPolicy { id versionNumber pack { code name verified } }
      ${KINDS.map(k => `${k.pointer} { id }`).join(' ')}
    }
    ${KINDS.map(k => `${k.kind}: ${k.list}(where: { shop: { id: { equals: $shop } } }, orderBy: { versionNumber: desc }, take: 4) { ${META} ${k.detail} }`).join('\n    ')}
  }`, { shop: shop.id });
  const pack = data.shop?.jurisdictionPolicy?.pack;
  const published = KINDS.filter(k => data.shop?.[k.pointer]?.id).length;
  const drafts = KINDS.reduce((n, k) => n + (data[k.kind] as Version[]).filter(v => v.status === 'draft').length, 0);

  return (
    <Page title="Policies">
      <Tabs active={shop.code} items={tabs} />
      {pack && !pack.verified ? (
        <div role="note" className="rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
          {shop.name} follows the {pack.name} rules, which are a draft that has not been checked against the regulations. Check them before relying on them.
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="State rules" value={pack ? `${pack.name}${pack.verified ? " (verified)" : " (draft)"}` : '—'} />
        <Stat name="Published" value={`${published} / ${KINDS.length}`} />
        <Stat name="Drafts" value={drafts} />
        <Stat name="Shop" value={shop.name} />
      </div>
      {KINDS.map(k => {
        const versions = data[k.kind] as (Version & Record<string, any>)[];
        const current = versions.find(v => v.id === data.shop?.[k.pointer]?.id);
        const draft = versions.find(v => v.status === 'draft');
        return (
          <Section key={k.kind} title={k.label} aside={
            draft
              ? <span className="flex flex-wrap items-center gap-2">
                  <Link className="inline-flex min-h-11 items-center text-xs underline md:min-h-0" href={`/dashboard/${k.path}/${draft.id}`}>Edit draft v{draft.versionNumber}</Link>
                  <ActionButton op="publishPolicyVersion" vars={{ kind: k.kind, versionId: draft.id, expectedVersion: draft.version }} confirm={`Publish ${k.label} v${draft.versionNumber}? New repair orders will use it.`}>Publish</ActionButton>
                </span>
              : <ActionButton op="createPolicyDraft" vars={{ kind: k.kind, headId: shop.id }}>New draft</ActionButton>
          }>
            {current ? (
              <Row>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">v{current.versionNumber}</span><Status value="published" /></div>
                  <p className="break-words text-sm">{summary(k.kind, current)}</p>
                  <Meta>Published {when(current.publishedAt, tz)}{current.publishedBy ? ` by ${current.publishedBy.name}` : ''}{clean(current.notes) ? ` · ${clean(current.notes)}` : ''}</Meta>
                </div>
              </Row>
            ) : <Empty>Nothing published yet.</Empty>}
            {versions.filter(v => v.id !== current?.id && v.status !== 'draft').slice(0, 2).map(v => (
              <Row key={v.id}><Meta>v{v.versionNumber} · {label(v.status)} · {when(v.publishedAt, tz)}</Meta></Row>
            ))}
          </Section>
        );
      })}
    </Page>
  );
}
