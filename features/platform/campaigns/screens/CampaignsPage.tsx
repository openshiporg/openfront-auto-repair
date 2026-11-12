import { q, holds } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section } from '../../components/ui';
import { CopyForCustomer, ExportCampaign, NewCampaignForm } from '../../messages/screens/Actions';

type Camp = { id: string; name: string; kind: string; status: string; messageText: string; shop: { id: string; name: string } | null };
type Preview = { included: { customerId: string; name: string; detail: string; channel: string }[]; held: { customerId: string; name: string; reason: string }[] };

const FOR: Record<string, string> = { reminders: 'Customers with service due', declined_work: 'Customers who put off work', reviews: 'Recent customers, for a review', promo: 'All active customers' };

/** Audiences are lists. Staff export the file or copy the wording; the app never sends. Consent is checked again on export. */
export default async function CampaignsPage() {
  const can = await holds(['canManageCampaigns', 'canMessageCustomers']);
  if (!can.canManageCampaigns && !can.canMessageCustomers) return <Page title="Campaigns"><Empty>Your role is not allowed to view campaigns.</Empty></Page>;
  const { campaigns, shops } = await q<{ campaigns: Camp[]; shops: { id: string; name: string }[] }>(`{ campaigns(where: { status: { not: { equals: "ended" } } }, orderBy: { createdAt: desc }, take: 50) { id name kind status messageText shop { id name } } shops(take: 1) { id name } }`);
  const previews = await Promise.all(campaigns.map(c => q<{ campaignPreview: Preview }>(`query($id: ID!) { campaignPreview(campaignId: $id) }`, { id: c.id }).then(r => r.campaignPreview).catch(() => null)));
  return (
    <Page title="Campaigns">
      {campaigns.length ? campaigns.map((c, i) => {
        const p = previews[i];
        return (
          <Section key={c.id} title={c.name} aside={can.canManageCampaigns ? <ExportCampaign campaignId={c.id} name={c.name} /> : null}>
            <Meta>{FOR[c.kind] ?? label(c.kind)}{c.shop ? ` · ${c.shop.name}` : ''}</Meta>
            <p className="break-words text-sm">{c.messageText}</p>
            {p ? (
              <>
                <Meta>{p.included.length} can be contacted, {p.held.length} held back</Meta>
                {p.included.map(r => (
                  <Row key={r.customerId}><div className="min-w-0"><div className="break-words font-medium">{r.name}</div><Meta>{r.channel === 'sms' ? 'Text' : 'Email'}{r.detail ? ` · ${r.detail}` : ''}</Meta></div><CopyForCustomer campaignId={c.id} customerId={r.customerId} /></Row>
                ))}
                {p.held.length ? <details className="text-sm"><summary className="cursor-pointer py-2">Held back: no marketing consent ({p.held.length})</summary>{p.held.map(r => <Row key={r.customerId}><div className="min-w-0"><div className="break-words font-medium">{r.name}</div><Meta>{r.reason}</Meta></div></Row>)}</details> : null}
              </>
            ) : <Empty>This audience could not be worked out.</Empty>}
          </Section>
        );
      }) : <Empty>No campaigns yet.</Empty>}
      {can.canManageCampaigns && shops[0] ? <Section title="New campaign"><NewCampaignForm shopId={shops[0].id} /></Section> : null}
    </Page>
  );
}
