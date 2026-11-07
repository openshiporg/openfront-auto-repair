import { actorFromSession, requirePermission } from '../lib/actor'
import { command } from '../lib/command'
import { seedOrgPlatform } from '../seed/platform'

/** Onboarding: load the Northgate Auto Group spine. Idempotent per key and per record. */
export async function loadNorthgateSetup(_root: unknown, args: { idempotencyKey: string }, context: any) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canManageOnboarding')
  const result = await command(context.prisma, { name: 'setup.load_northgate', actor, idempotencyKey: args.idempotencyKey, params: {} }, uow => seedOrgPlatform(uow, actor))
  return { replay: result.replay, created: result.value }
}
