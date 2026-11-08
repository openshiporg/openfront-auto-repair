import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { isSignedIn, permissions } from '../access'
import { choice, conf, fac, lifecycle, minor, pct, readOnly, versionField } from './domainFields'
import { auditedHooks } from './auditHooks'
import { trackingFields } from './trackingFields'

/*
 * Policy: versioned configuration (SCHEMA §2, "law is data"). Every policy has versions that move
 * draft → published → retired.
 * - Drafts are made by createPolicyDraft (a copy of the current published version) and edited here
 *   while they are drafts.
 * - publishPolicyVersion publishes them; the author can't publish their own draft when someone
 *   else can (maker-checker).
 * - Published versions never change. The access filter only lets drafts be updated, and the
 *   `deny_published_policy_change` trigger refuses any other change, even through raw SQL.
 * - Repair orders pin the version ids at open (Phase 2).
 */

const sys = () => false
const draftOnly = () => ({ status: { equals: 'draft' } })

/** Access for a version list: read with `read`; drafts edited with canManagePolicies; created and published by commands only. */
const versionAccess = (read: (args: any) => boolean = isSignedIn) => ({
  operation: { query: read, create: sys, update: permissions.canManagePolicies, delete: sys },
  filter: { update: draftOnly },
})

/** Access for the rows of a version (fee rules, tax rules, rate classes, warranty terms): editable while the version is a draft. */
const childAccess = (parent: string, read: (args: any) => boolean = isSignedIn) => ({
  operation: { query: read, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: permissions.canManagePolicies },
  filter: { update: () => ({ [parent]: { status: { equals: 'draft' } } }), delete: () => ({ [parent]: { status: { equals: 'draft' } } }) },
})

/** Refuses rows added to a published or retired version with a clear message (the trigger refuses it too). */
const childOfDraft = (entityType: string, parent: string, parentList: string) => ({
  ...auditedHooks(entityType),
  validateInput: async ({ operation, resolvedData, item, context, addValidationError }: any) => {
    if (operation !== 'create' && operation !== 'update') return
    const parentId = resolvedData?.[parent]?.connect?.id ?? item?.[`${parent}Id`]
    if (!parentId) return addValidationError(`Choose the ${parent} this belongs to.`)
    const delegate = (context.sudo().prisma as any)[parentList[0].toLowerCase() + parentList.slice(1)]
    const row = await delegate.findUnique({ where: { id: parentId }, select: { status: true } })
    if (row?.status !== 'draft') addValidationError('This version is published. Make a new draft to change it.')
  },
})

const versionFields = () => ({
  versionNumber: integer({ validation: { isRequired: true }, ...readOnly }),
  status: lifecycle(['draft', 'published', 'retired']),
  notes: text({ ui: { displayMode: 'textarea', description: 'What changed and why. Shown in the version history.' } }),
  basedOnId: text({ ...readOnly, ui: { ...readOnly.ui, description: 'The version this draft was copied from.' } }),
  author: relationship({ ref: 'User', ...readOnly }),
  publishedBy: relationship({ ref: 'User', ...readOnly }),
  publishedAt: timestamp({ ...readOnly }),
  effectiveFrom: timestamp({ ...readOnly }),
  retiredAt: timestamp({ ...readOnly }),
  version: versionField(),
  ...trackingFields,
})

const shopOf = () => relationship({ ref: 'Shop', ...readOnly })
const versionUi = (extra: string[] = []) => ({ labelField: 'versionNumber', listView: { initialColumns: ['versionNumber', ...extra, 'status', 'publishedAt', 'author'] } })

