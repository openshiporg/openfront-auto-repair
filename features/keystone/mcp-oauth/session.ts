/**
 * MCP OAuth on the Keystone side: an `mcp_at_` bearer token becomes the session
 * of the user who approved it, exactly like that user's cookie.
 *
 * The wrapped strategy returns `{ itemId, listKey, mcp }`; createAuth's own
 * wrapper then loads `session.data` from `sessionData` the same way it does for
 * a cookie, so roles, filters and field access are unchanged. `mcp` only lets
 * the GraphQL guard narrow what the token may do.
 *
 * Plain module: safe to import from keystone.ts (no @/ imports).
 */
import { bearerToken, digestToken, isMcpAccessToken, storedScopes, type McpScope } from './core'

export type McpSessionMarker = {
  clientId: string
  scopes: McpScope[]
  tokenId: string
  /** Set when the app is bound to an assistant: it acts as that assistant, limited to its active grants. */
  agentId?: string
  agentScopes?: string[]
}

type Strategy = { get: (args: { context: any }) => Promise<any> }

/** The session for a valid MCP access token, or undefined (never a fallback). */
export async function resolveMcpAccessToken(context: any, token: string, listKey = 'User') {
  try {
    const sudo = context.sudo()
    const record = await sudo.db.OAuthToken.findOne({ where: { token: digestToken(token) } })
    if (
      !record ||
      record.tokenType !== 'access_token' ||
      record.isRevoked !== 'false' ||
      !record.userId ||
      !record.expiresAt ||
      new Date(record.expiresAt).getTime() <= Date.now()
    ) {
      return undefined
    }
    const app = await sudo.db.OAuthApp.findOne({ where: { clientId: record.clientId } })
    if (!app || app.status !== 'active') return undefined

    const mcp: McpSessionMarker = {
      clientId: record.clientId,
      scopes: storedScopes(record.scopes),
      tokenId: String(record.id),
    }
    // An app that is bound to an agent never acts as the person who approved it (a token with no matching binding gets no access).
    const bound = await sudo.db.AgentIdentity.findMany({ where: { oauthApp: { id: { equals: app.id } } }, take: 1 })
    if (bound[0]) {
      // Phase 8: the token acts as the assistant, for the person who approved it, with only what both allow (I-A1).
      // A paused or retired assistant gets nothing at all, reads included.
      const agent = bound[0]
      if (agent.paused === true || agent.status !== 'active') return undefined
      const grants = await sudo.db.AgentToolGrant.findMany({ where: { agent: { id: { equals: agent.id } }, status: { equals: 'active' } }, take: 50 })
      mcp.agentId = String(agent.id)
      mcp.agentScopes = (grants ?? []).map((g: { scope: string }) => String(g.scope))
    }
    return { itemId: String(record.userId), listKey, mcp }
  } catch {
    return undefined
  }
}

/**
 * Wrap a repo's existing session strategy. MCP tokens are recognised by prefix
 * and resolved here; every other request (cookies, Openship OAuth, API keys,
 * customer tokens) goes to the wrapped strategy unchanged.
 */
export function withMcpBearerSessions<S extends Strategy>(strategy: S, listKey = 'User'): S {
  return {
    ...strategy,
    async get({ context }: { context: any }) {
      const token = bearerToken(context?.req?.headers?.authorization)
      if (isMcpAccessToken(token)) return resolveMcpAccessToken(context, token, listKey)
      return strategy.get({ context })
    },
  }
}

export function mcpSessionMarker(session: unknown): McpSessionMarker | null {
  const marker = (session as { mcp?: McpSessionMarker } | null | undefined)?.mcp
  return marker && typeof marker.clientId === 'string' && Array.isArray(marker.scopes) ? marker : null
}
