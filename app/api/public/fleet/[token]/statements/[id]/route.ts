import { keystoneContext } from '@/features/keystone/context'
import { getFleetStatement } from '@/features/keystone/public/handlers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string; id: string }> }

export async function GET(request: Request, { params }: Params) {
  const { token, id } = await params
  return getFleetStatement(keystoneContext.sudo().prisma, request, token, id)
}