export const JurisdictionPack = list({
  access: { operation: { query: isSignedIn, create: permissions.canManageOrganization, update: permissions.canManagePolicies, delete: sys } },
  hooks: auditedHooks('JurisdictionPack'),
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'verified'] } },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[A-Z]{2}-[A-Z0-9]{1,3}$/, explanation: 'Country and region, e.g. US-CA' } } }),
    name: text({ validation: { isRequired: true } }),
    country: text({ defaultValue: 'US' }),
    region: text(),
    verified: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Checked against the statute and regulator guidance. Unverified packs show a warning everywhere they are used.' } }),
    sourceRefs: json({ defaultValue: [], ui: { description: '[{ title, url, note }] citations.' } }),
    versions: relationship({ ref: 'JurisdictionPolicyVersion.pack', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const JurisdictionPolicyVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('JurisdictionPolicyVersion'),
  ui: versionUi(['pack']),
  fields: {
    pack: relationship({ ref: 'JurisdictionPack.versions', ...readOnly }),
    estimateThresholdMinor: minor({ description: 'Written estimate needed above this amount. Empty = every job (CA §3353).' }),
    writtenEstimateWaiverAllowed: checkbox({ defaultValue: false }),
    waiverFormText: text({ ui: { displayMode: 'textarea' } }),
    allowedAuthorizationMethods: json({ defaultValue: [], ui: { description: 'in_person_signature, written_form, oral_phone, electronic_link, fleet_portal, fleet_po' } }),
    authorizationEvidenceRules: json({ defaultValue: {}, ui: { description: '{ method: [required evidence fields] }' } }),
    toleranceRule: json({ defaultValue: { kind: 'fixed', fixedMinor: '0', includesTax: true }, ui: { description: '{ kind: fixed|percent|max_of|min_of, percent, fixedMinor, capMinor, includesTax }: how far a final charge may exceed the authorized amount.' } }),
    requireOdometerIn: checkbox({ defaultValue: true }),
    requireOdometerOut: checkbox({ defaultValue: true }),
    requireSignedWorkOrder: checkbox({ defaultValue: true }),
    requirePartCondition: checkbox({ defaultValue: true }),
    crashPartOemDefault: checkbox({ defaultValue: true }),
    shopSuppliesGenericAllowed: checkbox({ defaultValue: false, ui: { description: 'A generic shop-supplies percentage fee. CA: not allowed.' } }),
    replacedPartsOfferRequired: checkbox({ defaultValue: true }),
    replacedPartsOfferText: text({ ui: { displayMode: 'textarea' } }),
    nonReturnableNoteText: text({ ui: { displayMode: 'textarea' } }),
    teardownRules: json({ defaultValue: { required: true, maxReassemblyDaysDefault: 3, disclosureText: '' } }),
    designeeRules: json({ defaultValue: {} }),
    thirdPartyPayorNoticeText: text({ ui: { displayMode: 'textarea' } }),
    towingSeparateAuthorization: checkbox({ defaultValue: true }),
    subletDisclosureRequired: checkbox({ defaultValue: true }),
    invoiceRequiredFields: json({ defaultValue: [] }),
    recordRetentionYears: integer({ defaultValue: 4, validation: { isRequired: true, min: 1, max: 30 } }),
    surchargeAllowed: checkbox({ defaultValue: false }),
    requiredNotices: json({ defaultValue: [], ui: { description: '[{ key, text, where: estimate|invoice|work_order }]' } }),
    ...versionFields(),
  },
})

export const TaxCategory = list({
  access: { operation: { query: isSignedIn, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: sys } },
  hooks: auditedHooks('TaxCategory'),
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name'] } },
  fields: {
    code: text({ isIndexed: 'unique', validation: { isRequired: true, match: { regex: /^[a-z][a-z0-9_]*$/, explanation: 'lower_snake_case' } } }),
    name: text({ validation: { isRequired: true } }),
    description: text(),
    ...trackingFields,
  },
})

export const LaborRateClassSetVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('LaborRateClassSetVersion'),
  ui: versionUi(['shop']),
  fields: { shop: shopOf(), classes: relationship({ ref: 'LaborRateClass.set', many: true }), ...versionFields() },
})

