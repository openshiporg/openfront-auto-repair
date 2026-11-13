import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Tx } from './db'
import { Codes, DomainError } from './errors'

/*
 * The shop owner's own model key (owner rule: this build never buys or sets a key). The key is typed in under
 * Settings, kept encrypted in SecretBox, and is the only way an `llm` adapter ever runs. Without one, every AI
 * surface says "No AI provider connected" and the manual path does the same job with the same proposals.
 */

export const PROVIDER_KEY = 'ai.provider'
const secret = () => {
  const hex = process.env.AUTO_SECRET_KEY ?? ''
  if (!hex) throw new Error('AUTO_SECRET_KEY is not set.')
  return Buffer.from(hex.length === 64 ? hex : Buffer.from(hex).toString('hex').padEnd(64, '0').slice(0, 64), 'hex')
}

export type ProviderConfig = { baseUrl: string; model: string; apiKey: string }

export function sealProvider(config: ProviderConfig) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()])
  return { ciphertext: body.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }
}

export async function loadProvider(tx: Tx): Promise<ProviderConfig | null> {
  const row = await tx.secretBox.findUnique({ where: { key: PROVIDER_KEY } })
  if (!row?.ciphertext) return null
  try {
    const d = createDecipheriv('aes-256-gcm', secret(), Buffer.from(row.iv, 'base64'))
    d.setAuthTag(Buffer.from(row.authTag, 'base64'))
    return JSON.parse(Buffer.concat([d.update(Buffer.from(row.ciphertext, 'base64')), d.final()]).toString('utf8')) as ProviderConfig
  } catch {
    return null
  }
}

export const providerConnected = async (tx: Tx) => Boolean(await loadProvider(tx))
export const NO_PROVIDER = 'No AI provider connected'

export function requireProvider(config: ProviderConfig | null): ProviderConfig {
  if (!config) throw new DomainError(Codes.NO_AI_PROVIDER, `${NO_PROVIDER}. Add your own key under Agents to use this, or enter it by hand.`)
  return config
}

/** What an adapter returns: free text from outside is data, never instructions. */
export type Suggestion<T> = { adapter: 'manual' | 'llm'; value: T }

export interface Completion { complete(system: string, user: string): Promise<string> }

/** The owner's provider, called only inside a request a person started. OpenAI-compatible chat completions. */
export function llmCompletion(config: ProviderConfig, fetcher: typeof fetch = fetch): Completion {
  return {
    async complete(system, user) {
      const res = await fetcher(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({ model: config.model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(25_000),
      })
      if (!res.ok) throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'The AI provider did not answer. Try again, or enter it by hand.')
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      return json.choices?.[0]?.message?.content ?? ''
    },
  }
}

/** Text from outside the shop is wrapped so a model sees it as quoted data. */
export const untrusted = (text: string) => ({ untrusted: String(text ?? '').slice(0, 4000) })

/** Pulls a JSON object out of a model reply; anything else is an error to show, never executed. */
export function parseJsonReply<T>(reply: string): T {
  const start = reply.indexOf('{'); const end = reply.lastIndexOf('}')
  if (start < 0 || end < start) throw new DomainError(Codes.INVALID_INPUT, 'The assistant did not return something usable. Enter it by hand.')
  try { return JSON.parse(reply.slice(start, end + 1)) as T } catch { throw new DomainError(Codes.INVALID_INPUT, 'The assistant did not return something usable. Enter it by hand.') }
}
