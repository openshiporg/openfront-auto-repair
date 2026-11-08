import { list } from '@keystone-6/core'
import { checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, isSignedIn, permissions } from '../access'
import { centiHours, choice, lifecycle, minor, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { auditedHooks } from './auditHooks'
import { trackingFields } from './trackingFields'

/*
 * Inspections (SCHEMA §6.1-6.3, STATE-MACHINES §6) and the job catalog (SCHEMA §2.2a, §7.1-7.2, §17).
 * Template and canned-job versions follow the policy pattern: a published version never changes
 * (trigger), inspections and jobs pin the version they were made from.
 */

const sys = () => false

export const InspectionTemplate = list({
  access: { operation: { query: isSignedIn, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: sys } },
  hooks: auditedHooks('InspectionTemplate'),
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'kind', 'shop'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    kind: choice(['courtesy', 'multi_point', 'pre_purchase', 'state_safety', 'custom'], 'multi_point'),
    shop: relationship({ ref: 'Shop', ui: { description: 'Empty = every shop.' } }),
    versions: relationship({ ref: 'InspectionTemplateVersion.template', many: true, ...readOnly }),
    ...trackingFields,
  },
})

export const InspectionTemplateVersion = list({
  access: governed('signedIn'),
  ui: { labelField: 'versionNumber' },
  fields: {
    template: relationship({ ref: 'InspectionTemplate.versions', ...readOnly }),
    versionNumber: integer({ validation: { isRequired: true }, ...readOnly }),
    items: relationship({ ref: 'InspectionTemplateItem.templateVersion', many: true, ...readOnly }),
    status: lifecycle(['draft', 'published', 'retired']),
    publishedAt: timestamp({ ...readOnly }),
    retiredAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const InspectionTemplateItem = list({
  access: governed('signedIn'),
  ui: { labelField: 'label', listView: { initialColumns: ['templateVersion', 'section', 'label', 'sortOrder'] } },
  fields: {
    templateVersion: relationship({ ref: 'InspectionTemplateVersion.items', ...readOnly }),
    code: systemText({ required: true }),
    section: systemText({ required: true }),
    label: systemText({ required: true }),
    measurement: json({ ...readOnly, ui: { ...readOnly.ui, description: '{ unit, positions[], thresholds: [{ max|min, condition }] } — integer values in the unit (32nds of an inch, tenths of a mm).' } }),
    photoRequiredOn: json({ defaultValue: ['red'], ...readOnly }),
    cannedJobCode: systemText(),
    required: checkbox({ defaultValue: true, ...readOnly }),
    sortOrder: integer({ defaultValue: 0, ...readOnly }),
    ...trackingFields,
  },
})

export const Inspection = list({
  access: shopScoped(governed(['canReadRepairOrders', 'canPerformInspections']), 'repairOrder.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['repairOrder', 'technician', 'status', 'completedAt'] } },
  fields: {
    repairOrder: relationship({ ref: 'RepairOrder.inspections', ...readOnly }),
    templateVersion: relationship({ ref: 'InspectionTemplateVersion', ...readOnly }),
    technician: relationship({ ref: 'User', ...readOnly }),
    results: relationship({ ref: 'InspectionItemResult.inspection', many: true, ...readOnly }),
    startedAt: timestamp({ ...readOnly }),
    completedAt: timestamp({ ...readOnly }),
    sentAt: timestamp({ ...readOnly }),
    viewedAt: timestamp({ ...readOnly }),
    status: lifecycle(['assigned', 'in_progress', 'completed', 'sent', 'reviewed']),
    version: versionField(),
    ...trackingFields,
  },
})

export const InspectionItemResult = list({
  access: shopScoped(governed(['canReadRepairOrders', 'canPerformInspections']), 'inspection.repairOrder.shop'),
  ui: { labelField: 'id', listView: { initialColumns: ['inspection', 'templateItem', 'condition'] } },
  fields: {
    inspection: relationship({ ref: 'Inspection.results', ...readOnly }),
    templateItem: relationship({ ref: 'InspectionTemplateItem', ...readOnly }),
    condition: systemChoice(['not_inspected', 'green', 'yellow', 'red', 'na']),
    derivedCondition: systemChoice(['none', 'green', 'yellow', 'red']),
    overrideReason: systemText(),
    measurements: json({ defaultValue: [], ...readOnly }),
    notes: systemText(),
    media: relationship({ ref: 'Document', many: true, ...readOnly }),
    recommendedJobs: relationship({ ref: 'Job.inspectionItemResult', many: true, ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    recordedAt: timestamp({ ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/** The shop's own labor times (I§2.3, the shop-library adapter). No licensed guide content is stored here (G15). */
export const LaborOperation = list({
  access: { operation: { query: isSignedIn, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: sys } },
  hooks: auditedHooks('LaborOperation'),
  ui: { labelField: 'description', listView: { initialColumns: ['code', 'description', 'variant', 'centiHours', 'rateClassCode', 'active'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ui: { description: 'Empty = every shop.' } }),
    code: text({ validation: { isRequired: true, match: { regex: /^[A-Z0-9][A-Z0-9-]{1,39}$/, explanation: 'Capitals, digits and dashes, e.g. BRK-PAD-F' } } }),
    description: text({ validation: { isRequired: true } }),
    variant: text({ ui: { description: 'Distinguishes rows with the same code (e.g. "with electronic parking brake"). Several matching variants make pricing ask a person to choose.' } }),
    vehicleFilter: json({ defaultValue: {}, ui: { description: '{ makes?: string[], models?: string[], yearFrom?, yearTo?, engines?: string[] }; empty = all vehicles.' } }),
    centiHours: centiHours({ required: true, min: 1 }),
    skillLevel: choice(['a', 'b', 'c'], 'b'),
    rateClassCode: choice(['general', 'diagnostic', 'electrical', 'european', 'fleet', 'warranty_internal'], 'general'),
    includes: json({ defaultValue: [] }),
    overlaps: json({ defaultValue: [], ui: { description: '[{ operationCode, deductCentiHours }]' } }),
    source: choice(['shop_time', 'imported', 'tech_estimate'], 'shop_time'),
    active: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const CannedJob = list({
  access: { operation: { query: isSignedIn, create: sys, update: sys, delete: sys } },
  ui: { labelField: 'name', listView: { initialColumns: ['code', 'name', 'category', 'active'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    code: systemText({ required: true }),
    name: systemText({ required: true }),
    category: systemText(),
    active: checkbox({ defaultValue: true, ...readOnly }),
    versions: relationship({ ref: 'CannedJobVersion.cannedJob', many: true, ...readOnly }),
    currentVersion: relationship({ ref: 'CannedJobVersion', ...readOnly }),
    ...trackingFields,
  },
})

export const CannedJobVersion = list({
  access: governed('signedIn'),
  ui: { labelField: 'versionNumber' },
  fields: {
    cannedJob: relationship({ ref: 'CannedJob.versions', ...readOnly }),
    versionNumber: integer({ validation: { isRequired: true }, ...readOnly }),
    kind: systemChoice(['repair', 'maintenance', 'diagnosis', 'inspection', 'teardown', 'tire', 'sublet']),
    // Template lines can carry part cost: visible to cost and catalog managers only.
    lines: json({ defaultValue: [], ...readOnly, access: { read: anyOf('canSeeCost', 'canManagePolicies') as (args: any) => boolean, create: () => false, update: () => false }, ui: { ...readOnly.ui, description: 'Line templates: { kind: labor, operationCode | description, centiHours, rateClass } · { kind: part, description, partCategory, condition, quantityMilli, unitCostMinor? } · { kind: sublet, … }' } }),
    customerDescription: systemText(),
    defaultWarrantyCode: systemText(),
    notes: systemText(),
    author: relationship({ ref: 'User', ...readOnly }),
    publishedBy: relationship({ ref: 'User', ...readOnly }),
    publishedAt: timestamp({ ...readOnly }),
    retiredAt: timestamp({ ...readOnly }),
    status: lifecycle(['draft', 'published', 'retired']),
    version: versionField(),
    ...trackingFields,
  },
})

export const ServiceMenuItem = list({
  access: shopScoped({ operation: { query: isSignedIn, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: sys } }),
  hooks: auditedHooks('ServiceMenuItem'),
  ui: { labelField: 'name', listView: { initialColumns: ['shop', 'name', 'fixedPriceMinor', 'publishable'] } },
  fields: {
    shop: relationship({ ref: 'Shop' }),
    name: text({ validation: { isRequired: true } }),
    fixedPriceMinor: minor({ description: 'A menu price in cents (optional). Line pricing still runs; the difference is a discount line.' }),
    cannedJob: relationship({ ref: 'CannedJob' }),
    vehicleFilter: json({ defaultValue: {} }),
    publishable: checkbox({ defaultValue: false }),
    ...trackingFields,
  },
})

/** What the storefront (Phase S) will list. Data only; no customer screen is built here. */
export const PublishedService = list({
  access: shopScoped({ operation: { query: isSignedIn, create: permissions.canManagePolicies, update: permissions.canManagePolicies, delete: sys } }),
  hooks: auditedHooks('PublishedService'),
  ui: { labelField: 'name', listView: { initialColumns: ['shop', 'name', 'slug', 'fromPriceMinor', 'isPublished'] } },
  fields: {
    shop: relationship({ ref: 'Shop' }),
    name: text({ validation: { isRequired: true } }),
    slug: text({ validation: { isRequired: true, match: { regex: /^[a-z0-9]+(-[a-z0-9]+)*$/, explanation: 'lower-case words joined by dashes' } } }),
    description: text({ ui: { displayMode: 'textarea' } }),
    fromPriceMinor: minor(),
    estimatedCentiHours: centiHours({ min: 0 }),
    bookable: checkbox({ defaultValue: true }),
    cannedJob: relationship({ ref: 'CannedJob' }),
    sortOrder: integer({ defaultValue: 0 }),
    isPublished: checkbox({ defaultValue: false }),
    ...trackingFields,
  },
})