export const LaborRateClass = list({
  access: childAccess('set'),
  hooks: childOfDraft('LaborRateClass', 'set', 'LaborRateClassSetVersion'),
  ui: { labelField: 'name', listView: { initialColumns: ['set', 'code', 'name', 'rateMinor', 'isDefault'] } },
  fields: {
    set: relationship({ ref: 'LaborRateClassSetVersion.classes' }),
    code: choice(['general', 'diagnostic', 'electrical', 'european', 'fleet', 'warranty_internal'], 'general'),
    name: text({ validation: { isRequired: true } }),
    rateMinor: minor({ required: true, description: 'Price per hour in cents.' }),
    taxCategory: relationship({ ref: 'TaxCategory' }),
    isDefault: checkbox({ defaultValue: false }),
    ...trackingFields,
  },
})

export const LaborMatrixVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('LaborMatrixVersion'),
  ui: versionUi(['shop']),
  fields: {
    shop: shopOf(),
    bands: json({ defaultValue: [], ui: { description: '[{ minCentiHours, maxCentiHours, rateMinor? | multiplier? }]' } }),
    appliesToClasses: json({ defaultValue: [] }),
    ...versionFields(),
  },
})

export const PartsMatrixVersion = list({
  access: versionAccess(permissions.canSeeCost),
  hooks: auditedHooks('PartsMatrixVersion'),
  ui: versionUi(['shop']),
  fields: {
    shop: shopOf(),
    tiers: json({ defaultValue: [], ui: { description: '[{ minCostMinor, maxCostMinor, multiplier }]: cost brackets and their markup multipliers.' } }),
    categoryOverrides: json({ defaultValue: {} }),
    supplierOverrides: json({ defaultValue: {} }),
    marginFloorPct: pct({ defaultValue: '0.300000', description: 'Pricing a part below this gross margin needs a manager (price.override).' }),
    ...versionFields(),
  },
})

export const FeePolicyVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('FeePolicyVersion'),
  ui: versionUi(['shop']),
  fields: { shop: shopOf(), rules: relationship({ ref: 'FeeRule.policy', many: true }), ...versionFields() },
})

export const FeeRule = list({
  access: childAccess('policy'),
  hooks: childOfDraft('FeeRule', 'policy', 'FeePolicyVersion'),
  ui: { labelField: 'code', listView: { initialColumns: ['policy', 'code', 'kind', 'base', 'flatMinor', 'perUnitMinor', 'percent'] } },
  fields: {
    policy: relationship({ ref: 'FeePolicyVersion.rules' }),
    code: choice(['shop_supplies_pct', 'haz_waste', 'ca_tire_fee', 'ca_battery_fee', 'battery_deposit', 'env_fee', 'diag_fee_credit'], 'haz_waste'),
    kind: choice(['percent_of_base', 'flat_per_ro', 'per_unit'], 'flat_per_ro'),
    base: choice(['labor', 'parts', 'labor_and_parts', 'units_of_item_category'], 'labor_and_parts'),
    percent: pct(),
    flatMinor: minor(),
    perUnitMinor: minor(),
    minMinor: minor(),
    maxMinor: minor(),
    itemCategory: text({ ui: { description: 'For per-unit fees, e.g. tire_new or battery_lead_acid.' } }),
    taxTreatment: choice(['follow_base', 'taxable', 'non_taxable'], 'follow_base'),
    separatelyStated: checkbox({ defaultValue: true }),
    refundable: checkbox({ defaultValue: false }),
    refundWindowDays: integer({ validation: { min: 0 } }),
    invoiceText: text(),
    ...trackingFields,
  },
})

export const TaxRuleSetVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('TaxRuleSetVersion'),
  ui: versionUi(['shop']),
  fields: {
    shop: shopOf(),
    rounding: choice(['per_line', 'per_invoice_category'], 'per_line'),
    rules: relationship({ ref: 'TaxRule.ruleSet', many: true }),
    ...versionFields(),
  },
})

