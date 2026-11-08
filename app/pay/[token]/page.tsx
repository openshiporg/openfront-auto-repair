import PayPage from '@/features/platform/billing/screens/PayPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pay your invoice', robots: { index: false, follow: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; canceled?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  return <PayPage token={token} returned={sp.paid ? 'paid' : sp.canceled ? 'canceled' : ''} />;
}
