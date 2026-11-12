import { q, holds, orgTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section, Stat } from '../../components/ui';
import { CopyText, SaveTemplateForm } from './Actions';

type Thread = { id: string; lastMessageAt: string | null; unreadCount: number; customer: { displayName: string } | null; repairOrder: { roNumber: string } | null; vehicle: { year: number | null; make: string; model: string } | null };
type Template = { id: string; name: string; purpose: string; body: string; version: number };
type Review = { id: string; direction: string; channel: string; body: string; at: string; customer: { displayName: string } | null };

/** The record of what the shop and customers said to each other, a thread per repair order, and the wording staff copy. Nothing here sends. */
export default async function MessagesPage() {
  const can = await holds(['canMessageCustomers', 'canManageCustomers', 'canManageCampaigns']);
  if (!Object.values(can).some(Boolean)) return <Page title="Messages"><Empty>Your role is not allowed to view messages.</Empty></Page>;
  const d = await q<{ messageThreads: Thread[]; messageTemplates: Template[]; messages: Review[] }>(`{
    messageThreads(orderBy: { lastMessageAt: desc }, take: 100) { id lastMessageAt unreadCount customer { displayName } repairOrder { roNumber } vehicle { year make model } }
    messageTemplates(where: { active: { equals: "active" } }, orderBy: { name: asc }) { id name purpose body version }
    messages(where: { reviewState: { equals: "needs_review" } }, orderBy: { at: desc }, take: 50) { id direction channel body at customer { displayName } }
  }`);
  const tz = await orgTimeZone();
  return (
    <Page title="Messages">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat name="Conversations" value={<span className="font-mono text-base">{d.messageThreads.length}</span>} />
        <Stat name="Replies to read" value={<span className="font-mono text-base">{d.messages.length}</span>} />
        <Stat name="Templates" value={<span className="font-mono text-base">{d.messageTemplates.length}</span>} />
      </div>
      {d.messages.length ? (
        <Section title="Replies to read">
          {d.messages.map(m => (
            <Row key={m.id}><div className="min-w-0 space-y-1"><div className="break-words font-medium">{m.customer?.displayName}</div><div className="break-words text-sm">{m.body}</div><Meta>{label(m.channel === 'sms' ? 'text message' : 'email')} · {when(m.at, tz)}</Meta></div></Row>
          ))}
        </Section>
      ) : null}
      <Section title="Conversations">
        {d.messageThreads.length ? d.messageThreads.map(t => (
          <Row key={t.id} href={`/dashboard/platform/messages/${t.id}`}>
            <div className="min-w-0 space-y-1">
              <div className="break-words font-medium">{t.customer?.displayName}</div>
              <Meta>{t.repairOrder ? `Repair order ${t.repairOrder.roNumber}` : 'General'}{t.vehicle ? ` · ${[t.vehicle.year, t.vehicle.make, t.vehicle.model].filter(Boolean).join(' ')}` : ''}</Meta>
            </div>
            <div className="text-right"><Meta>{when(t.lastMessageAt, tz)}</Meta>{t.unreadCount ? <div><Meta>{t.unreadCount} new</Meta></div> : null}</div>
          </Row>
        )) : <Empty>No conversations yet. Log a call or message from a customer or repair order.</Empty>}
      </Section>
      <Section title="Templates">
        {d.messageTemplates.map(t => (
          <Row key={t.id}>
            <div className="min-w-0 space-y-1"><div className="break-words font-medium">{t.name} <Meta>{t.purpose === 'marketing' ? 'Marketing' : 'About a repair'} · version {t.version}</Meta></div><div className="break-words text-sm text-muted-foreground">{t.body}</div></div>
            <CopyText text={t.body} />
          </Row>
        ))}
        {can.canMessageCustomers || can.canManageCampaigns ? <div className="pt-3"><SaveTemplateForm /></div> : null}
      </Section>
    </Page>
  );
}
