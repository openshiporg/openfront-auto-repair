import { notFound } from 'next/navigation';
import { q, holds, orgTimeZone } from '../../lib/server';
import { when, label } from '../../lib/format';
import { Page, Row, Empty, Meta, Section } from '../../components/ui';
import { LogCallForm, LogMessageForm } from './Actions';

type Item = { at: string; kind: 'message' | 'call'; direction: string; text: string; how: string };

/** One conversation: every message and call logged for a repair order, oldest first, with forms to write down the next one. */
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound();
  const can = await holds(['canMessageCustomers', 'canManageCustomers']);
  if (!can.canMessageCustomers && !can.canManageCustomers) return <Page title="Conversation"><Empty>Your role is not allowed to view messages.</Empty></Page>;
  const d = await q<any>(`query($id: ID!) { messageThread(where: { id: $id }) { id customer { id displayName } shop { id } repairOrder { id roNumber } messages(orderBy: { at: asc }) { at direction channel body purpose } calls(orderBy: { at: asc }) { at direction outcome note } } }`, { id }).catch(() => null);
  const t = d?.messageThread;
  if (!t) notFound();
  const tz = await orgTimeZone();
  const items: Item[] = [
    ...t.messages.map((m: any) => ({ at: m.at, kind: 'message' as const, direction: m.direction, text: m.body, how: m.channel === 'sms' ? 'Text message' : 'Email' })),
    ...t.calls.map((c: any) => ({ at: c.at, kind: 'call' as const, direction: c.direction, text: c.note, how: `Call, ${label(c.outcome)}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Page title={t.customer?.displayName ?? 'Conversation'} crumbs={[{ label: 'Messages', href: '/dashboard/platform/messages' }]}>
      <Section title={t.repairOrder ? `Repair order ${t.repairOrder.roNumber}` : 'General'}>
        {items.length ? items.map((i, n) => (
          <Row key={n}><div className="min-w-0 space-y-1"><Meta>{i.direction === 'inbound' ? 'From the customer' : 'From the shop'} · {i.how} · {when(i.at, tz)}</Meta>{i.text ? <div className="break-words text-sm">{i.text}</div> : null}</div></Row>
        )) : <Empty>Nothing logged yet.</Empty>}
      </Section>
      {can.canMessageCustomers || can.canManageCustomers ? (
        <>
          <Section title="Write down a call"><LogCallForm customerId={t.customer.id} repairOrderId={t.repairOrder?.id} shopId={t.shop?.id} /></Section>
          <Section title="Write down a text or email"><LogMessageForm customerId={t.customer.id} repairOrderId={t.repairOrder?.id} shopId={t.shop?.id} /></Section>
        </>
      ) : null}
    </Page>
  );
}
