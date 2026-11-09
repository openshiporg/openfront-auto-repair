import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, select, text, timestamp } from '@keystone-6/core/fields'
import { isSignedIn, permissions, sessionShopIds, type Session } from '../access'
import { choice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed, immutable, managed, serverOnly, shopScoped } from './listAccess'
import { auditedHooks } from './auditHooks'
import { trackingFields } from './trackingFields'

/*
 * Platform spine (SCHEMA §1, §2.9, §4.1-4.2, §16), ported from openfront-hedge-fund models/platform.ts.
 * Single tenant per deployment: one OrganizationSettings row; shops are rows and every operational
 * list carries `shop` (G1).
 */

export const OrganizationSettings = list({
  isSingleton: true,
  graphql: { plural: 'OrganizationSettingsItems' },
  access: { operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManageOrganization, delete: () => false } },
  hooks: auditedHooks('OrganizationSettings'),
  fields: {
    legalName: text({ validation: { isRequired: true }, defaultValue: 'Openfront Auto Repair' }),
    displayName: text({ validation: { isRequired: true }, defaultValue: 'Openfront Auto Repair' }),
    currencyCode: text({ defaultValue: 'USD', validation: { isRequired: true, match: { regex: /^[A-Z]{3}$/, explanation: 'ISO 4217 currency code' } }, ...readOnly }),
    defaultTimeZone: text({ defaultValue: 'America/Los_Angeles', validation: { isRequired: true } }),
    customerSharing: select({ type: 'string', options: ['shared_all_shops', 'per_shop'].map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: 'shared_all_shops', validation: { isRequired: true }, ...readOnly, ui: { ...readOnly.ui, description: 'Cross-shop visibility of customers. Changed through maker-checker.' } }),
    retentionYearsOverride: integer({ ...readOnly, validation: { min: 1, max: 30 }, ui: { ...readOnly.ui, description: 'Used when longer than the jurisdiction rule (CA: 4 years). Changed through maker-checker.' } }),
    strictAgentOwnerSoD: checkbox({ ...readOnly, defaultValue: true, ui: { ...readOnly.ui, description: "An agent's owner can't approve what the agent proposed." } }),
    version: versionField(),
    ...trackingFields,
  },
})

/** Shop visibility: canAccessAllShops sees every shop; everyone else sees the shops they belong to. */
const shopRowFilter = ({ session }: { session?: Session | null }) => {
  const ids = sessionShopIds(session)
  return ids === 'all' ? true : { id: { in: ids } }
}

export const Shop = list({
  access: {
    operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManageShops, delete: () => false },
    filter: { query: shopRowFilter, update: shopRowFilter },
  },
  hooks: auditedHooks('Shop'),
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'city', 'region', 'status'] } },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z]{2,5}$/, explanation: '2 to 5 capital letters, e.g. NGA' } } }),
    name: text({ validation: { isRequired: true } }),
    legalName: text({ validation: { isRequired: true } }),
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    region: text({ ui: { description: 'US state code (CA). Suggests the jurisdiction pack.' }, validation: { match: { regex: /^([A-Z]{2})?$/, explanation: 'Two-letter state code' } } }),
    postalCode: text(),
    country: text({ defaultValue: 'US' }),
    phone: text(),
    email: text(),
    website: text(),
    timeZone: text({ validation: { isRequired: true }, defaultValue: 'America/Los_Angeles' }),
    registrations: json({ defaultValue: {}, ui: { description: '{ barArd, epaId, sellerPermit, tireFeeAccount, batteryFeeAccount, other[] }: printed on estimates and invoices.' } }),
    calendar: relationship({ ref: 'ShopCalendar.shop' }),
    // The policy in force (SCHEMA §1.2). Set by publishPolicyVersion only; repair orders pin these at open.
    jurisdictionPack: relationship({ ref: 'JurisdictionPack', ...readOnly, ui: { ...readOnly.ui, description: 'The state rules this shop follows. Publishing a new version of the pack updates the version below.' } }),
    jurisdictionPolicy: relationship({ ref: 'JurisdictionPolicyVersion', ...readOnly }),
    shopPolicy: relationship({ ref: 'ShopPolicyVersion', ...readOnly }),
    laborRateClassSet: relationship({ ref: 'LaborRateClassSetVersion', ...readOnly }),
    laborMatrix: relationship({ ref: 'LaborMatrixVersion', ...readOnly }),
    partsMatrix: relationship({ ref: 'PartsMatrixVersion', ...readOnly }),
    feePolicy: relationship({ ref: 'FeePolicyVersion', ...readOnly }),
    taxRuleSet: relationship({ ref: 'TaxRuleSetVersion', ...readOnly }),
    warrantyTermSet: relationship({ ref: 'WarrantyTermSetVersion', ...readOnly }),
    bays: relationship({ ref: 'Bay.shop', many: true }),
    memberships: relationship({ ref: 'ShopMembership.shop', many: true, ...readOnly }),
    publicProfile: json({ defaultValue: {}, ui: { description: 'Read by the public API only (tagline, about, hours text, amenities).' } }),
    isPublished: checkbox({ defaultValue: false }),
    status: lifecycle(['active', 'suspended', 'closed']),
    version: versionField(),
    ...trackingFields,
  },
})

