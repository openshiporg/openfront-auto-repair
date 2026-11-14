import type { Metadata } from 'next'
import { Noto_Sans, Share_Tech_Mono, Tektur } from 'next/font/google'
import '@/features/storefront/storefront.css'
import { Footer, Header } from '@/features/storefront/components/Shell'
import { getStorefront } from '@/features/storefront/lib/data'

const display = Tektur({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sf-display', display: 'swap' })
const body = Noto_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-sf-body', display: 'swap' })
const mono = Share_Tech_Mono({ subsets: ['latin'], weight: '400', variable: '--font-sf-mono', display: 'swap' })

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStorefront()
  if (!store) return {}
  const { shop } = store
  return {
    title: { default: `${shop.name}: auto repair in ${shop.city}`, template: `%s · ${shop.name}` },
    description: `Book a repair at ${shop.name}, ${shop.addressLine1}, ${shop.cityLine}. Digital inspections, written estimates you approve job by job${store.warranty ? `, ${store.warranty} warranty` : ''}.`,
  }
}

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const store = await getStorefront()
  return (
    <div className={`sf ${display.variable} ${body.variable} ${mono.variable}`}>
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-black focus:px-3 focus:py-2">Skip to the content</a>
      {store ? <Header store={store} /> : null}
      <div id="content">{children}</div>
      {store ? <Footer store={store} /> : null}
    </div>
  )
}
