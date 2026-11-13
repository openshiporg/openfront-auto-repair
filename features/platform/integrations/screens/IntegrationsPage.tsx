import { q, holds } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Status } from '../../components/ui';
import { Act, ConnectionForm, WebhookForm, integrationPaths } from './Actions';

type Conn = { id: string; kind: string; providerKey: string; mode: string; status: string; lastHealthAt: string | null; health: { message?: string; ok?: boolean } | null; shop: { name: string } | null };
type Hook = { id: string; url: string; events: string[]; isActive: boolean; failureCount: number; lastTriggered: string | null };
type Ev = { id: string; eventType: string; delivered: boolean; deliveryAttempts: number; deadLetteredAt: string | null; responseStatus: number | null; createdAt: string };
type Obs = { id: string; kind: string; externalId: string; receivedAt: string; applyResult: string; connection: { providerKey: string } | null };

/** Connections, what providers told us, and the outbound webhooks. Secrets are never shown after they are saved. */
export default async function IntegrationsPage() {
  const can = await holds(['canManageIntegrations']);
  if (!can.canManageIntegrations) return <Page title="Integrations"><Empty>Your role is not allowed to manage integrations.</Empty></Page>;
  const d = await q<{ shops: { id: string }[]; integrationConnections: Conn[]; webhookEndpoints: Hook[]; webhookEvents: Ev[]; providerObservations: Obs[]; webhookTopics: { topic: string }[] }>(`{
    shops(orderBy: { name: asc }) { id }
    integrationConnections(orderBy: { createdAt: desc }, take: 50) { id kind providerKey mode status lastHealthAt health shop { name } }
    webhookEndpoints(orderBy: { createdAt: desc }) { id url events isActive failureCount lastTriggered }
    webhookEvents(orderBy: { createdAt: desc }, take: 25) { id eventType delivered deliveryAttempts deadLetteredAt responseStatus createdAt }
    providerObservations(orderBy: { receivedAt: desc }, take: 20) { id kind externalId receivedAt applyResult connection { providerKey } }
    webhookTopics }`);
  const shopId = d.shops[0]?.id;
  return (
    <Page title="Integrations">
      <Section title="Connections">
        {d.integrationConnections.length ? d.integrationConnections.map((c) => (
          <Row key={c.id}>
            <div className="min-w-0"><div className="font-medium">{label(c.kind)} · {c.providerKey}</div><Meta>{label(c.mode)}{c.shop ? ` · ${c.shop.name}` : ' · whole organisation'}{c.lastHealthAt ? ` · checked ${when(c.lastHealthAt)}` : ''}{c.health?.message ? ` · ${c.health.message}` : ''}</Meta></div>
            <div className="flex items-center gap-2"><Status value={c.status} />{c.status !== 'revoked' ? <><Act op="recordIntegrationHealth" vars={{ connectionId: c.id, ok: true }} paths={integrationPaths}>Mark healthy</Act><Act op="revokeIntegrationConnection" vars={{ connectionId: c.id, reason: 'Turned off from the dashboard' }} paths={integrationPaths} confirmText="Turn this connection off?">Turn off</Act></> : null}</div>
          </Row>
        )) : <Empty>No connections yet.</Empty>}
        {shopId ? <ConnectionForm shopId={shopId} /> : null}
      </Section>
      <Section title="Webhooks out" aside={<Act op="sendDueWebhooks" vars={{}} paths={integrationPaths}>Send what is due</Act>}>
        <Meta>Signed with HMAC-SHA256 in the x-openfront-signature header. Failed deliveries retry with a growing wait, then stop and can be replayed.</Meta>
        {d.webhookEndpoints.map((h) => <Row key={h.id}><div className="min-w-0"><div className="break-all font-medium">{h.url}</div><Meta>{h.events.join(', ')} · {h.failureCount} failures</Meta></div><Status value={h.isActive ? 'active' : 'paused'} /></Row>)}
        {shopId ? <WebhookForm shopId={shopId} topics={d.webhookTopics.map((t) => t.topic)} /> : null}
        {d.webhookEvents.map((e) => <Row key={e.id}><div className="min-w-0"><div className="font-mono text-xs">{e.eventType}</div><Meta>{when(e.createdAt)} · {e.deliveryAttempts} tries{e.responseStatus ? ` · ${e.responseStatus}` : ''}</Meta></div><div className="flex items-center gap-2"><Status value={e.delivered ? 'delivered' : e.deadLetteredAt ? 'failed' : 'pending'} />{e.deadLetteredAt ? <Act op="replayWebhookEvent" vars={{ eventId: e.id }} paths={integrationPaths}>Replay</Act> : null}</div></Row>)}
      </Section>
      <Section title="What providers told us">
        {d.providerObservations.length ? d.providerObservations.map((o) => <Row key={o.id}><span className="text-sm">{o.connection?.providerKey} · {label(o.kind)} · {o.externalId || 'no id'}</span><Meta>{when(o.receivedAt)}{o.applyResult ? ` · ${o.applyResult}` : ''}</Meta></Row>) : <Empty>Nothing received.</Empty>}
      </Section>
    </Page>
  );
}