export const ShopMembership = list({
  access: shopScoped(managed('canAccessDashboard', 'canManagePeople')),
  hooks: auditedHooks('ShopMembership'),
  ui: { listView: { initialColumns: ['user', 'shop', 'role', 'isDefault', 'status'] } },
  fields: {
    user: relationship({ ref: 'User.memberships' }),
    shop: relationship({ ref: 'Shop.memberships' }),
    role: relationship({ ref: 'Role', ui: { description: 'Optional per-shop role. The user role applies when empty.' } }),
    isDefault: checkbox({ defaultValue: false }),
    status: lifecycle(['active', 'suspended', 'ended']),
    startedAt: timestamp({ defaultValue: { kind: 'now' } }),
    endedAt: timestamp(),
    ...trackingFields,
  },
})

export const ShopCalendar = list({
  access: shopScoped(managed('signedIn', 'canManageShops')),
  hooks: auditedHooks('ShopCalendar'),
  ui: { labelField: 'name' },
  fields: {
    shop: relationship({ ref: 'Shop.calendar' }),
    name: text({ validation: { isRequired: true } }),
    weeklyHours: json({ defaultValue: [], ui: { description: '[{ dow: 0-6 (Sunday 0), open: "07:30", close: "18:00" }] in the shop time zone.' } }),
    exceptions: relationship({ ref: 'ShopCalendarException.calendar', many: true }),
    coverageThrough: calendarDay({ ui: { description: 'Booking past this date is refused until the closures are reviewed.' } }),
    ...trackingFields,
  },
})

export const ShopCalendarException = list({
  access: shopScoped(managed('signedIn', 'canManageShops'), 'calendar.shop'),
  hooks: auditedHooks('ShopCalendarException'),
  ui: { labelField: 'date', listView: { initialColumns: ['calendar', 'date', 'closed', 'open', 'close', 'reason'] } },
  fields: {
    calendar: relationship({ ref: 'ShopCalendar.exceptions' }),
    date: calendarDay({ validation: { isRequired: true } }),
    closed: checkbox({ defaultValue: true }),
    open: text({ ui: { description: 'HH:mm when open with special hours' } }),
    close: text(),
    reason: text(),
    ...trackingFields,
  },
})

