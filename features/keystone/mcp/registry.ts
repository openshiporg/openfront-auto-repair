/**
 * Openfront Auto Repair MCP domain tools (INTEGRATIONS §8). The generic createData/updateData/
 * deleteData tools are gone: an agent can only read through the list access rules of the user it
 * acts for, or call a named domain command. Each command is one GraphQL mutation that checks
 * permission and agent grants on the server, takes an idempotency key, and is audited.
 * Tool calls never approve anything; approvals are human-only.
 */

export type DomainTool = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, object>; required: string[]; additionalProperties?: boolean }
  /** GraphQL document; variables come from the validated arguments. */
  document: string
  /** Field of the GraphQL result to return. */
  field: string
  writes: boolean
}

const idempotencyKey = { type: 'string', minLength: 8, maxLength: 200, pattern: '^[A-Za-z0-9._:-]+$', description: 'Unique per intent. Reusing it returns the first result instead of acting twice.' }

export const DOMAIN_TOOLS: DomainTool[] = [
  {
    name: 'verifyAuditChain',
    description: 'Recompute the hash-chained audit log and report whether it is intact (and where it breaks if not). Needs canReadAudit.',
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    document: 'query VerifyAuditChain { verifyAuditChain }',
    field: 'verifyAuditChain',
    writes: false,
  },
  {
    name: 'loadNorthgateSetup',
    description: 'Load the Northgate Auto Group demo spine (shops, bays, hours, roles, staff, agents, approval policies). Idempotent. Needs canManageOnboarding.',
    inputSchema: { type: 'object', properties: { idempotencyKey }, required: ['idempotencyKey'], additionalProperties: false },
    document: 'mutation LoadNorthgateSetup($idempotencyKey: String!) { loadNorthgateSetup(idempotencyKey: $idempotencyKey) }',
    field: 'loadNorthgateSetup',
    writes: true,
  },
  // ── Repair orders (Phase 2). R = read, P = proposes (drafts a person reviews). No tool records an authorization. ──
  {
    name: 'getRepairOrder',
    description: 'Read one repair order: status, board stage, concerns, jobs with prices and statuses, estimate versions and open tasks. Needs canReadRepairOrders.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 } }, required: ['id'], additionalProperties: false },
    document: `query GetRepairOrder($id: ID!) { repairOrder(where: { id: $id }) {
      id roNumber status boardStage promisedAt waiter holdReason currentTotalMinor authorizedTotalMinor
      vehicle { year make model } concerns { id customerWords category }
      jobs(orderBy: { number: asc }) { id number title status kind urgency totalMinor authorizedAmountMinor chargeCeilingMinor reauthorizationReason version
        lines(orderBy: { sortOrder: asc }) { kind description partNumber condition quantityMilli soldCentiHours unitPriceMinor extendedMinor taxMinor } }
      estimateVersions(orderBy: { versionNumber: desc }) { id reference status totalMinor sentAt }
      tasks(where: { status: { equals: "open" } }) { id kind title dueAt }
    } }`,
    field: 'repairOrder',
    writes: false,
  },
  {
    name: 'listBoardRepairOrders',
    description: 'Open repair orders on the work board for a shop, newest first. Needs canReadRepairOrders.',
    inputSchema: { type: 'object', properties: { shopId: { type: 'string', minLength: 1, maxLength: 64 } }, required: ['shopId'], additionalProperties: false },
    document: `query Board($shopId: ID!) { repairOrders(where: { shop: { id: { equals: $shopId } }, status: { in: ["checked_in", "in_service", "on_hold"] } }, orderBy: { openedAt: desc }, take: 100) {
      id roNumber status boardStage promisedAt waiter holdReason currentTotalMinor vehicle { year make model }
    } }`,
    field: 'repairOrders',
    writes: false,
  },
  {
    name: 'proposeRepairJob',
    description: 'Draft a job on a repair order from a canned job or lines. It is priced from the shop policy and stays a draft for a person to review and send; it is never sent or authorized by this tool. A labor operation with several variants is refused (GUIDE_AMBIGUOUS). Needs canWriteRepairOrders or canPriceJobs.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'object', description: '{ repairOrderId, title, cannedJobId?, concernId?, lines?: [{ kind, description, operationCode?, variant?, soldCentiHours?, partNumber?, condition?, quantityMilli?, unitCostMinor? }] }' },
        idempotencyKey,
      },
      required: ['input', 'idempotencyKey'],
      additionalProperties: false,
    },
    document: 'mutation ProposeRepairJob($input: JSON!, $idempotencyKey: String!) { addRepairJob(input: $input, idempotencyKey: $idempotencyKey) }',
    field: 'addRepairJob',
    writes: true,
  },
  {
    name: 'requestCustomerCallback',
    description: 'Create a staff callback task on a repair order. Use this when a customer says yes, asks a question, or wants a call: a person calls back and records the answer. Needs canReadRepairOrders.',
    inputSchema: {
      type: 'object',
      properties: {
        repairOrderId: { type: 'string', minLength: 1, maxLength: 64 },
        kind: { type: 'string', enum: ['authorization_callback', 'customer_callback', 'authorization_follow_up', 'other'] },
        title: { type: 'string', minLength: 3, maxLength: 160 },
        detail: { type: 'string', maxLength: 1000 },
        idempotencyKey,
      },
      required: ['repairOrderId', 'title', 'idempotencyKey'],
      additionalProperties: false,
    },
    document: 'mutation RequestCallback($repairOrderId: ID!, $kind: String, $title: String!, $detail: String, $idempotencyKey: String!) { createCallbackTask(repairOrderId: $repairOrderId, kind: $kind, title: $title, detail: $detail, idempotencyKey: $idempotencyKey) }',
    field: 'createCallbackTask',
    writes: true,
  },
]

