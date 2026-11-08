import { list } from '@keystone-6/core'
import { integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { anyOf } from '../access'
import { lifecycle, minor, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, serverOnly, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Estimates and authorization (SCHEMA §7.3-7.6, §17; STATE-MACHINES §4-5). Every row is written by a
 * command. A sent estimate version, an authorization and a decision never change after they are
 * written except for their status; database triggers refuse anything else, including raw SQL, and a
 * trigger refuses any Authorization or JobDecision insert in an agent's transaction (I-R3).
 */

const sys = () => false
const readRO = governed(['canReadRepairOrders'])
const pii = { read: anyOf('canReadCustomerPII', 'canRecordAuthorizations') as (args: any) => boolean, create: sys, update: sys }

export const EstimateVersion = list({
  access: shopScoped(readRO, 'repairOrder.shop'),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'repairOrder', 'versionNumber', 'totalMinor', 'status', 'sentAt'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.estimateVersions', ...readOnly }),
    versionNumber: integer({ validation: { isRequired: true }, ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    snapshot: json({ ...readOnly, ui: { ...readOnly.ui, description: 'What the customer saw: jobs, lines, conditions, fees, tax, totals, disclosures, policy versions, shop registrations.' } }),
    contentHash: systemText(),
    jobHashes: json({ defaultValue: {}, ...readOnly, ui: { ...readOnly.ui, description: '{ jobId: contentHash } — an authorization binds to one of these (I-R3).' } }),
    includedJobIds: json({ defaultValue: [], ...readOnly }),
    disclosuresChecked: json({ defaultValue: [], ...readOnly }),
    subtotalMinor: minor({ defaultValue: 0n }),
    taxMinor: minor({ defaultValue: 0n }),
    totalMinor: minor({ defaultValue: 0n }),
    document: relationship({ ref: 'Document', ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    sentBy: relationship({ ref: 'User', ...readOnly }),
    authorizations: relationship({ ref: 'Authorization.estimateVersion', many: true, ...readOnly }),
    status: lifecycle(['draft', 'sent', 'superseded']),
    version: versionField(),
    ...trackingFields,
  },
})

export const AuthorizationRequest = list({
  access: shopScoped(readRO, 'repairOrder.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['repairOrder', 'estimateVersion', 'channel', 'status', 'expiresAt'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.authorizationRequests', ...readOnly }),
    estimateVersion: relationship({ ref: 'EstimateVersion', ...readOnly }),
    channel: systemChoice(['sms', 'email', 'in_person', 'phone_call', 'fleet_portal']),
    contact: relationship({ ref: 'CustomerContact', ...readOnly }),
    contactLabel: systemText(),
    tokenHash: systemText({ indexed: 'unique' }),
    expiresAt: timestamp({ ...readOnly }),
    deliveredAt: timestamp({ ...readOnly }),
    viewedAt: timestamp({ ...readOnly }),
    answeredAt: timestamp({ ...readOnly }),
    viewerEvidence: json({ ...readOnly, access: pii }),
    answer: json({ ...readOnly, ui: { ...readOnly.ui, description: 'The stored answer, returned unchanged when the same answer is posted again.' } }),
    consentTextVersion: systemText(),
    createdByUser: relationship({ ref: 'User', ...readOnly }),
    createdByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    depositRequestedMinor: minor(),
    status: lifecycle(['created', 'delivered', 'viewed', 'answered', 'expired', 'withdrawn']),
    version: versionField(),
    ...trackingFields,
  },
})

export const Authorization = list({
  access: shopScoped(readRO, 'job.repairOrder.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['job', 'estimateVersion', 'amountMinor', 'method', 'actorName', 'authorizedAt', 'status'] } },
  fields: {
    job: relationship({ ref: 'Job.authorizations', ...readOnly }),
    estimateVersion: relationship({ ref: 'EstimateVersion.authorizations', ...readOnly }),
    jobContentHash: systemText({ required: true }),
    amountMinor: minor({ required: true }),
    subtotalMinor: minor({ defaultValue: 0n }),
    method: systemChoice(['in_person_signature', 'written_form', 'oral_phone', 'electronic_link', 'fleet_portal', 'fleet_po']),
    actorKind: systemChoice(['customer', 'designee', 'fleet_approver']),
    actorName: systemText({ required: true }),
    contactUsed: text({ access: pii, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' }, description: 'The phone number or email contacted (§3353.1(c)/(d)).' } }),
    evidence: json({ ...readOnly, access: pii, ui: { ...readOnly.ui, description: 'The method-specific evidence (16 CCR §3353.1): who, when, how reached, by whom recorded.' } }),
    authorizedAt: timestamp({ validation: { isRequired: true }, ...readOnly }),
    recordedByUser: relationship({ ref: 'User', ...readOnly }),
    authorizationRequest: relationship({ ref: 'AuthorizationRequest', ...readOnly }),
    signature: relationship({ ref: 'Document', ...readOnly }),
    consentTextVersion: systemText(),
    poNumber: systemText(),
    status: lifecycle(['recorded', 'superseded', 'revoked']),
    ...trackingFields,
  },
})

export const JobDecision = list({
  access: shopScoped(readRO, 'job.repairOrder.shop'),
  ui: { labelField: 'decision', listView: { initialColumns: ['job', 'decision', 'actorName', 'method', 'at'] } },
  fields: {
    job: relationship({ ref: 'Job.decisions', ...readOnly }),
    estimateVersion: relationship({ ref: 'EstimateVersion', ...readOnly }),
    decision: systemChoice(['declined', 'deferred']),
    actorName: systemText({ required: true }),
    method: systemChoice(['in_person_signature', 'written_form', 'oral_phone', 'electronic_link', 'fleet_portal', 'fleet_po']),
    at: timestamp({ validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    deferUntil: timestamp({ ...readOnly }),
    deferMiles: integer({ ...readOnly }),
    recordedByUser: relationship({ ref: 'User', ...readOnly }),
    authorizationRequest: relationship({ ref: 'AuthorizationRequest', ...readOnly }),
    ...trackingFields,
  },
})

/** Generic one-time links (inspection view, later invoice pay and portal sign-in). Only the hash is stored. */
export const PublicAccessToken = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    purpose: systemChoice(['authorization', 'inspection', 'invoice_pay', 'portal_magic_link', 'fleet_magic_link']),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ required: true }),
    shop: relationship({ ref: 'Shop' }),
    tokenHash: systemText({ indexed: 'unique', required: true }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
    usedAt: timestamp(),
    useCount: integer({ defaultValue: 0 }),
    maxUses: integer({ defaultValue: 50 }),
    revokedAt: timestamp(),
    ...trackingFields,
  },
})
