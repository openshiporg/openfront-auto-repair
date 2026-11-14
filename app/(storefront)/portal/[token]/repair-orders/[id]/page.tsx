import { PortalPage } from '@/features/storefront/screens/LinkPages'

export const metadata = { title: 'Repair order', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default async function Page({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params
  return <PortalPage token={token} repairOrderId={id} />
}
