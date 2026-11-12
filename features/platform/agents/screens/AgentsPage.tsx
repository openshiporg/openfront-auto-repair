import Link from 'next/link';
import { q, holds } from '../../lib/server';
import { when, label, money } from '../../lib/format';
import { Page, Row, Empty, Status, Meta, Section, Stat } from '../../components/ui';
import { Act, GrantForm, NewAssistantForm, ProviderForm } from './AgentsActions';
import { SCOPE_LABELS, AGENT_SCOPES } from '@/features/keystone/agents/constants';

type Agent = { id: string; name: string; status: string; paused: boolean; kind: string; owner: { name: string } | null; shops: { id: string; name: string }[]; grants: { id: string; scope: string; status: string }[] };

/**
 * Assistants act only when someone asks, and only through plans a person confirms. What an assistant may do is the
 * overlap of what it was allowed here and what the person using it may do.
 */
export default async function AgentsPage() {
  const can = await holds(['canManageAgents', 'canApproveAgentAutonomy']);
  let agents: Agent[] = [];
  let shops: { id: string; name: string }[] = [];
  let provider: { connected: boolean; model: string | null; host: string | null } = { connected: false, model: null, host: null };
  let policy: { diagnosisTrustThreshold: string; agentOrderLimitMinor: string | null } | null = null;
  try {
    const d = await q<{ agentIdentities: Agent[]; shops: { id: string; name: string }[]; aiProviderStatus: typeof provider }>(`{
      agentIdentities(orderBy: { name: asc }, take: 100) { id name status paused kind owner { name } shops { id name } grants(where: { status: { equals: "active" } }) { id scope status } }
      shops(orderBy: { code: asc }) { id name } aiProviderStatus }`);
    agents = d.agentIdentities; shops = d.shops; provider = d.aiProviderStatus;
  } catch {}
  try {
    const p = await q<{ shopPolicyVersions: { diagnosisTrustThreshold: string; agentOrderLimitMinor: string | null }[] }>(`{ shopPolicyVersions(where: { status: { equals: "published" } }, orderBy: { versionNumber: desc }, take: 1) { diagnosisTrustThreshold agentOrderLimitMinor } }`);
    policy = p.shopPolicyVersions?.[0] ?? null;
  } catch {}
  const scopes = AGENT_SCOPES.map(s => ({ scope: s, label: SCOPE_LABELS[s] }));
  return (
    <Page title="Assistants">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Assistants" value={<span className="font-mono text-base">{agents.filter(a => a.status === 'active').length}</span>} />
        <Stat name="AI provider" value={<span className="text-base">{provider.connected ? `Connected (${provider.model})` : 'No AI provider connected'}</span>} />
        <Stat name="Assistants may order parts up to" value={<span className="font-mono text-base">{policy && BigInt(policy.agentOrderLimitMinor ?? 0) > 0n ? money(policy.agentOrderLimitMinor) : 'Never on their own'}</span>} />
      </div>
      <Section title="AI provider" aside={can.canManageAgents ? <div className="flex flex-wrap gap-2"><ProviderForm connected={provider.connected} />{provider.connected ? <Act op="removeAiProvider" vars={{}} confirm="Remove the saved key?">Remove the key</Act> : null}</div> : null}>
        <p className="text-sm text-muted-foreground">{provider.connected ? `Plans written in words go to ${provider.host}, using the key you saved.` : 'Without a provider, assistants take plans that staff type in. Everything else works the same: preview, then Confirm.'}</p>
      </Section>
      <Section title="Assistants" aside={can.canManageAgents ? <NewAssistantForm shops={shops} /> : null}>
        {agents.length ? agents.map(a => (
          <Row key={a.id}>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2"><span className="break-words font-medium">{a.name}</span><Status value={a.paused ? 'paused' : a.status} /></div>
              <Meta>{a.owner ? `Run by ${a.owner.name} · ` : ''}{a.shops.map(s => s.name).join(', ') || 'No shops yet'}</Meta>
              <ul className="space-y-1">
                {a.grants.length ? a.grants.map(g => (
                  <li key={g.id} className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-0 break-words">{SCOPE_LABELS[g.scope as keyof typeof SCOPE_LABELS] ?? label(g.scope)}</span>
                    {can.canApproveAgentAutonomy ? <Act op="revokeAssistantScope" vars={{ grantId: g.id }}>Take away</Act> : null}</li>
                )) : <li className="text-sm text-muted-foreground">Not allowed to do anything yet.</li>}
              </ul>
              {can.canApproveAgentAutonomy && a.status === 'active' ? <GrantForm agentId={a.id} options={scopes.filter(s => !a.grants.some(g => g.scope === s.scope))} /> : null}
            </div>
            {can.canManageAgents && a.status === 'active' ? (
              <div className="flex flex-wrap items-start gap-2">
                <Act op="pauseAssistant" vars={{ agentId: a.id, paused: !a.paused }} confirm={a.paused ? undefined : 'Pause this assistant? Its waiting plans are cancelled.'}>{a.paused ? 'Resume' : 'Pause'}</Act>
                <Act op="retireAssistant" vars={{ agentId: a.id }} confirm="Retire this assistant for good?">Retire</Act>
              </div>
            ) : null}
          </Row>
        )) : <Empty>No assistants yet.</Empty>}
      </Section>
      <Section title="Autonomy">
        <p className="text-sm text-muted-foreground">By default every assistant plan waits for a person to confirm each step. {policy ? `Diagnosis needs ${Math.round(Number(policy.diagnosisTrustThreshold) * 100)}% confidence before a quote.` : ''} Changing what assistants may do on their own is a policy change that needs {can.canApproveAgentAutonomy ? 'you' : 'an owner'} to approve. <Link className="underline" href="/dashboard/platform/policies">Open policies</Link>.</p>
      </Section>
    </Page>
  );
}
