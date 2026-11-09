import { parse, validate, buildSchema } from 'graphql'
import { describe, expect, it } from 'vitest'
import { MAX_QUERY_ALIASES, MAX_QUERY_DEPTH, queryLimitsRule } from './queryLimits'

/* Review r2 F3: 200 aliases and a 12-deep query were accepted by the GraphQL endpoint. */

const schema = buildSchema('type Node { id: ID! child: Node } type Query { node: Node }')
const errors = (source: string) => validate(schema, parse(source), [queryLimitsRule]).map(e => e.message)
const nested = (depth: number) => `{ node ${'{ child '.repeat(depth - 2)}{ id }${' }'.repeat(depth - 2)} }`

describe('query limits', () => {
  it('accepts a normal read', () => expect(errors('{ node { id child { id } } }')).toEqual([]))
  it('refuses a query nested deeper than the limit (deep nesting)', () => {
    expect(errors(nested(MAX_QUERY_DEPTH))).toEqual([])
    expect(errors(nested(MAX_QUERY_DEPTH + 2)).join(' ')).toMatch(/nests/)
    expect(errors(nested(12)).join(' ')).toMatch(/nests/)
  })
  it('refuses a flood of aliases', () => {
    const many = (n: number) => `{ ${Array.from({ length: n }, (_, i) => `a${i}: node { id }`).join(' ')} }`
    expect(errors(many(MAX_QUERY_ALIASES))).toEqual([])
    expect(errors(many(200)).join(' ')).toMatch(/aliases/)
  })
  it('counts nesting through fragments', () => {
    const frag = `query { node { ...F } } fragment F on Node { child ${'{ child '.repeat(12)} { id } ${'}'.repeat(12)} }`
    expect(errors(frag).join(' ')).toMatch(/nests/)
  })
  it('does not count introspection', () => expect(errors('{ __schema { types { name } } }')).toEqual([]))
})
