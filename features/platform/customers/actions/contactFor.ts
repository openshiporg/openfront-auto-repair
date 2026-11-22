'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

type Row = { kind: string; value: string | null; status: string; consents: { channel: string; purpose: string; action: string }[] };

/**
 * Where to send a customer their page link: the first active email and mobile number whose latest
 * service-message decision is not a withdrawal. Values come back only to roles allowed to read
 * contact details (the field's own access rule); anyone else gets nothing and types the address.
 */
export async function contactFor(customerId: string): Promise<{ email: string | null; mobile: string | null }> {
  const res = await keystoneClient<{ customer: { contacts: Row[] } | null }>(`query($id: ID!) {
    customer(where: { id: $id }) { contacts(where: { status: { equals: "active" } }, orderBy: [{ isPrimary: desc }, { createdAt: asc }]) { kind value status consents(orderBy: { at: desc }) { channel purpose action } } }
  }`, { id: customerId });
  const rows = res.success ? res.data.customer?.contacts ?? [] : [];
  const allowed = (r: Row, channel: string) => r.consents.find(c => c.channel === channel && (c.purpose === 'transactional' || c.purpose === 'all'))?.action !== 'revoked';
  return {
    email: rows.find(r => r.kind === 'email' && r.value && allowed(r, 'email'))?.value ?? null,
    mobile: rows.find(r => r.kind === 'mobile' && r.value && allowed(r, 'sms'))?.value ?? null,
  };
}
