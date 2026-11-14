import { EstimatePage } from '@/features/storefront/screens/LinkPages'

export const metadata = { title: 'Your estimate', robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <EstimatePage token={(await params).token} />
}
