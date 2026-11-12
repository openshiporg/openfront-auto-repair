import { describe, expect, it } from 'vitest'
import { digestToken } from './core'
import { resolveMcpAccessToken } from './session'

/* Fleet rule: a token whose app is bound to an agent never acts as the person who approved it, and a token with no binding gets no access. */

const TOKEN = 'mcp_at_example-token'
type Rec = Record<string, unknown>
function contextWith(opts: { token?: Rec; app?: Rec | null; agent?: Rec | null; grants?: Rec[] }) {
  const token = { id: 't1', tokenType: 'access_token', isRevoked: 'false', userId: 'owner-user', clientId: 'c1', scopes: ['mcp:read'], expiresAt: new Date(Date.now() + 60_000), token: digestToken(TOKEN), ...opts.token }
  const app = opts.app === undefined ? { id: 'app1', clientId: 'c1', status: 'active' } : opts.app
  return { sudo: () => ({ db: {
    OAuthToken: { findOne: async () => token },
    OAuthApp: { findOne: async () => app },
    AgentIdentity: { findMany: async () => (opts.agent ? [opts.agent] : []) },
    AgentToolGrant: { findMany: async () => opts.grants ?? [] },
  } }) }
}

describe('resolveMcpAccessToken', () => {
  it("lets a person use their own connection to an app no agent is bound to", async () => {
    expect((await resolveMcpAccessToken(contextWith({}), TOKEN))?.itemId).toBe('owner-user')
  })
  it('gives no access when the app is bound to a paused or retired assistant', async () => {
    expect(await resolveMcpAccessToken(contextWith({ agent: { id: 'agent1', status: 'active', paused: true } }), TOKEN)).toBeUndefined()
    expect(await resolveMcpAccessToken(contextWith({ agent: { id: 'agent1', status: 'retired', paused: false } }), TOKEN)).toBeUndefined()
  })
  it('marks an active assistant\'s session with its id and only its active grants', async () => {
    const session = await resolveMcpAccessToken(contextWith({ agent: { id: 'agent1', status: 'active', paused: false }, grants: [{ scope: 'ro.read' }] }), TOKEN)
    expect(session?.mcp.agentId).toBe('agent1')
    expect(session?.mcp.agentScopes).toEqual(['ro.read'])
  })
  it('refuses revoked, expired, unknown and suspended-app tokens', async () => {
    expect(await resolveMcpAccessToken(contextWith({ token: { isRevoked: 'true' } }), TOKEN)).toBeUndefined()
    expect(await resolveMcpAccessToken(contextWith({ token: { expiresAt: new Date(Date.now() - 1) } }), TOKEN)).toBeUndefined()
    expect(await resolveMcpAccessToken(contextWith({ token: { userId: null } }), TOKEN)).toBeUndefined()
    expect(await resolveMcpAccessToken(contextWith({ app: null }), TOKEN)).toBeUndefined()
    expect(await resolveMcpAccessToken(contextWith({ app: { id: 'app1', clientId: 'c1', status: 'suspended' } }), TOKEN)).toBeUndefined()
  })
})
