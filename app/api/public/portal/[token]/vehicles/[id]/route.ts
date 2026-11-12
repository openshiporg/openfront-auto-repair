import { keystoneContext } from '@/features/keystone/context'
import { getPortal } from '@/features/keystone/public/handlers'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params
  return getPortal(keystoneContext.sudo().prisma, request, token, { vehicleId: id })
}
