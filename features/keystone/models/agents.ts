import { list } from '@keystone-6/core'
import { integer, json, relationship, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'
import { withoutCostKeys } from '../security/costRedaction'

/*
 * Agents and proposals (SCHEMA §14, STATE-MACHINES §18). Every list is governed: the generated API
 * reads (with the shop row filter) and never writes. Commands in features/keystone/agents make
 * every change in one audited transaction. An agent never writes directly: it makes a proposal,
 * a person confirms each step, and the readSet is checked again before the step runs.
 */

import { AGENT_SCOPES, PROPOSAL_STATES } from '../agents/constants'

export const AgentToolGrant = list({
  access: governed('canManageAgents'),
  ui: { labelField: 'scope', listView: { initialColumns: ['agent', 'scope', 'status'] } },
  fields: {
    agent: relationship({ ref: 'AgentIdentity.grants', ...readOnly }),
    scope: fixedChoice(AGENT_SCOPES),
    limits: json({ defaultValue: {}, ...readOnly }),
    grantedBy: relationship({ ref: 'User', ...readOnly }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    status: lifecycle(['active', 'revoked']),
    version: versionField(),
    ...trackingFields,
  },
})

export const AgentRun = list({
  access: shopScoped(governed(['canManageAgents', 'canConfirmProposals'])),
  ui: { labelField: 'inputSummary', listView: { initialColumns: ['agent', 'invokedBy', 'channel', 'status', 'startedAt'] } },
  fields: {
    agent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    invokedBy: relationship({ ref: 'User', ...readOnly }),
    channel: systemChoice(['dashboard_chat', 'mcp', 'voice', 'manual']),
    adapter: systemChoice(['manual', 'llm', 'fake', 'mcp_client']),
    inputSummary: systemText(),
    toolCalls: withoutCostKeys(json({ defaultValue: [], ...readOnly })),
    tokens: integer({ defaultValue: 0, ...readOnly }),
    startedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    status: lifecycle(['running', 'completed', 'refused', 'failed']),
    ...trackingFields,
  },
})

export const AgentProposal = list({
  access: shopScoped(governed(['canConfirmProposals', 'canManageAgents'])),
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'shop', 'agent', 'actionClass', 'status', 'createdAt'] } },
  fields: {
    title: systemText({ required: true }),
    run: relationship({ ref: 'AgentRun', ...readOnly }),
    agent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    invokedBy: relationship({ ref: 'User', ...readOnly }),
    actionClass: systemText({ indexed: true }),
    // [{ index, tool, args, preview, status: pending|done|failed, result }]. Cost keys are stripped for readers without canSeeCost.
    plan: withoutCostKeys(json({ defaultValue: [], ...readOnly })),
    // [{ entity, id, version }] for everything the plan read; checked again before each step runs.
    readSet: json({ defaultValue: [], ...readOnly }),
    stepIndex: integer({ defaultValue: 0, ...readOnly }),
    confirmedBy: relationship({ ref: 'User', ...readOnly }),
    confirmedAt: timestamp({ ...readOnly }),
    autoConfirmedByPolicy: relationship({ ref: 'ShopPolicyVersion', ...readOnly }),
    result: withoutCostKeys(json({ ...readOnly })),
    failure: systemText(),
    status: lifecycle(PROPOSAL_STATES),
    version: versionField(),
    ...trackingFields,
  },
})

export const VoiceTask = list({
  access: shopScoped(governed(['canManageAgents', 'canOrderParts', 'canManageParts', 'canMessageCustomers', 'canManageSchedule'])),
  ui: { labelField: 'summary', listView: { initialColumns: ['kind', 'summary', 'shop', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    agent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    kind: fixedChoice(['supplier_quote_call', 'customer_status_call', 'inbound_reception']),
    summary: systemText({ required: true }),
    target: withoutCostKeys(json({ defaultValue: {}, ...readOnly })),
    script: systemText(),
    call: relationship({ ref: 'CallRecord', ...readOnly }),
    extracted: withoutCostKeys(json({ ...readOnly })),
    proposal: relationship({ ref: 'AgentProposal', ...readOnly }),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    completedBy: relationship({ ref: 'User', ...readOnly }),
    completedAt: timestamp({ ...readOnly }),
    status: lifecycle(['queued', 'calling', 'completed', 'failed', 'cancelled']),
    version: versionField(),
    ...trackingFields,
  },
})
