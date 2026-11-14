import { ServicePage } from '@/features/storefront/screens/InfoPages'
import { getStorefront } from '@/features/storefront/lib/data'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const service = (await getStorefront())?.services.find(s => s.slug === slug)
  return { title: service?.name ?? 'Service' }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <ServicePage slug={(await params).slug} />
}
