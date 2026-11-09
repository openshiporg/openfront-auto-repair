import { GraphQLError, Kind, type ASTVisitor, type ValidationContext, type FragmentDefinitionNode, type SelectionSetNode } from 'graphql'

/*
 * Query shape limits for the GraphQL endpoint: selection depth, the number of field selections and the number of
 * aliases (review r2 F3: 200 aliases and a 12-deep query were accepted). Introspection (`__schema`, `__type`) is not
 * counted; the MCP schema read needs it. The dashboard's deepest read is well under 10 levels.
 */
export const MAX_QUERY_DEPTH = 10
export const MAX_QUERY_FIELDS = 1500
export const MAX_QUERY_ALIASES = 20

type Count = { n: number; aliases: number }

function measure(set: SelectionSetNode, fragments: Record<string, FragmentDefinitionNode>, depth: number, seen: Set<string>, count: Count): number {
  let max = depth
  for (const selection of set.selections) {
    if (selection.kind === Kind.FIELD) {
      if (selection.name.value.startsWith('__')) continue
      count.n++
      if (selection.alias && selection.alias.value !== selection.name.value) count.aliases++
      if (selection.selectionSet) max = Math.max(max, measure(selection.selectionSet, fragments, depth + 1, seen, count))
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      max = Math.max(max, measure(selection.selectionSet, fragments, depth, seen, count))
    } else {
      const name = selection.name.value
      if (seen.has(name) || !fragments[name]) continue
      max = Math.max(max, measure(fragments[name].selectionSet, fragments, depth, new Set([...seen, name]), count))
    }
  }
  return max
}

export function queryLimitsRule(context: ValidationContext): ASTVisitor {
  const fragments: Record<string, FragmentDefinitionNode> = {}
  for (const def of context.getDocument().definitions) if (def.kind === Kind.FRAGMENT_DEFINITION) fragments[def.name.value] = def
  return {
    OperationDefinition(node) {
      const count: Count = { n: 0, aliases: 0 }
      const depth = measure(node.selectionSet, fragments, 1, new Set(), count)
      if (depth > MAX_QUERY_DEPTH) context.reportError(new GraphQLError(`This query nests ${depth} levels; the limit is ${MAX_QUERY_DEPTH}.`, { nodes: [node], extensions: { code: 'QUERY_TOO_DEEP' } }))
      if (count.n > MAX_QUERY_FIELDS) context.reportError(new GraphQLError(`This query selects ${count.n} fields; the limit is ${MAX_QUERY_FIELDS}.`, { nodes: [node], extensions: { code: 'QUERY_TOO_LARGE' } }))
      if (count.aliases > MAX_QUERY_ALIASES) context.reportError(new GraphQLError(`This query uses ${count.aliases} aliases; the limit is ${MAX_QUERY_ALIASES}.`, { nodes: [node], extensions: { code: 'QUERY_TOO_LARGE' } }))
    },
  }
}

/** Adds the query-limit validation rule to every request (graphql-yoga / envelop plugin). */
export const queryLimitsPlugin = () => ({
  onValidate({ addValidationRule }: { addValidationRule: (rule: typeof queryLimitsRule) => void }) {
    addValidationRule(queryLimitsRule)
  },
})
