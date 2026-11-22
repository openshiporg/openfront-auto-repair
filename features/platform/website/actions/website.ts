'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

type Done = { ok: true } | { ok: false; error: string };

/** "89" or "89.50" → "8950"; whole cents, never through a float. */
function toMinor(text: string): string | null {
  const m = text.trim().replace(/[$,]/g, '').match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  return m ? String(BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0') || '0')) : null;
}

/** "1.5" hours → 150 hundredths of an hour. */
function toCenti(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})(?:\.(\d{1,2}))?$/);
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0') : null;
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

function refresh() {
  revalidatePath('/dashboard/platform/website');
  for (const p of ['/', '/services', '/prices', '/book', '/about']) revalidatePath(p);
}

export type ServiceInput = { id?: string; shopId: string; name: string; description: string; price: string; hours: string; bookable: boolean; isPublished: boolean; sortOrder?: number };

/** One line of the public price list. Staff with the policy permission write it; the server checks that again. */
export async function saveService(input: ServiceInput): Promise<Done> {
  const name = clean(input.name, 80);
  if (name.length < 3) return { ok: false, error: 'Give the service a name customers will recognise.' };
  const slug = slugOf(name);
  if (!slug) return { ok: false, error: 'The name needs at least one letter or number.' };
  const priceText = clean(input.price, 20);
  const price = priceText === '' ? null : toMinor(priceText);
  if (priceText !== '' && price === null) return { ok: false, error: 'Write the price in dollars, for example 89 or 89.50. Leave it blank to show “Request an estimate”.' };
  const hoursText = clean(input.hours, 10);
  const hours = hoursText === '' ? null : toCenti(hoursText);
  if (hoursText !== '' && (hours === null || hours > 4000)) return { ok: false, error: 'Write the time in hours, for example 1 or 1.5.' };
  if (!input.shopId) return { ok: false, error: 'Choose the shop.' };

  const same = await keystoneClient<{ publishedServices: { id: string }[] }>(
    `query($slug: String!, $shop: ID!) { publishedServices(where: { slug: { equals: $slug }, shop: { id: { equals: $shop } } }, take: 2) { id } }`,
    { slug, shop: input.shopId },
  );
  if (!same.success) return { ok: false, error: same.error || 'Could not check the price list.' };
  if (same.data?.publishedServices.some(s => s.id !== input.id)) return { ok: false, error: 'This shop already lists a service with that name.' };

  const data: Record<string, unknown> = {
    name, slug, description: clean(input.description, 600), fromPriceMinor: price, estimatedCentiHours: hours,
    bookable: Boolean(input.bookable), isPublished: Boolean(input.isPublished),
    ...(typeof input.sortOrder === 'number' ? { sortOrder: input.sortOrder } : {}),
  };
  const res = input.id
    ? await keystoneClient(`mutation($id: ID!, $data: PublishedServiceUpdateInput!) { updatePublishedService(where: { id: $id }, data: $data) { id } }`, { id: input.id, data })
    : await keystoneClient(`mutation($data: PublishedServiceCreateInput!) { createPublishedService(data: $data) { id } }`, { data: { ...data, shop: { connect: { id: input.shopId } } } });
  if (!res.success) return { ok: false, error: res.error || 'The service was not saved.' };
  refresh();
  return { ok: true };
}

export type ShopDetailsInput = { shopId: string; tagline: string; about: string; barArd: string; isPublished: boolean };

/** What the public site says about one shop. The other registration numbers and profile keys are kept as they are. */
export async function saveShopDetails(input: ShopDetailsInput): Promise<Done> {
  const now = await keystoneClient<{ shop: { registrations: Record<string, unknown> | null; publicProfile: Record<string, unknown> | null } | null }>(
    `query($id: ID!) { shop(where: { id: $id }) { registrations publicProfile } }`, { id: input.shopId },
  );
  if (!now.success || !now.data?.shop) return { ok: false, error: now.error || 'Shop not found.' };
  const registrations = { ...(now.data.shop.registrations ?? {}), barArd: clean(input.barArd, 40) };
  const publicProfile = { ...(now.data.shop.publicProfile ?? {}), tagline: clean(input.tagline, 140), about: clean(input.about, 1200) };
  const res = await keystoneClient(
    `mutation($id: ID!, $data: ShopUpdateInput!) { updateShop(where: { id: $id }, data: $data) { id } }`,
    { id: input.shopId, data: { registrations, publicProfile, isPublished: Boolean(input.isPublished) } },
  );
  if (!res.success) return { ok: false, error: res.error || 'The shop details were not saved.' };
  refresh();
  return { ok: true };
}
