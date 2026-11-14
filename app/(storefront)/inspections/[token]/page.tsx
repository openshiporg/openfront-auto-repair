import { InspectionPage } from '@/features/storefront/screens/LinkPages'

export const metadata = { title: 'Your inspection', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <InspectionPage token={(await params).token} />
}
