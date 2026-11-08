import { isSignedIn, permissionNames, type Permission, type Session } from '../access'
import { DomainError, Codes } from './errors'
import { mcpSessionMarker } from '../mcp-oauth/session'

/**
 * Who is acting. A user acts with their role's permissions. An agent acts only within its active
 * tool grants and can never approve anything (maker-checker, D§8).
 */
export type Actor =
  | { kind: 'user'; userId: string; name?: string; permissions: ReadonlySet<Permission>; channel?: 'web' | 'mcp' }
  | { kind: 'agent'; agentId: string; ownerUserId: string | null; name?: string; scopes: ReadonlySet<string> }
  | { kind: 'system'; name: string }

export function actorFromSession(session: Session | null | undefined): Actor {
  if (!session || !isSignedIn({ session })) throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in to continue.')
  const role = session.data.role
  const granted = new Set<Permission>(role ? permissionNames.filter(name => role[name] === true) : [])
  // An MCP token acts for the user who approved it, but it is a machine at the keyboard: it is
  // treated as an agent for everything only a person may do (I-A3, I-R3).
  const channel = mcpSessionMarker(session) ? 'mcp' : 'web'
  return { kind: 'user', userId: session.itemId, name: session.data.name, permissions: granted, channel }
}

/** True when a machine is acting: an agent, or a user's session driven through an MCP token. */
export const isMachine = (actor: Actor) => actor.kind === 'agent' || (actor.kind === 'user' && actor.channel === 'mcp')

/** The database's view of who acts (app.actor_kind): MCP-driven user sessions count as agents. */
export const dbActorKind = (actor: Actor): 'user' | 'agent' | 'system' => (isMachine(actor) ? 'agent' : actor.kind)

/** Only a person may record a customer's authorization or decision, approve, or publish. */
export function requireHuman(actor: Actor, action: string) {
  if (isMachine(actor)) throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, `Only a person can ${action}. An assistant can draft it or create a callback task for staff.`)
}

export const systemActor = (name: string): Actor => ({ kind: 'system', name })

export function can(actor: Actor, permission: Permission) {
  return actor.kind === 'user' && actor.permissions.has(permission)
}

export function requirePermission(actor: Actor, ...anyOf: Permission[]) {
  if (actor.kind === 'system') return
  if (actor.kind === 'agent') throw new DomainError(Codes.NOT_AUTHORIZED, 'Agents act only through their tool grants.')
  if (!anyOf.some(permission => actor.permissions.has(permission))) {
    throw new DomainError(Codes.NOT_AUTHORIZED, `This needs the ${anyOf.join(' or ')} permission.`)
  }
}

export function requireScope(actor: Actor, scope: string) {
  if (actor.kind !== 'agent') return
  if (!actor.scopes.has(scope)) throw new DomainError(Codes.NOT_AUTHORIZED, `The agent has no active ${scope} grant.`)
}

/** Stable identity for idempotency receipts: one key can't be replayed by another principal. */
export const principalKey = (actor: Actor) =>
  actor.kind === 'user' ? `user:${actor.userId}` : actor.kind === 'agent' ? `agent:${actor.agentId}` : `system:${actor.name}`

export const actorUserId = (actor: Actor) => (actor.kind === 'user' ? actor.userId : null)
export const actorAgentId = (actor: Actor) => (actor.kind === 'agent' ? actor.agentId : null)
