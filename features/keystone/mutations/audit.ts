import { actorFromSession, requirePermission } from '../lib/actor'
import { verifyAuditChain as verify } from '../lib/audit'
import { canSeeCost } from '../security/costRedaction'

/**
 * Recompute the whole audit hash chain on the server. A reader without canSeeCost gets the verdict (intact or broken, how many
 * events, where it breaks) without the head hash: a hash over a row that holds cost is a brute-force oracle for it (review r5 R5-1).
 */
export async function verifyAuditChain(_root: unknown, _args: unknown, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canReadAudit')
  const result = await verify(context.prisma)
  return canSeeCost(context) ? result : { ...result, lastHash: null }
}
