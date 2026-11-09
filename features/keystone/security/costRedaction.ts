import { hasPermission } from '../access'

/*
 * Review r3 N3: cost was hidden on the `*Minor` columns but still readable inside JSON and free text
 * (StockMovement.after.avgCost, SupplierReturn.lines[].unitCostMinor, ApprovalRequest.payload.coreChargeMinor,
 * Discrepancy.detail "ordered at $11.50"). These wrappers give a reader without canSeeCost a copy with the cost
 * removed. The stored value is untouched, so hashes, the audit chain and server code (Prisma) see the original.
 */

/** Keys that hold a cost, a cost-derived value or a supplier credit. */
export const COST_KEY = /cost|corecharge|variance|margin|creditminor|linestotal/i
/** On supplier-side records every amount is a cost (what the shop pays), whatever the key is called. */
const SUPPLIER_ENTITIES = new Set(['SupplierInvoice', 'SupplierInvoiceLine', 'SupplierOrder', 'SupplierOrderLine', 'Discrepancy', 'CoreObligation', 'SupplierReturn', 'StockLevel', 'StockMovement', 'CycleCount', 'PartQuote'])
const ANY_MINOR = /minor$/i

export const canSeeCost = (context: any) => hasPermission(context?.session, 'canSeeCost')

/** A deep copy without cost keys. `allMinor` also drops every `*Minor` key (supplier-side records). */
export function stripCost(value: unknown, allMinor = false): unknown {
  if (Array.isArray(value)) return value.map(v => stripCost(v, allMinor))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !COST_KEY.test(k) && !(allMinor && ANY_MINOR.test(k))).map(([k, v]) => [k, stripCost(v, allMinor)]))
  }
  return value
}

/** True when the JSON holds a cost key anywhere. */
export function holdsCost(value: unknown, allMinor = false): boolean {
  if (Array.isArray(value)) return value.some(v => holdsCost(v, allMinor))
  if (value && typeof value === 'object') return Object.entries(value as Record<string, unknown>).some(([k, v]) => COST_KEY.test(k) || (allMinor && ANY_MINOR.test(k)) || holdsCost(v, allMinor))
  return false
}

/** Money written into text ("$11.50", "1,150.00 USD") becomes a dash. */
export const stripMoneyText = (text: unknown) => (typeof text === 'string' ? text.replace(/\$\s?-?[\d,]+(\.\d+)?|\b-?[\d,]+(\.\d{2})?\s?(USD|dollars|cents)\b/gi, '—') : text)

type Redact = (value: unknown, item: Record<string, unknown>) => unknown

/** Wrap a field so its GraphQL output goes through `redact` for a reader without canSeeCost. Filtering is unaffected (JSON and these text fields are not filterable). */
export function costRedacted<F extends (args: any) => any>(field: F, redact: Redact): F {
  return ((args: any) => {
    const f = field(args)
    const inner = f.output.resolve as undefined | ((root: any, a: any, c: any, i: any) => unknown)
    return {
      ...f,
      output: {
        ...f.output,
        resolve: async (root: { value: unknown; item: Record<string, unknown> }, a: unknown, context: any, info: unknown) => {
          const value = inner ? await inner(root, a, context, info) : root.value
          if (value === null || value === undefined || canSeeCost(context)) return value
          return redact(value, root.item)
        },
      },
    }
  }) as F
}

export const withoutCostKeys = <F extends (args: any) => any>(field: F) => costRedacted(field, v => stripCost(v))
export const withoutMoneyText = <F extends (args: any) => any>(field: F) => costRedacted(field, v => stripMoneyText(v))
/** Audit before/after/metadata: cost keys always, and every amount on a supplier-side record. */
export const auditJsonWithoutCost = <F extends (args: any) => any>(field: F) => costRedacted(field, (v, item) => stripCost(v, SUPPLIER_ENTITIES.has(String(item.entityType))))
/** A hash of a payload that holds cost is a brute-force oracle for it (low entropy): hidden from a reader who cannot see the cost. */
export const hashHiddenWithCost = <F extends (args: any) => any>(field: F, payloadKey = 'payload') => costRedacted(field, (v, item) => (holdsCost(item[payloadKey]) ? null : v))
