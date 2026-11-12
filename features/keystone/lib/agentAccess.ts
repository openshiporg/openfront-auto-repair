import { permissionNames, type Permission } from '../access'
import { AGENT_SCOPES, SCOPE_PERMISSIONS, type AgentScope } from '../agents/constants'
import type { Actor } from './actor'
import { Codes, DomainError } from './errors'
import type { Tx } from './db'

/*
 * An agent never has more than the person it works for (I-A1): its permissions are the invoking user's
 * permissions intersected with what its active grants allow. A paused or retired agent can't even read.
 */

const SCOPE_SET = new Set<string>(AGENT_SCOPES)

/** The permissions an agent may use: those the user holds AND some active grant covers. Pure. */
export function effectivePermissions(userPermissions: Iterable<Permission>, grantedScopes: Iterable<string>): Set<Permission> {
  const mine = new Set(userPermissions)
  const covered = new Set<string>()
  for (const scope of grantedScopes) if (SCOPE_SET.has(scope)) for (const p of SCOPE_PERMISSIONS[scope as AgentScope]) covered.add(p)
  return new Set(permissionNames.filter(p => mine.has(p) && covered.has(p)))
}

export type AgentState = { id: string; name: string; status: string; paused: boolean; ownerUserId: string | null; scopes: Set<string>; shopIds: string[] }

/** Load an agent with its active grants. */
export async function loadAgent(tx: Tx, agentId: string): Promise<AgentState> {
  const agent = await tx.agentIdentity.findUnique({ where: { id: String(agentId ?? '') }, select: { id: true, name: true, status: true, paused: true, ownerId: true, shops: { select: { id: true } }, grants: { where: { status: 'active' }, select: { scope: true } } } })
  if (!agent) throw new DomainError(Codes.NOT_FOUND, 'Assistant not found.')
  return { id: agent.id, name: agent.name, status: agent.status, paused: agent.paused, ownerUserId: agent.ownerId, scopes: new Set(agent.grants.map(g => g.scope)), shopIds: agent.shops.map(s => s.id) }
}

/** Paused or retired agents do nothing, reads included. */
export function assertAgentActive(agent: AgentState) {
  if (agent.paused || agent.status !== 'active') throw new DomainError(Codes.AGENT_PAUSED, `${agent.name} is ${agent.paused ? 'paused' : 'retired'}. Resume it to continue.`)
}

export const agentActor = (agent: AgentState): Actor => ({ kind: 'agent', agentId: agent.id, ownerUserId: agent.ownerUserId, name: agent.name, scopes: agent.scopes })

/** Throws unless the agent holds an active grant for the scope AND the invoking user holds a permission that covers it. */
export function assertAllowed(agent: AgentState, user: Extract<Actor, { kind: 'user' }>, scope: AgentScope, toolPermissions: readonly Permission[]) {
  assertAgentActive(agent)
  if (!agent.scopes.has(scope)) throw new DomainError(Codes.NOT_AUTHORIZED, `${agent.name} has no grant for that. Ask an owner to grant it.`, { field: scope })
  const effective = effectivePermissions(user.permissions, agent.scopes)
  if (toolPermissions.length && !toolPermissions.some(p => effective.has(p))) throw new DomainError(Codes.NOT_AUTHORIZED, `You and ${agent.name} together don't have what this needs (${toolPermissions.join(' or ')}).`)
}
