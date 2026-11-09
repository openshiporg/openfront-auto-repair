/*
 * A field a reader cannot see must not be filterable or sortable by them either. `where: { costMinor: { gte } }`
 * or `orderBy: { costMinor: asc }` would otherwise reveal the hidden value one guess at a time (review r2 F1).
 *
 * Every field whose read access is a function (cost, pay, customer PII, secrets) gets that same function as
 * `isFilterable` and `isOrderable`, applied once to the whole model map so a list cannot forget it. A field
 * that is already not filterable stays not filterable. Server code uses Prisma or sudo and is unaffected.
 */
type FieldFn = (args: any) => any

export function gateFilterAndOrder<T extends Record<string, any>>(models: T): T {
  for (const list of Object.values(models)) {
    for (const [fieldKey, original] of Object.entries(list.fields ?? {})) {
      if (typeof original !== 'function' || fieldKey.startsWith('__group')) continue
      list.fields[fieldKey] = (args: any) => {
        const field = (original as FieldFn)(args)
        const read = typeof field.access === 'function' ? field.access : field.access?.read
        if (typeof read !== 'function') return field
        const gate = (base: unknown) => (base === false ? false : async (input: any) => {
          const allowed = await read({ ...input, operation: 'read', item: undefined })
          if (allowed !== true) return false
          return typeof base === 'function' ? (await base(input)) === true : true
        })
        return { ...field, isFilterable: gate(field.isFilterable), isOrderable: gate(field.isOrderable) }
      }
    }
  }
  return models
}

/** Every list query is bounded (`graphql.maxTake`), at the top level and on nested relationships. */
export const MAX_TAKE_DEFAULT = 1000
export function boundTake<T extends Record<string, any>>(models: T, max = MAX_TAKE_DEFAULT): T {
  return Object.fromEntries(Object.entries(models).map(([key, config]) => [key, config.isSingleton ? config : { ...config, graphql: { ...config.graphql, maxTake: config.graphql?.maxTake ?? max } }])) as T
}
