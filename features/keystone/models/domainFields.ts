import { bigInt, decimal, integer, select, text } from '@keystone-6/core/fields'

/** Ledger cash in minor units (SCHEMA G2). */
export const minor = (options: { required?: boolean; defaultValue?: bigint; description?: string; access?: { read?: (args: any) => boolean; create?: (args: any) => boolean; update?: (args: any) => boolean } } = {}) =>
  bigInt({
    ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
    ...(options.access ? { access: options.access } : {}),
    validation: { isRequired: options.required ?? options.defaultValue !== undefined },
    ...(options.description ? { ui: { description: options.description } } : {}),
  })

const exact = (precision: number, scale: number) => (options: { required?: boolean; description?: string; defaultValue?: string } = {}) =>
  decimal({
    precision,
    scale,
    ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
    validation: { isRequired: options.required ?? options.defaultValue !== undefined },
    ...(options.description ? { ui: { description: options.description } } : {}),
  })

/** Percentages as fractions, numeric(12,6): 0.0925 = 9.25% (SCHEMA G4). */
export const pct = exact(12, 6)
/** Markup multipliers, numeric(12,6): 1.850000 (SCHEMA G4). */
export const fac = exact(12, 6)
/** Confidence 0..1, numeric(5,4) (diagnosis trust gate). */
export const conf = exact(5, 4)

const wholeNumber = (description: string) => (options: { required?: boolean; defaultValue?: number; min?: number } = {}) =>
  integer({
    ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
    validation: { isRequired: options.required ?? options.defaultValue !== undefined, ...(options.min !== undefined ? { min: options.min } : {}) },
    ui: { description },
  })

/** Labor time in hundredths of an hour (SCHEMA G3): 1.25 h = 125. */
export const centiHours = wholeNumber('Hundredths of an hour (125 = 1.25 h).')
/** Part and fluid quantities in thousandths of the unit of measure (SCHEMA G3): 5.7 qt = 5700. */
export const milli = wholeNumber('Thousandths of the unit (5700 = 5.7).')

const option = (value: string) => ({ label: value.replaceAll('_', ' ').replaceAll('.', ' · '), value })

/**
 * A lifecycle status. It changes only through transition mutations (SCHEMA G7): never through the
 * generated create/update operations.
 */
export const lifecycle = (values: readonly string[], initial = values[0]) =>
  select({
    type: 'string',
    options: values.map(option),
    defaultValue: initial,
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

/** A plain choice that staff may edit. */
export const choice = (values: readonly string[], initial: string | null = values[0]) =>
  select({
    type: 'string',
    options: values.map(option),
    ...(initial !== null ? { defaultValue: initial } : {}),
    validation: { isRequired: initial !== null },
  })

/** Compare-and-set version (SCHEMA G6). Incremented only by server code. */
export const versionField = () =>
  integer({
    defaultValue: 0,
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

/** Server-written text that is visible but never edited through the API. */
export const systemText = (options: { indexed?: boolean | 'unique'; required?: boolean } = {}) =>
  text({
    ...(options.indexed ? { isIndexed: options.indexed } : {}),
    validation: { isRequired: options.required ?? false },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

export const readOnly = { access: { create: () => false, update: () => false }, ui: { createView: { fieldMode: 'hidden' as const }, itemView: { fieldMode: 'read' as const } } }

/** A choice fixed at creation by server code (e.g. a grant scope): visible, never edited. */
export const fixedChoice = (values: readonly string[]) =>
  select({
    type: 'string',
    options: values.map(option),
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

/** A choice set by server code with a default (election, hold reason, condition): visible, never edited through the API. */
export const systemChoice = (values: readonly string[], initial: string = values[0]) =>
  select({
    type: 'string',
    options: values.map(option),
    defaultValue: initial,
    validation: { isRequired: true },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })

/** A server-set choice that may be empty (a part line's condition before it is chosen). */
export const optionalChoice = (values: readonly string[]) =>
  select({
    type: 'string',
    options: values.map(option),
    validation: { isRequired: false },
    access: { create: () => false, update: () => false },
    ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
  })
