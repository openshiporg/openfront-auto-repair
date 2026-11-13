import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Tx } from './db'

/** Small secrets (provider credentials) sealed with AUTO_SECRET_KEY, kept in SecretBox. Never a column of a business list. */
const secret = () => {
  const hex = process.env.AUTO_SECRET_KEY ?? ''
  if (!hex) throw new Error('AUTO_SECRET_KEY is not set.')
  return Buffer.from(hex.length === 64 ? hex : Buffer.from(hex).toString('hex').padEnd(64, '0').slice(0, 64), 'hex')
}

export async function putSecret(tx: Tx, key: string, value: string, now: Date) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', secret(), iv)
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const sealed = { ciphertext: body.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }
  await tx.secretBox.upsert({ where: { key }, create: { key, ...sealed, keyVersion: 1 }, update: { ...sealed, rotatedAt: now } })
}

export async function getSecret(tx: Tx, key: string): Promise<string | null> {
  const row = await tx.secretBox.findUnique({ where: { key } })
  if (!row?.ciphertext) return null
  try {
    const d = createDecipheriv('aes-256-gcm', secret(), Buffer.from(row.iv, 'base64'))
    d.setAuthTag(Buffer.from(row.authTag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(row.ciphertext, 'base64')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
