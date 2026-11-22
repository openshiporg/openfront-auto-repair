import { notFound } from 'next/navigation'

/** Any address the site does not have: answer 404 inside the shop's own header and footer. */
export default function UnknownPage() {
  notFound()
}
