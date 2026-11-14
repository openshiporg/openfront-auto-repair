import BookPage from '@/features/storefront/screens/BookPage'

export const metadata = { title: 'Book a repair' }

export default async function Page({ searchParams }: { searchParams: Promise<{ vehicle?: string; service?: string; kind?: string; at?: string }> }) {
  return <BookPage query={await searchParams} />
}