export const Bay = list({
  access: shopScoped(managed('signedIn', 'canManageShops')),
  hooks: auditedHooks('Bay'),
  ui: { labelField: 'code', listView: { initialColumns: ['shop', 'code', 'name', 'kind', 'active'] } },
  fields: {
    shop: relationship({ ref: 'Shop.bays' }),
    code: text({ validation: { isRequired: true } }),
    name: text(),
    kind: choice(['general', 'alignment', 'lift_heavy', 'quick_lube', 'tire', 'inspection'], 'general'),
    active: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const MachineCredential = list({
  access: governed('canManageAgents'),
  ui: { labelField: 'name' },
  fields: {
    name: text({ validation: { isRequired: true } }),
    hashedSecret: text({ access: { read: () => false, create: () => false, update: () => false }, ui: { itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' }, createView: { fieldMode: 'hidden' } } }),
    scopes: json({ ...readOnly, defaultValue: [] }),
    agent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly, ui: { ...readOnly.ui, description: 'Empty = all shops.' } }),
    lastUsedAt: timestamp({ ...readOnly }),
    revokedAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

/** Ported from hedge-fund; the grant, run and proposal lists arrive with Phase 8 (SCHEMA §14). */
export const AgentIdentity = list({
  access: governed('canAccessDashboard'),
  ui: { labelField: 'name' },
  fields: {
    name: text({ validation: { isRequired: true }, isIndexed: 'unique' }),
    kind: select({ type: 'string', options: ['llm_agent', 'voice_agent', 'rules_engine', 'external_mcp_client'].map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: 'llm_agent', validation: { isRequired: true }, ...readOnly }),
    modelRef: systemText(),
    owner: relationship({ ref: 'User', ...readOnly }),
    shops: relationship({ ref: 'Shop', many: true, ...readOnly }),
    paused: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Kill switch: a paused agent can read nothing and propose nothing.' } }),
    status: lifecycle(['active', 'paused', 'retired']),
    oauthApp: relationship({ ref: 'OAuthApp', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AuditEvent = list({
  access: immutable('canReadAudit'),
  ui: { labelField: 'eventType', listView: { initialColumns: ['seq', 'at', 'eventType', 'entityType', 'entityId', 'actorUser'], initialSort: { field: 'seq', direction: 'DESC' } } },
  fields: {
    seq: integer({ isIndexed: 'unique', validation: { isRequired: true }, ...readOnly }),
    eventKey: systemText({ indexed: 'unique', required: true }),
    eventType: systemText({ indexed: true, required: true }),
    entityType: systemText({ indexed: true, required: true }),
    entityId: systemText({ indexed: true, required: true }),
    actorUser: relationship({ ref: 'User', ...readOnly }),
    actorAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    approver: relationship({ ref: 'User', ...readOnly }),
    reason: systemText(),
    before: json({ ...readOnly }),
    after: json({ ...readOnly }),
    metadata: json({ ...readOnly }),
    requestId: systemText(),
    prevHash: systemText({ required: true }),
    hash: systemText({ indexed: 'unique', required: true }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

export const CommandReceipt = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    idempotencyKey: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    command: text({ validation: { isRequired: true } }),
    principalKey: text({ validation: { isRequired: true } }),
    requestHash: text({ validation: { isRequired: true } }),
    requestParams: json(),
    responseCode: text(),
    responseBody: json(),
    recoveryPoint: text({ defaultValue: 'completed' }),
    completedAt: timestamp({ defaultValue: { kind: 'now' } }),
    ...trackingFields,
  },
})

export const Lease = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    owner: text({ validation: { isRequired: true } }),
    fencingToken: integer({ defaultValue: 0, validation: { isRequired: true } }),
    expiresAt: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
})

/** Timer workers (no-show, hold expiry, obligation due dates). Renamed from hedge-fund `Job` (the domain has a Job). */
export const WorkerSchedule = list({
  access: governed('canReadAudit'),
  fields: {
    kind: systemText({ indexed: 'unique', required: true }),
    intervalSeconds: integer({ ...readOnly }),
    nextRunAt: timestamp({ ...readOnly }),
    lastRunAt: timestamp({ ...readOnly }),
    status: lifecycle(['idle', 'running', 'failed', 'disabled'], 'idle'),
    leaseKey: systemText(),
    lastError: systemText(),
    ...trackingFields,
  },
})

export const Sequence = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    nextValue: integer({ defaultValue: 1, validation: { isRequired: true } }),
  },
})

export const Notification = list({
  access: {
    operation: { query: permissions.canAccessDashboard, create: () => false, update: permissions.canAccessDashboard, delete: () => false },
    filter: {
      query: ({ session }) => (session ? { recipient: { id: { equals: session.itemId } } } : false),
      update: ({ session }) => (session ? { recipient: { id: { equals: session.itemId } } } : false),
    },
  },
  fields: {
    recipient: relationship({ ref: 'User', ...readOnly }),
    channel: choice(['in_app', 'email'], 'in_app'),
    template: systemText({ required: true }),
    payload: json({ ...readOnly }),
    status: lifecycle(['pending', 'sent', 'failed']),
    sentAt: timestamp({ ...readOnly }),
    readAt: timestamp(),
    ...trackingFields,
  },
})

const DOCUMENT_KINDS = [
  'inspection_photo', 'inspection_video', 'signature', 'work_order', 'invoice_pdf', 'estimate_pdf', 'call_recording', 'transcript',
  'exemption_certificate', 'supplier_invoice', 'packing_slip', 'third_party_estimate', 'import_file', 'export_file', 'other',
] as const

export const Document = list({
  access: shopScoped(governed('canAccessDashboard')),
  ui: { labelField: 'title' },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    title: systemText({ required: true }),
    kind: select({ type: 'string', options: DOCUMENT_KINDS.map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: 'other', validation: { isRequired: true }, ...readOnly }),
    visibility: select({ type: 'string', options: ['staff', 'customer_link', 'public'].map(value => ({ label: value.replaceAll('_', ' '), value })), defaultValue: 'staff', validation: { isRequired: true }, ...readOnly }),
    storageKey: systemText(),
    sha256: systemText(),
    mimeType: systemText(),
    bytes: integer({ ...readOnly }),
    documentVersion: integer({ defaultValue: 1, ...readOnly }),
    supersedes: relationship({ ref: 'Document', ...readOnly }),
    retentionUntil: calendarDay({ ...readOnly }),
    ...trackingFields,
  },
})

/** Generic due-date clocks (D§6.3): tire registration, teardown reassembly, core returns, credential expiry… */
export const Obligation = list({
  access: shopScoped(governed('canAccessDashboard')),
  ui: { labelField: 'kind', listView: { initialColumns: ['shop', 'kind', 'subjectType', 'dueAt', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    kind: select({
      type: 'string',
      options: ['tire_registration', 'teardown_reassembly', 'core_return', 'invoice_due', 'exemption_expiry', 'credential_expiry', 'reauthorization_wait', 'retention_purge'].map(value => ({ label: value.replaceAll('_', ' '), value })),
      validation: { isRequired: true },
      ...readOnly,
    }),
    subjectType: systemText({ required: true }),
    subjectId: systemText({ indexed: true, required: true }),
    dueAt: timestamp({ validation: { isRequired: true }, ...readOnly }),
    owner: relationship({ ref: 'User', ...readOnly }),
    ownerRole: systemText(),
    status: lifecycle(['open', 'met', 'waived', 'breached']),
    evidence: json({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ApprovalPolicy = list({
  access: { operation: { query: permissions.canAccessDashboard, create: permissions.canManageOrganization, update: () => false, delete: () => false } },
  ui: { labelField: 'action' },
  fields: {
    action: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    description: text(),
    requiredPermission: text({ validation: { isRequired: true } }),
    minApprovals: integer({ defaultValue: 1, validation: { min: 1 } }),
    thresholdMinor: minor(),
    expiresAfterMinutes: integer({ defaultValue: 1440 }),
    ...trackingFields,
  },
})

export const ApprovalRequest = list({
  access: governed('canAccessDashboard'),
  ui: { labelField: 'action', listView: { initialColumns: ['action', 'status', 'targetList', 'requestedBy', 'createdAt', 'expiresAt'] } },
  fields: {
    action: systemText({ indexed: true, required: true }),
    summary: systemText(),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    targetList: systemText({ required: true }),
    targetId: systemText({ indexed: true, required: true }),
    amountMinor: minor(),
    payload: json({ ...readOnly }),
    payloadHash: systemText({ required: true }),
    requiredPermission: systemText({ required: true }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    requestedByAgent: relationship({ ref: 'AgentIdentity', ...readOnly }),
    status: lifecycle(['pending', 'approved', 'rejected', 'expired', 'cancelled']),
    expiresAt: timestamp({ ...readOnly }),
    consumedAt: timestamp({ ...readOnly, ui: { ...readOnly.ui, description: 'When the approved action was carried out. An approval is used once.' } }),
    decisions: relationship({ ref: 'ApprovalDecision.request', many: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const ApprovalDecision = list({
  access: immutable('canAccessDashboard'),
  fields: {
    request: relationship({ ref: 'ApprovalRequest.decisions', ...readOnly }),
    decidedBy: relationship({ ref: 'User', ...readOnly }),
    decision: select({ type: 'string', options: ['approve', 'reject'].map(value => ({ label: value, value })), validation: { isRequired: true }, ...readOnly }),
    reason: systemText(),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

export const SecretBox = list({
  access: serverOnly,
  graphql: { omit: true },
  ui: { isHidden: true },
  fields: {
    key: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    ciphertext: text({ validation: { isRequired: true } }),
    iv: text({ validation: { isRequired: true } }),
    authTag: text({ validation: { isRequired: true } }),
    keyVersion: integer({ defaultValue: 1 }),
    rotatedAt: timestamp(),
    ...trackingFields,
  },
})