export function registerDomainTools(tools: DomainTool[]) {
  for (const tool of tools) {
    if (DOMAIN_TOOLS.some(existing => existing.name === tool.name)) throw new Error(`Duplicate MCP tool ${tool.name}`)
    DOMAIN_TOOLS.push(tool)
  }
}

/** Minimal JSON-schema check for the flat argument objects our tools take. */
export function validateArguments(tool: DomainTool, args: Record<string, unknown>) {
  const problems: string[] = []
  const properties = tool.inputSchema.properties as Record<string, { type?: string; enum?: unknown[]; minLength?: number; maxLength?: number; pattern?: string }>
  for (const key of tool.inputSchema.required) if (args[key] === undefined || args[key] === null || args[key] === '') problems.push(`${key} is required`)
  for (const [key, value] of Object.entries(args)) {
    const spec = properties[key]
    if (!spec) {
      if (tool.inputSchema.additionalProperties === false) problems.push(`${key} is not an argument of ${tool.name}`)
      continue
    }
    if (spec.type === 'string' && typeof value !== 'string') problems.push(`${key} must be a string`)
    if (spec.type === 'integer' && !Number.isSafeInteger(value)) problems.push(`${key} must be an integer`)
    if (spec.type === 'boolean' && typeof value !== 'boolean') problems.push(`${key} must be true or false`)
    if (spec.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) problems.push(`${key} must be an object`)
    if (spec.enum && !spec.enum.includes(value)) problems.push(`${key} must be one of ${spec.enum.join(', ')}`)
    if (typeof value === 'string') {
      if (spec.minLength && value.length < spec.minLength) problems.push(`${key} is too short`)
      if (spec.maxLength && value.length > spec.maxLength) problems.push(`${key} is too long`)
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) problems.push(`${key} has invalid characters`)
    }
  }
  if (problems.length) throw new Error(`Invalid arguments: ${problems.join('; ')}`)
}

export async function runDomainTool(tool: DomainTool, args: Record<string, unknown>, target: { graphqlEndpoint: string; auth: Record<string, string> }) {
  validateArguments(tool, args)
  const response = await fetch(target.graphqlEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...target.auth },
    body: JSON.stringify({ query: tool.document, variables: args }),
  })
  const result = await response.json()
  if (result.errors?.length) {
    return { ok: false, errors: result.errors.map((e: { message?: string; extensions?: { code?: string } }) => ({ message: e.message, code: e.extensions?.code })) }
  }
  return { ok: true, result: result.data?.[tool.field] ?? null }
}