export const TaxRule = list({
  access: childAccess('ruleSet'),
  hooks: childOfDraft('TaxRule', 'ruleSet', 'TaxRuleSetVersion'),
  ui: { labelField: 'id', listView: { initialColumns: ['ruleSet', 'category', 'taxable', 'rate'] } },
  fields: {
    ruleSet: relationship({ ref: 'TaxRuleSetVersion.rules' }),
    category: relationship({ ref: 'TaxCategory' }),
    taxable: checkbox({ defaultValue: true }),
    rate: pct({ defaultValue: '0.000000', description: 'Combined state and district rate as a fraction: 0.0875 = 8.75%.' }),
    coreChargeRule: choice(['taxable_always', 'refund_refunds_tax'], 'refund_refunds_tax'),
    warrantyDeductibleRule: choice(['none', 'parts_share'], 'none'),
    ...trackingFields,
  },
})

export const WarrantyTermSetVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('WarrantyTermSetVersion'),
  ui: versionUi(['shop']),
  fields: { shop: shopOf(), terms: relationship({ ref: 'WarrantyTerm.termSet', many: true }), ...versionFields() },
})

export const WarrantyTerm = list({
  access: childAccess('termSet'),
  hooks: childOfDraft('WarrantyTerm', 'termSet', 'WarrantyTermSetVersion'),
  ui: { labelField: 'name', listView: { initialColumns: ['termSet', 'code', 'name', 'months', 'miles'] } },
  fields: {
    termSet: relationship({ ref: 'WarrantyTermSetVersion.terms' }),
    code: text({ validation: { isRequired: true, match: { regex: /^[a-z][a-z0-9_]*$/, explanation: 'lower_snake_case' } } }),
    name: text({ validation: { isRequired: true } }),
    months: integer({ validation: { isRequired: true, min: 0 } }),
    miles: integer({ validation: { isRequired: true, min: 0 } }),
    appliesTo: json({ defaultValue: [] }),
    invoiceText: text({ ui: { displayMode: 'textarea' } }),
    ...trackingFields,
  },
})

export const ShopPolicyVersion = list({
  access: versionAccess(),
  hooks: auditedHooks('ShopPolicyVersion'),
  ui: versionUi(['shop']),
  fields: {
    shop: shopOf(),
    flagHoursAt: choice(['job_completed', 'invoice_finalized'], 'job_completed'),
    comebackPayRule: choice(['reverse', 'keep'], 'reverse'),
    allowConcurrentJobClocks: checkbox({ defaultValue: false }),
    tinPendingAllowed: checkbox({ defaultValue: false, ui: { description: 'Allow a new-tire sale to be invoiced before every tire number is recorded. The numbers stay owed on the registration.' } }),
    requireQualityCheck: checkbox({ defaultValue: true }),
    diagnosisTrustThreshold: conf({ defaultValue: '0.7000', description: 'Diagnosis confidence needed before a diagnosis-based job can be quoted (0 to 1).' }),
    authorizationLinkTtlHours: integer({ defaultValue: 72, validation: { isRequired: true, min: 1, max: 720 } }),
    promisedTimeRequired: checkbox({ defaultValue: true }),
    noShowGraceMinutes: integer({ defaultValue: 30, validation: { isRequired: true, min: 0, max: 240 } }),
    discountLimitPctByRole: json({ defaultValue: { seed_role_advisor: '0.10' } }),
    refundApprovalMinor: minor({ defaultValue: 0n }),
    creditMemoApprovalMinor: minor({ defaultValue: 5000n }),
    agentOrderLimitMinor: minor({ defaultValue: 0n, description: 'Agents may not place parts orders above this. 0 = never.' }),
    agentAutonomy: json({ defaultValue: {}, ui: { description: 'Changing this needs a second person with canApproveAgentAutonomy to publish.' } }),
    proposalConfirmGranularity: choice(['per_step', 'per_plan'], 'per_step'),
    declinedSafetyFollowUpPurpose: choice(['marketing', 'transactional'], 'marketing'),
    followUpCadenceDays: json({ defaultValue: [3, 30, 90] }),
    depositPolicy: json({ defaultValue: {} }),
    surchargePolicy: json({ defaultValue: { enabled: false } }),
    inspectionClockMode: choice(['job', 'shift'], 'job'),
    markupFactorDefault: fac({ defaultValue: '1.000000', description: 'Reserved for the parts matrix fallback.' }),
    ...versionFields(),
  },
})
