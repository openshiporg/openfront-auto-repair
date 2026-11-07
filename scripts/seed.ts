/**
 * `npm run seed`: load Northgate Auto Group into the database named by DATABASE_URL, through the same
 * idempotent steps as the onboarding button. Safe to run twice: the second run creates nothing.
 * The actor is the system ("seed"), which is audited like any other actor.
 */
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { systemActor } from '../features/keystone/lib/actor'
import { command } from '../features/keystone/lib/command'
import { northgateSteps } from '../features/keystone/mutations/setup'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL for the target database.')
  const prisma = new PrismaClient({ log: [] })
  const actor = systemActor('seed')
  const run = `seed-${randomUUID()}`
  const totals: Record<string, number> = {}
  try {
    for (const step of northgateSteps(actor)) {
      const started = Date.now()
      const { value } = await command(prisma, { name: `setup.load_northgate.${step.name}`, actor, idempotencyKey: `${run}:${step.name}`, params: {} }, step.run)
      for (const [k, v] of Object.entries(value)) totals[k] = (totals[k] ?? 0) + v
      console.log(`${step.name.padEnd(16)} ${String(Date.now() - started).padStart(6)} ms  ${JSON.stringify(value)}`)
    }
    console.log('created', JSON.stringify(totals))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error)
  process.exit(1)
})
