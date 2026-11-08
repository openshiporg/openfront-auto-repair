import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { DomainError, Codes } from './errors'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Customer links (SCHEMA §17 PublicAccessToken, SM§5.1). The token is derived from a server secret and
 * the row id (HMAC), and only a second keyed hash of it is stored: nothing in the database, the
 * audit log or a command receipt can rebuild a working link, yet staff can re-show a link they
 * created by deriving it again. Tokens carry their purpose: an inspection token is useless at
 * the authorization endpoint.
 */

export type TokenPurpose = 'authorization' | 'inspection' | 'invoice_pay' | 'portal_magic_link' | 'fleet_magic_link'

const DEV_KEY = 'openfront-auto-repair-development-public-token-key'
function key() {
  const configured = process.env.PUBLIC_TOKEN_SECRET || process.env.SESSION_SECRET
  if (configured && configured.length >= 32) return configured
  // A guessable key would make every customer link forgeable; production refuses to run without one.
  if (process.env.NODE_ENV === 'production') throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'Customer links are not configured on this server.')
  return DEV_KEY
}
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export const hashToken = (purpose: TokenPurpose, token: string) => createHmac('sha256', key()).update(`${purpose}\0${token}`, 'utf8').digest('hex')
/** The link token for a row: 32 bytes of HMAC, base64url (43 characters). */
export const deriveToken = (purpose: TokenPurpose, id: string) => createHmac('sha256', key()).update(`token\0${purpose}\0${id}`, 'utf8').digest('base64url')
export const newTokenId = () => randomUUID()
export const isTokenShape = (token: unknown): token is string => typeof token === 'string' && TOKEN.test(token)

export async function createAccessToken(uow: UnitOfWork, input: { purpose: TokenPurpose; subjectType: string; subjectId: string; shopId: string; ttlHours: number; maxUses?: number }) {
  const id = newTokenId()
  const token = deriveToken(input.purpose, id)
  const ttl = Math.min(720, Math.max(1, Math.trunc(input.ttlHours)))
  const expiresAt = new Date(uow.now.getTime() + ttl * 3_600_000)
  const tokenHash = hashToken(input.purpose, token)
  await uow.tx.publicAccessToken.create({ data: { id, purpose: input.purpose, subjectType: input.subjectType, subjectId: input.subjectId, shopId: input.shopId, tokenHash, expiresAt, maxUses: input.maxUses ?? 50 } })
  return { id, token, tokenHash, expiresAt }
}

/** Look a token up for a purpose. Constant-time compare on the stored hash; expired, revoked or exhausted tokens fail. */
export async function resolveAccessToken(tx: Tx, purpose: TokenPurpose, token: unknown, now: Date, options: { consume?: boolean } = {}) {
  if (!isTokenShape(token)) throw new DomainError(Codes.TOKEN_INVALID, 'This link is not valid.')
  const tokenHash = hashToken(purpose, token)
  const row = await tx.publicAccessToken.findUnique({ where: { tokenHash } })
  if (!row || row.purpose !== purpose || !timingSafeEqual(Buffer.from(row.tokenHash, 'hex'), Buffer.from(tokenHash, 'hex'))) throw new DomainError(Codes.TOKEN_INVALID, 'This link is not valid.')
  if (row.revokedAt) throw new DomainError(Codes.TOKEN_INVALID, 'This link has been replaced. Use the newest link the shop sent.')
  if (row.expiresAt.getTime() <= now.getTime()) throw new DomainError(Codes.TOKEN_EXPIRED, 'This link has expired. Ask the shop to send a new one.')
  if ((row.useCount ?? 0) >= (row.maxUses ?? 50)) throw new DomainError(Codes.TOKEN_EXPIRED, 'This link has been used too many times. Ask the shop for a new one.')
  if (options.consume !== false) await tx.publicAccessToken.update({ where: { id: row.id }, data: { useCount: { increment: 1 }, usedAt: row.usedAt ?? now } })
  return row
}

export async function revokeTokensFor(tx: Tx, subjectType: string, subjectId: string, now: Date) {
  await tx.publicAccessToken.updateMany({ where: { subjectType, subjectId, revokedAt: null }, data: { revokedAt: now } })
}
