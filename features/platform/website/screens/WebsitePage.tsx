import Link from 'next/link';
import { q, holds } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Row, Empty, Meta, Section } from '../../components/ui';
import { ServiceForm, ShopDetailsForm } from './WebsiteForms';

type Service = { id: string; name: string; slug: string; description: string; fromPriceMinor: string | null; estimatedCentiHours: number | null; bookable: boolean; isPublished: boolean; shop: { id: string } | null };
type Shop = { id: string; name: string; isPublished: boolean; registrations: Record<string, unknown> | null; publicProfile: Record<string, unknown> | null };

const dollars = (minor: string | null) => { if (minor === null || !/^\d+$/.test(minor)) return ''; const p = minor.padStart(3, '0'); return `${p.slice(0, -2)}.${p.slice(-2)}`; };
const hours = (centi: number | null) => (centi && centi > 0 ? String(centi / 100) : '');
const text = (v: unknown) => (typeof v === 'string' ? v : '');

/** The customer website: which shops it shows, what it says about them, and the price list. */
export default async function WebsitePage() {
  const held = await holds(['canManagePolicies', 'canManageShops']);
  if (!held.canManagePolicies && !held.canManageShops) return <Page title="Website"><Empty>Your role is not allowed to change the website. Ask a manager.</Empty></Page>;
  const [d] = await Promise.all([
    q<{ shops: Shop[]; publishedServices: Service[]; cannedJobs: { name: string; currentVersion: { customerDescription: string } | null }[] }>(`{
      shops(where: { status: { equals: "active" } }, orderBy: { code: asc }) { id name isPublished registrations publicProfile }
      publishedServices(orderBy: [{ sortOrder: asc }, { name: asc }], take: 200) { id name slug description fromPriceMinor estimatedCentiHours bookable isPublished shop { id } }
      cannedJobs(where: { active: { equals: true } }, orderBy: { name: asc }, take: 200) { name currentVersion { customerDescription } }
    }`),
  ]);
  const templates = d.cannedJobs.filter(j => j.currentVersion).map(j => ({ name: j.name, description: j.currentVersion?.customerDescription ?? '' }));
  const anyPublished = d.shops.some(s => s.isPublished);

  return (
    <Page title="Website">
      <p className="max-w-2xl text-sm text-muted-foreground">
        What customers see at <Link className="underline" href="/" target="_blank">your website</Link>: your shops, your services and their prices. Changes show there as soon as you save.
        {anyPublished ? '' : ' No shop is marked to show yet, so the website shows every active shop.'}
      </p>
      {d.shops.length ? d.shops.map(shop => {
        const services = d.publishedServices.filter(s => s.shop?.id === shop.id);
        const live = services.filter(s => s.isPublished).length;
        return (
          <div key={shop.id} className="space-y-6">
            <Section title={`${shop.name}: about the shop`}>
              {held.canManageShops ? (
                <ShopDetailsForm shopId={shop.id} tagline={text(shop.publicProfile?.tagline)} about={text(shop.publicProfile?.about)} barArd={text(shop.registrations?.barArd)} isPublished={shop.isPublished} />
              ) : (
                <Row><Meta>{text(shop.publicProfile?.tagline) || 'No line under the shop name yet.'}</Meta><Meta>{shop.isPublished ? 'Shown on the website' : 'Not marked to show'}</Meta></Row>
              )}
            </Section>
            <Section title={`${shop.name}: services and prices`} aside={<Meta>{live} on the website</Meta>}>
              {services.length ? services.map(s => (
                <details key={s.id} className="border-b last:border-b-0">
                  <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
                    <span className="min-w-0 break-words font-medium">{s.name}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs">{s.fromPriceMinor === null ? 'Estimate' : `from ${money(s.fromPriceMinor)}`}</span>
                      <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{s.isPublished ? 'Shown' : 'Hidden'}</span>
                    </span>
                  </summary>
                  {held.canManagePolicies ? (
                    <div className="pb-4 pt-1"><ServiceForm shopId={shop.id} service={{ id: s.id, name: s.name, description: s.description, price: dollars(s.fromPriceMinor), hours: hours(s.estimatedCentiHours), bookable: s.bookable, isPublished: s.isPublished }} /></div>
                  ) : <p className="pb-3 text-sm text-muted-foreground">{s.description || 'No description.'}</p>}
                </details>
              )) : <Empty>No prices on the website yet. Until you add one, customers see your canned jobs with “Request an estimate”.</Empty>}
              {held.canManagePolicies ? (
                <div className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-medium">Add a service</h3>
                  <ServiceForm key={services.length} shopId={shop.id} templates={templates.filter(t => !services.some(s => s.name === t.name))} />
                </div>
              ) : null}
            </Section>
          </div>
        );
      }) : <Empty>No shops yet. Add your first shop under Shops.</Empty>}
    </Page>
  );
}
