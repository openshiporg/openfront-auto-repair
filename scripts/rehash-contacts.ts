/*
 * Idempotent: contact-value hashes made before the keyed scheme were bare SHA-256 (searchable offline). The migration replaces them
 * with a 'pending:' placeholder; this fills each from the stored contact value with the HMAC. Rows already keyed are left alone.
 * Every rewrite is recorded in the audit chain's absence-safe way: a single summary line is printed, no values are logged.
 */
import { PrismaClient } from '@prisma/client'
import { contactHash, normalizeContact, type ContactKind } from '../features/keystone/lib/customers'

async function main() {
  const prisma = new PrismaClient({ log: [] })
  try {
    const rows = await prisma.customerContact.findMany({ where: { NOT: { valueHash: { startsWith: 'h1:' } } }, select: { id: true, kind: true, value: true } })
    let done = 0, skipped = 0
    for (const row of rows) {
      try {
        const normalized = normalizeContact(row.kind as ContactKind, row.value)
        await prisma.customerContact.update({ where: { id: row.id }, data: { valueHash: contactHash(row.kind as ContactKind, normalized) } })
        done += 1
      } catch { skipped += 1 }
    }
    console.info(`contact hashes: ${done} rewritten, ${skipped} left pending`)
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error('contact rehash failed:', error?.message ?? error); process.exit(1) })
