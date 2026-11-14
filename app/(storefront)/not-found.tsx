import Link from 'next/link'
import { Page } from '@/features/storefront/components/Shell'

export default function NotFound() {
  return (
    <Page title="Page not found" narrow>
      <p className="text-[17px]">That page is not on this site. If you followed a link we sent, call the shop and we will send a new one.</p>
      <p className="mt-6 flex flex-wrap gap-3"><Link href="/book" className="sf-btn">Book a repair</Link><Link href="/check" className="sf-btn-line">Check my repair</Link></p>
    </Page>
  )
}
