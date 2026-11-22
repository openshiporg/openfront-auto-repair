import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hasTestDatabase, resetDatabase, testPrisma, uniqueKey } from '../../../tests/helpers/db'
import { permissionNames } from '../access'
import { shopLaw } from '../lib/policy'
import { readOwnShop, startOwnShop } from './setup'

const sessionFor = (id: string, granted: string[]) => ({
  itemId: id,
  data: { name: id, email: `${id}@test.local`, kind: 'staff', accessExpiresAt: null, role: { id: 'r', name: 'r', ...Object.fromEntries(permissionNames.map(p => [p, granted.includes(p)])) } },
})

const INPUT = { name: 'Valley Brake & Tire', code: 'vbt', addressLine1: '12 Main St', city: 'Fresno', region: 'ca', postalCode: '93721', phone: '(559) 555-0100', opens: '07:30', closes: '17:30', saturday: true, laborRate: '$149.50', taxRate: '8.35%' }

describe('readOwnShop', () => {
  it('reads the form into exact values and names the bad field', () => {
    const shop = readOwnShop(INPUT)
    expect(shop).toMatchObject({ code: 'VBT', region: 'CA', phone: '+15595550100', laborRateMinor: 14950n, taxRate: '0.083500' })
    expect(() => readOwnShop({ ...INPUT, code: 'V' })).toThrow(/2 to 5 letters/)
    expect(() => readOwnShop({ ...INPUT, laborRate: 'abc' })).toThrow(/labor rate/)
    expect(() => readOwnShop({ ...INPUT, closes: '07:00' })).toThrow(/Opening hours/)
  })
})

describe.skipIf(!hasTestDatabase)('Start with my shop (database)', () => {
  let prisma: PrismaClient
  let owner: { session: unknown; prisma: PrismaClient }

  beforeAll(async () => {
    prisma = testPrisma(8)
    await resetDatabase(prisma)
    const user = await prisma.user.create({ data: { name: 'owner', email: `${uniqueKey('owner')}@test.local`, password: 'x'.repeat(60) } })
    owner = { session: sessionFor(user.id, permissionNames.filter(p => p !== 'canBreakGlass')), prisma }
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  it('creates one working shop with no example customers or staff, and refuses the same code twice', { timeout: 240_000 }, async () => {
    const key = uniqueKey('own')
    const result = await startOwnShop(null, { input: INPUT, idempotencyKey: key }, owner)
    expect(result.shopId).toBe('shop_vbt')
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: 'shop_vbt' }, include: { bays: true, memberships: true, calendar: true } })
    expect(shop).toMatchObject({ name: 'Valley Brake & Tire', phone: '+15595550100', isPublished: true })
    expect(shop.bays).toHaveLength(3)
    expect(shop.memberships).toHaveLength(1)
    expect((shop.calendar?.weeklyHours as unknown[]).length).toBe(6)
    // Ready to write repair orders: state rules and every shop policy are published and pointed at.
    expect(shop.laborRateClassSetId && shop.taxRuleSetId && shop.shopPolicyId && shop.partsMatrixId && shop.feePolicyId && shop.warrantyTermSetId).toBeTruthy()
    const law = await shopLaw(prisma as never, 'shop_vbt')
    expect(law.pack.region).toBe('CA')
    const rate = await prisma.laborRateClass.findFirstOrThrow({ where: { setId: shop.laborRateClassSetId!, isDefault: true } })
    expect(rate.rateMinor).toBe(14950n)
    expect(await prisma.customer.count()).toBe(0)
    expect(await prisma.user.count()).toBe(1)

    // A replay returns the stored result; a fresh attempt with the same code is refused with a plain message.
    await expect(startOwnShop(null, { input: INPUT, idempotencyKey: key }, owner)).resolves.toMatchObject({ shopId: 'shop_vbt' })
    await expect(startOwnShop(null, { input: INPUT, idempotencyKey: uniqueKey('own') }, owner)).rejects.toThrow(/already exists/)
  })
})
