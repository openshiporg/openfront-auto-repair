import { keystoneContext } from '@/features/keystone/context'
import { getAuthorization, postAuthorization } from '@/features/keystone/public/handlers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ token: string }> }

export async function GET(request: Request, { params }: Params) {
  return getAuthorization(keystoneContext.sudo().prisma, request, (await params).token)
}

export async function POST(request: Request, { params }: Params) {
  return postAuthorization(keystoneContext.sudo().prisma, request, (await params).token)
}
