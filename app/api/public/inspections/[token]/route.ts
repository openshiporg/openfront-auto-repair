import { keystoneContext } from '@/features/keystone/context'
import { getInspection } from '@/features/keystone/public/handlers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return getInspection(keystoneContext.sudo().prisma, request, (await params).token)
}
