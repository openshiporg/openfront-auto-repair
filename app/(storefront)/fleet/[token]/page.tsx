import { FleetAccountPage } from '@/features/storefront/screens/LinkPages'

export const metadata = { title: 'Fleet account', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; cancelled?: string; canceled?: string }> }) {
  const sp = await searchParams
  return <FleetAccountPage token={(await params).token} returned={sp.paid ? 'paid' : sp.cancelled || sp.canceled ? 'cancelled' : ''} />
}
