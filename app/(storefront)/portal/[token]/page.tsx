import { PortalPage } from '@/features/storefront/screens/LinkPages'

export const metadata = { title: 'My vehicles and repairs', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <PortalPage token={(await params).token} />
}
