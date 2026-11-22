import { redirect } from 'next/navigation'
import { BookForm } from '../components/BookForm'
import { Page } from '../components/Shell'
import { openDays } from '../lib/availability'
import { getStorefront, pickService } from '../lib/data'

export default async function BookPage({ query }: { query: { vehicle?: string; service?: string; kind?: string; at?: string } }) {
  const store = await getStorefront()
  if (!store) redirect('/dashboard')
  const service = pickService(store, query.service)
  const kind = query.kind === 'drop_off' ? 'drop_off' : 'waiter'
  const shop = store.shops.find(s => s.id === service?.shopId) ?? store.shop
  const days = await openDays({ shopId: shop.id, kind, centiHours: service?.centiHours ?? 100, days: 6 })

  return (
    <Page title="Book a repair" lead={`Schedule service at ${store.shop.name}. Pick an open time and we hold it for you.`} narrow>
      <BookForm
        shops={store.shops.map(s => ({ id: s.id, name: s.name, city: s.city, phone: s.phone }))}
        services={store.services.filter(s => s.bookable).map(s => ({ slug: s.slug, name: s.name, priceLine: s.priceLine, description: s.description, shopId: s.shopId }))}
        initial={{ vehicle: String(query.vehicle ?? '').slice(0, 120), service: service?.slug ?? '', kind, at: String(query.at ?? ''), shopId: shop.id }}
        initialDays={days}
      />
    </Page>
  )
}
