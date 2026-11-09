import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildSchema } from 'graphql'
import { describe, expect, it } from 'vitest'
import { boundedTake, buildSelection, MCP_MAX_TAKE, SelectionError } from './selection'

/* Review r2 F3: queryData spliced the caller's `fields` into the query text. It is now parsed and rebuilt from schema names. */

const schema = buildSchema(readFileSync(join(__dirname, '../../../schema.graphql'), 'utf8'))
const bad = (operation: string, fields: string) => expect(() => buildSelection(schema, operation, fields)).toThrow(SelectionError)

describe('MCP queryData selection', () => {
  it('rebuilds a plain selection from schema names, and bounds nested lists itself', () => {
    expect(buildSelection(schema, 'repairOrders', 'id roNumber').selection).toBe('id roNumber')
    expect(buildSelection(schema, 'repairOrders', 'id jobs { id title }').selection).toBe(`id jobs(take: ${MCP_MAX_TAKE}) { id title }`)
  })
  it('refuses a field that does not exist on the type (a disallowed field)', () => {
    bad('repairOrders', 'id notAField')
    bad('repairOrders', 'id jobs { nope }')
  })
  it('refuses anything that is not a bare field name: closing the selection, arguments, aliases, fragments, directives', () => {
    for (const fields of ['id } jobs(where: { costMinor: { gte: "0" } }) { id', 'id jobs(take: 100000) { id }', 'a: id', '... on RepairOrder { id }', 'id @skip(if: true)', 'id "x"', 'id $v', '__typename', '{ id }', 'id {', 'id }', 'jobs { }']) bad('repairOrders', fields)
  })
  it('refuses an operation that is not a list query, or is spliced', () => {
    bad('repairOrders { id } other', 'id')
    bad('nonsense', 'id')
    bad('__schema', 'id')
    bad('repairOrder', 'id')
  })
  it('refuses deep nesting and oversized selections', () => {
    bad('repairOrders', 'jobs { lines { job { repairOrder { id } } } }')
    bad('repairOrders', Array.from({ length: 80 }, () => 'id').join(' '))
    bad('repairOrders', 'x'.repeat(3000))
  })
  it('bounds take to 1..50, whatever the caller sends (an oversized take)', () => {
    expect(boundedTake(100000)).toBe(MCP_MAX_TAKE)
    expect(boundedTake(10)).toBe(10)
    expect(boundedTake(undefined)).toBe(10)
    expect(boundedTake(-5)).toBe(10)
    expect(boundedTake('9; drop')).toBe(10)
    expect(boundedTake(1.5)).toBe(10)
  })
})
