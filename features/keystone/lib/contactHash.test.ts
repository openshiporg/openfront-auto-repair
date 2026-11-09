import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { keyedContactHash } from './canonical'
import { contactHash } from './customers'

/* Review r2 F2: the contact hash was an unsalted sha256("phone:" + E.164), reversible offline in seconds. */

const KEY_A = '07'.repeat(32), KEY_B = '08'.repeat(32)

describe('contact hash', () => {
  it('is keyed: not the bare sha256, versioned, and a different key gives a different value', () => {
    const bare = createHash('sha256').update('phone:+19165550142').digest('hex')
    const a = contactHash('mobile', '+19165550142', KEY_A)
    expect(a).toMatch(/^h1:[0-9a-f]{64}$/)
    expect(a).not.toContain(bare)
    expect(contactHash('mobile', '+19165550142', KEY_B)).not.toBe(a)
  })
  it('keeps the lookup namespaces: mobile and landline match, email does not', () => {
    expect(contactHash('mobile', '+19165550142', KEY_A)).toBe(contactHash('landline', '+19165550142', KEY_A))
    expect(contactHash('email', '+19165550142', KEY_A)).not.toBe(contactHash('mobile', '+19165550142', KEY_A))
  })
  it('refuses to hash without a server key', () => {
    expect(() => keyedContactHash('phone', '+19165550142', '')).toThrow(/AUTO_SECRET_KEY/)
  })
})
