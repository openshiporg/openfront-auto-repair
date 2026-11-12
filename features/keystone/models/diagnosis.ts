import { list } from '@keystone-6/core'
import { integer, json, relationship, timestamp } from '@keystone-6/core/fields'
import { conf, fixedChoice, lifecycle, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Diagnosis (SCHEMA §6.4-6.6, STATE-MACHINES §7). open → testing → quote_ready | inconclusive → closed.
 * A diagnosis-based job can be quoted only when a test confirms the top hypothesis at or above the shop's
 * trust threshold, or a lead technician or advisor overrides it with a reason. An agent never overrides.
 */

const read = ['canDiagnose', 'canReadRepairOrders', 'canConfirmProposals'] as const

export const DiagnosisSession = list({
  access: shopScoped(governed([...read])),
  ui: { labelField: 'summary', listView: { initialColumns: ['summary', 'repairOrder', 'status', 'confidence'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    concern: relationship({ ref: 'Concern', ...readOnly }),
    diagnosisJob: relationship({ ref: 'Job', ...readOnly }),
    summary: systemText(),
    symptoms: json({ defaultValue: [], ...readOnly }),
    dtcs: json({ defaultValue: [], ...readOnly }),
    hypotheses: relationship({ ref: 'DiagnosisHypothesis.session', many: true, ...readOnly }),
    tests: relationship({ ref: 'DiagnosisTest.session', many: true, ...readOnly }),
    topHypothesis: relationship({ ref: 'DiagnosisHypothesis', ...readOnly }),
    confidence: conf({ defaultValue: '0.0000' }),
    // { by, reason, at, threshold, confidence }: set only by a person who holds canOverrideTrustGate.
    override: json({ ...readOnly }),
    openedBy: relationship({ ref: 'User', ...readOnly }),
    status: lifecycle(['open', 'testing', 'quote_ready', 'inconclusive', 'closed']),
    version: versionField(),
    ...trackingFields,
  },
})

export const DiagnosisHypothesis = list({
  access: shopScoped(governed([...read]), 'session.shop'),
  ui: { labelField: 'cause', listView: { initialColumns: ['cause', 'confidence', 'rank', 'status'] } },
  fields: {
    session: relationship({ ref: 'DiagnosisSession.hypotheses', ...readOnly }),
    cause: systemText({ required: true }),
    confidence: conf({ defaultValue: '0.0000' }),
    rank: integer({ defaultValue: 0, ...readOnly }),
    // [{ kind: dtc|test|tsb|source|history, ref, excerpt }]
    evidence: json({ defaultValue: [], ...readOnly }),
    // [{ sourceKind: oem|licensed|government|shop_history|forum_checked, title, url?, licensedProvider? }]
    sources: json({ defaultValue: [], ...readOnly }),
    agentRun: relationship({ ref: 'AgentRun', ...readOnly }),
    enteredBy: relationship({ ref: 'User', ...readOnly }),
    origin: systemChoice(['staff', 'agent']),
    status: lifecycle(['active', 'confirmed', 'ruled_out']),
    ...trackingFields,
  },
})

export const DiagnosisTest = list({
  access: shopScoped(governed([...read]), 'session.shop'),
  ui: { labelField: 'procedure', listView: { initialColumns: ['procedure', 'outcome', 'at'] } },
  fields: {
    session: relationship({ ref: 'DiagnosisSession.tests', ...readOnly }),
    hypothesis: relationship({ ref: 'DiagnosisHypothesis', ...readOnly }),
    procedure: systemText({ required: true }),
    expected: systemText(),
    result: systemText(),
    outcome: fixedChoice(['confirms', 'refutes', 'inconclusive']),
    performedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    ...trackingFields,
  },
})
