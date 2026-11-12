import { list } from '@keystone-6/core'
import { calendarDay, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { fixedChoice, lifecycle, minor, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Communications, recommendations, reminders and campaigns (SCHEMA §13, adapted by the owner's fleet rule).
 * Messages are a RECORD, not a delivery system: staff log the calls, texts and emails they made or received, or copy prepared
 * wording. Nothing here sends anything. Every write goes through a command (lib/communications.ts, lib/followUps.ts,
 * lib/campaigns.ts); the generated API only reads. Marketing rows are refused by the database too (trigger
 * require_marketing_consent) when the latest consent event on the contact is not a written grant.
 */

const readMessages = shopScoped(governed(['canMessageCustomers', 'canManageCustomers', 'canManageCampaigns']))
const readFollowUps = shopScoped(governed(['canReadRepairOrders', 'canMessageCustomers', 'canManageCampaigns']))
const readCampaigns = shopScoped(governed(['canManageCampaigns', 'canMessageCustomers']))
/** Exports and their recipients belong to a campaign: they are scoped through the campaign's shop. */
const readCampaignChildren = shopScoped(governed(['canManageCampaigns', 'canMessageCustomers']), 'campaign.shop')

export const MessageThread = list({
  access: readMessages,
  ui: { labelField: 'id', listView: { initialColumns: ['customer', 'repairOrder', 'lastMessageAt', 'unreadCount'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    threadKey: systemText({ indexed: 'unique', required: true }),
    messages: relationship({ ref: 'Message.thread', many: true, ...readOnly }),
    calls: relationship({ ref: 'CallRecord.thread', many: true, ...readOnly }),
    lastMessageAt: timestamp({ ...readOnly }),
    unreadCount: integer({ defaultValue: 0, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** One logged or received text or email. Append-only except the review bookkeeping (trigger). */
export const Message = list({
  access: readMessages,
  ui: { labelField: 'id', listView: { initialColumns: ['thread', 'direction', 'channel', 'purpose', 'at'] } },
  fields: {
    thread: relationship({ ref: 'MessageThread.messages', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    contact: relationship({ ref: 'CustomerContact', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    direction: fixedChoice(['inbound', 'outbound']),
    channel: fixedChoice(['sms', 'email']),
    purpose: fixedChoice(['transactional', 'marketing']),
    source: fixedChoice(['staff_log', 'inbound_webhook']),
    templateCode: systemText(),
    templateVersion: integer({ defaultValue: 0, ...readOnly }),
    body: text({ access: { create: () => false, update: () => false }, ui: { displayMode: 'textarea', createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    providerMessageId: text({ isIndexed: 'unique', db: { isNullable: true }, ...readOnly }),
    keyword: systemText(),
    reviewState: systemChoice(['none', 'needs_review', 'reviewed']),
    reviewedAt: timestamp({ ...readOnly }),
    reviewedBy: relationship({ ref: 'User', ...readOnly }),
    consent: relationship({ ref: 'ContactConsent', ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** A phone call staff made or took. */
export const CallRecord = list({
  access: readMessages,
  ui: { labelField: 'id', listView: { initialColumns: ['customer', 'direction', 'outcome', 'at'] } },
  fields: {
    thread: relationship({ ref: 'MessageThread.calls', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    contact: relationship({ ref: 'CustomerContact', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    direction: fixedChoice(['inbound', 'outbound']),
    outcome: fixedChoice(['reached', 'left_voicemail', 'no_answer', 'wrong_number']),
    note: text({ access: { create: () => false, update: () => false }, ui: { displayMode: 'textarea', createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    minutes: integer({ ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** Prepared wording staff copy. Edited by a command so every change is audited and numbered. */
export const MessageTemplate = list({
  access: governed(['canMessageCustomers', 'canManageCampaigns']),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'code', 'purpose', 'version', 'active'] } },
  fields: {
    code: systemText({ indexed: 'unique', required: true }),
    name: systemText({ required: true }),
    purpose: fixedChoice(['transactional', 'marketing']),
    body: text({ access: { create: () => false, update: () => false }, ui: { displayMode: 'textarea', createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    version: integer({ defaultValue: 1, ...readOnly }),
    active: lifecycle(['active', 'retired']),
    updatedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})

/** Work a customer declined or deferred. When it is due again is worked out on read from the shop's cadence. */
export const Recommendation = list({
  access: readFollowUps,
  ui: { labelField: 'title', listView: { initialColumns: ['title', 'customer', 'vehicle', 'urgency', 'status', 'declinedAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    sourceJob: relationship({ ref: 'Job', ...readOnly }),
    sourceJobKey: systemText({ indexed: 'unique', required: true }),
    title: systemText({ required: true }),
    urgency: fixedChoice(['none', 'green', 'yellow', 'red']),
    decision: fixedChoice(['declined', 'deferred']),
    priceSnapshotMinor: minor({ defaultValue: 0n, access: { read: () => true, create: () => false, update: () => false } }),
    evidence: json({ ...readOnly }),
    declinedAt: timestamp({ ...readOnly }),
    deferUntil: timestamp({ ...readOnly }),
    deferMiles: integer({ ...readOnly }),
    contactedCount: integer({ defaultValue: 0, ...readOnly }),
    lastContactedAt: timestamp({ ...readOnly }),
    status: lifecycle(['open', 'converted', 'dismissed']),
    dismissedReason: systemText(),
    convertedJob: relationship({ ref: 'Job', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** Created when staff mark a due reminder contacted. Which reminders are due is computed on read. */
export const ServiceReminder = list({
  access: readFollowUps,
  ui: { labelField: 'cycleKey', listView: { initialColumns: ['vehicle', 'customer', 'kind', 'dueOn', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    kind: fixedChoice(['oil', 'rotation', 'inspection']),
    cycleKey: systemText({ indexed: 'unique', required: true }),
    lastServiceJob: relationship({ ref: 'Job', ...readOnly }),
    dueOn: calendarDay({ ...readOnly }),
    dueAtOdometer: integer({ ...readOnly }),
    projectedDueOn: calendarDay({ ...readOnly }),
    status: lifecycle(['contacted']),
    contactChannel: fixedChoice(['call', 'text', 'email', 'in_person']),
    note: systemText(),
    contactedAt: timestamp({ ...readOnly }),
    contactedBy: relationship({ ref: 'User', ...readOnly }),
    ...trackingFields,
  },
})

/** An audience definition and wording. Never sent by the app: staff export the list or copy the wording. */
export const Campaign = list({
  access: readCampaigns,
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'kind', 'status', 'shop', 'createdAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    name: systemText({ required: true }),
    kind: fixedChoice(['reminders', 'declined_work', 'reviews', 'promo']),
    audienceRule: json({ defaultValue: {}, ...readOnly }),
    messageText: text({ access: { create: () => false, update: () => false }, ui: { displayMode: 'textarea', createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    status: lifecycle(['draft', 'active', 'ended']),
    exports: relationship({ ref: 'CampaignExport.campaign', many: true, ...readOnly }),
    createdBy: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** One export of an audience, with who was left out and why. Append-only. */
export const CampaignExport = list({
  access: readCampaignChildren,
  ui: { labelField: 'id', listView: { initialColumns: ['campaign', 'recipientCount', 'excludedCount', 'at'] } },
  fields: {
    campaign: relationship({ ref: 'Campaign.exports', ...readOnly }),
    recipients: relationship({ ref: 'CampaignRecipient.export', many: true, ...readOnly }),
    recipientCount: integer({ defaultValue: 0, ...readOnly }),
    excludedCount: integer({ defaultValue: 0, ...readOnly }),
    excluded: json({ defaultValue: [], ...readOnly }),
    exportedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** Who was on an export, and the consent event that allowed it. The database refuses a row without a written grant. */
export const CampaignRecipient = list({
  access: readCampaignChildren,
  ui: { labelField: 'id', listView: { initialColumns: ['export', 'customer', 'channel'] } },
  fields: {
    export: relationship({ ref: 'CampaignExport.recipients', ...readOnly }),
    campaign: relationship({ ref: 'Campaign', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    contact: relationship({ ref: 'CustomerContact', ...readOnly }),
    channel: fixedChoice(['sms', 'email']),
    consent: relationship({ ref: 'ContactConsent', ...readOnly }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** Staff asked a customer for a review. One per repair order. */
export const ReviewRequest = list({
  access: readCampaigns,
  ui: { labelField: 'id', listView: { initialColumns: ['repairOrder', 'customer', 'channel', 'askedAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder', ...readOnly }),
    repairOrderKey: systemText({ indexed: 'unique', required: true }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    channel: fixedChoice(['call', 'text', 'email', 'in_person']),
    note: systemText(),
    askedAt: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
    askedBy: relationship({ ref: 'User', ...readOnly }),
  },
})
