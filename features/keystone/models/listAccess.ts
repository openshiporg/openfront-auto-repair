import { anyOf, isSignedIn, permissions, sessionShopIds, sys, type Permission, type Session } from '../access'

type Rule = (args: any) => boolean

const rule = (permission: Permission | Permission[] | 'signedIn'): Rule =>
  permission === 'signedIn' ? isSignedIn : Array.isArray(permission) ? anyOf(...permission) : permissions[permission]

/**
 * Governed list: readable with `read`, never created, updated or deleted through the generated
 * API. Every write goes through a custom mutation (command) that runs as sudo inside a transaction.
 */
export const governed = (read: Permission | Permission[] | 'signedIn') => ({
  operation: { query: rule(read), create: sys, update: sys, delete: sys },
})

/** Reference data edited directly by holders of `write` (never deleted: rows are referenced by history). */
export const managed = (read: Permission | Permission[] | 'signedIn', write: Permission | Permission[]) => ({
  operation: { query: rule(read), create: rule(write), update: rule(write), delete: sys },
})

/** Immutable rows (SCHEMA G8): readable with `read`, written only by server code. */
export const immutable = governed

/** Server-only bookkeeping. Hidden from the API altogether. */
export const serverOnly = {
  operation: { query: sys, create: sys, update: sys, delete: sys },
}

/**
 * Row filter for operational lists (SCHEMA §0.1 `shopScoped`): a user sees rows of the shops they
 * are an active member of, unless their role has canAccessAllShops. `path` is the relationship
 * to Shop (default `shop`; e.g. `calendar.shop` for a calendar exception).
 */
export function shopFilter(path = 'shop') {
  return ({ session }: { session?: Session | null }) => {
    const ids = sessionShopIds(session)
    if (ids === 'all') return true
    const leaf = { id: { in: ids } }
    return path.split('.').reverse().reduce<Record<string, unknown>>((inner, key) => ({ [key]: inner }), leaf)
  }
}

/** Adds the shop row filter to query (and update, where updates are allowed) of an access spec. */
export function shopScoped<T extends { operation: Record<string, unknown> }>(spec: T, path = 'shop') {
  const filter = shopFilter(path)
  return { ...spec, filter: { query: filter, update: filter, delete: filter } }
}
