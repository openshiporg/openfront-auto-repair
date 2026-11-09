import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'
import { graphql } from '@keystone-6/core'
import { anyOf, permissions, sessionShopIds, type Session } from '../access'
import { choice, fixedChoice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed, immutable } from './listAccess'
import { auditedHooks } from './auditHooks'
import { trackingFields } from './trackingFields'

/*
 * Customers and vehicles (SCHEMA §3). Customers and vehicles belong to the organisation, not a single
 * shop: a customer of Northgate Auto Care is the same customer at Northgate Tire & Lube.
 * - OrganizationSettings.customerSharing = per_shop limits visibility to customers whose home shop
 *   is one of yours.
 * - Contact values and addresses are personal data. They are readable only with canReadCustomerPII;
 *   technicians see names and vehicles (G12).
 * - Identity-bearing fields (VIN, contact values, ownership, odometer, consent) change only through
 *   commands, which validate, de-duplicate and audit.
 */

type Args = { session?: Session | null; context?: any }
const sys = () => false
const readCustomers = anyOf('canReadRepairOrders', 'canManageCustomers', 'canReadCustomerPII')
const pii = { read: anyOf('canReadCustomerPII') as (args: any) => boolean, create: sys, update: sys }

/** per_shop sharing: only customers whose home shop is one of yours (or who have no home shop yet). */
async function customerFilter({ session, context }: Args) {
  const ids = sessionShopIds(session)
  if (ids === 'all') return true
  const org = await context.sudo().prisma.organizationSettings.findUnique({ where: { id: 1 }, select: { customerSharing: true } })
  if (org?.customerSharing !== 'per_shop') return true
  return { OR: [{ homeShop: { id: { in: ids } } }, { homeShop: null }] }
}

export const Customer = list({
  access: {
    operation: { query: readCustomers, create: permissions.canManageCustomers, update: permissions.canManageCustomers, delete: sys },
    filter: { query: customerFilter, update: customerFilter },
  },
  hooks: auditedHooks('Customer'),
  ui: { labelField: 'displayName', listView: { initialColumns: ['displayName', 'kind', 'homeShop', 'status', 'createdAt'] } },
  fields: {
    kind: choice(['person', 'business'], 'person'),
    firstName: text(),
    lastName: text({ isIndexed: true }),
    companyName: text(),
    displayName: text({ isIndexed: true, ...readOnly, ui: { ...readOnly.ui, description: 'Kept in step with the names by the server.' } }),
    contacts: relationship({ ref: 'CustomerContact.customer', many: true, ...readOnly }),
    addresses: json({ defaultValue: [], access: { read: anyOf('canReadCustomerPII'), create: permissions.canManageCustomers, update: permissions.canManageCustomers } }),
    preferredChannel: choice(['sms', 'email', 'phone'], 'sms'),
    preferredLanguage: text({ defaultValue: 'en' }),
    homeShop: relationship({ ref: 'Shop' }),
    businessAccount: relationship({ ref: 'BusinessAccount.customers' }),
    ownerships: relationship({ ref: 'VehicleOwnership.customer', many: true, ...readOnly }),
    appointments: relationship({ ref: 'Appointment.customer', many: true, ...readOnly }),
    tags: json({ defaultValue: [] }),
    notes: text({ ui: { displayMode: 'textarea', description: 'Staff only. Never shown to the customer.' } }),
    marketingSource: text(),
    status: lifecycle(['active', 'merged', 'archived']),
    mergedInto: relationship({ ref: 'Customer', ...readOnly }),
    noShowCount: integer({ defaultValue: 0, ...readOnly }),
    portalUser: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const CustomerContact = list({
  access: governed(['canReadRepairOrders', 'canManageCustomers', 'canReadCustomerPII']),
  ui: { labelField: 'label', listView: { initialColumns: ['customer', 'kind', 'label', 'isPrimary', 'status'] } },
  fields: {
    customer: relationship({ ref: 'Customer.contacts', ...readOnly }),
    kind: fixedChoice(['mobile', 'landline', 'email']),
    value: text({ access: pii, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    // Keyed hash (HMAC under AUTO_SECRET_KEY). Not in the API at all: not readable, filterable or sortable by any role (review r2 F2).
    valueHash: text({ isIndexed: true, validation: { isRequired: true }, graphql: { omit: true }, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'hidden' }, listView: { fieldMode: 'hidden' } } }),
    label: systemText(),
    isPrimary: checkbox({ defaultValue: false, ...readOnly }),
    verifiedAt: timestamp({ ...readOnly }),
    status: lifecycle(['active', 'bounced', 'invalid']),
    consents: relationship({ ref: 'ContactConsent.contact', many: true, ...readOnly }),
    ...trackingFields,
  },
})

/** Append-only consent events (dealership CustomerContactPreferenceEvent). The latest per channel and purpose wins. */
export const ContactConsent = list({
  access: immutable(['canManageCustomers', 'canReadCustomerPII', 'canMessageCustomers']),
  ui: { listView: { initialColumns: ['contact', 'channel', 'purpose', 'action', 'method', 'at'] } },
  fields: {
    contact: relationship({ ref: 'CustomerContact.consents', ...readOnly }),
    channel: fixedChoice(['sms', 'email', 'voice']),
    purpose: fixedChoice(['transactional', 'marketing', 'all']),
    action: fixedChoice(['granted', 'revoked']),
    method: fixedChoice(['web_form', 'in_person_form', 'keyword_reply', 'staff_recorded', 'import', 'classifier_review']),
    evidence: json({ ...readOnly }),
    writtenConsent: checkbox({ defaultValue: false, ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ validation: { isRequired: true }, defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

export const CustomerMergeEvent = list({
  access: immutable(['canManageCustomers', 'canReadAudit']),
  fields: {
    survivor: relationship({ ref: 'Customer', ...readOnly }),
    merged: relationship({ ref: 'Customer', ...readOnly }),
    movedCounts: json({ ...readOnly }),
    reason: systemText(),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    approvedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
  },
})

/** Fleet and commercial accounts: the basics in Phase 1; terms, credit hold and approvers arrive in Phase 6. */
export const BusinessAccount = list({
  access: { operation: { query: readCustomers, create: permissions.canManageCustomers, update: permissions.canManageCustomers, delete: sys } },
  hooks: auditedHooks('BusinessAccount'),
  ui: { labelField: 'name', listView: { initialColumns: ['accountNumber', 'name', 'termsDays', 'poRequired', 'status'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    accountNumber: systemText({ indexed: 'unique', required: true }),
    customers: relationship({ ref: 'Customer.businessAccount', many: true }),
    termsDays: integer({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 120 }, ui: { description: '0 = due on receipt; 30 = Net 30.' } }),
    creditLimitMinor: minor({ defaultValue: 0n }),
    poRequired: checkbox({ defaultValue: false }),
    taxExempt: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'Set when an active exemption certificate is on file (Phase 6).' } }),
    billingMode: choice(['per_invoice', 'statement_monthly'], 'per_invoice'),
    holdAfterOverdueDays: integer({ defaultValue: 30, validation: { min: 1 } }),
    openBalanceMinor: minor({ defaultValue: 0n }),
    intermediary: choice(['none', 'fleet_management_company'], 'none'),
    intermediaryName: text(),
    status: lifecycle(['active', 'prospect', 'credit_hold', 'closed']),
    version: versionField(),
    ...trackingFields,
  },
})

export const Vehicle = list({
  access: {
    operation: { query: anyOf('canReadRepairOrders', 'canManageCustomers'), create: sys, update: permissions.canManageCustomers, delete: sys },
  },
  hooks: auditedHooks('Vehicle'),
  ui: { labelField: 'label', listView: { initialColumns: ['label', 'vin', 'vinValid', 'lastOdometer', 'status'] } },
  fields: {
    label: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve: (item: any) => [item.year, item.make, item.model, item.trim].filter(Boolean).join(' ') || item.vin || 'Vehicle',
      }),
    }),
    vin: text({ isIndexed: true, ...readOnly, ui: { ...readOnly.ui, description: 'Changed only through the vehicle command (normalised, check digit verified).' } }),
    vinValid: fixedChoice(['none', 'valid', 'check_digit_warning', 'invalid_format']),
    noVinReason: systemText(),
    year: integer({ validation: { min: 1900, max: 2100 } }),
    make: text(),
    model: text(),
    trim: text(),
    engine: text(),
    drivetrain: text(),
    transmission: text(),
    fuelType: text(),
    bodyClass: text(),
    color: text(),
    currentDecode: relationship({ ref: 'VehicleDecode', ...readOnly }),
    decodes: relationship({ ref: 'VehicleDecode.vehicle', many: true, ...readOnly }),
    recallChecks: relationship({ ref: 'RecallCheck.vehicle', many: true, ...readOnly }),
    ownerships: relationship({ ref: 'VehicleOwnership.vehicle', many: true, ...readOnly }),
    plates: relationship({ ref: 'PlateRegistration.vehicle', many: true, ...readOnly }),
    odometerReadings: relationship({ ref: 'OdometerReading.vehicle', many: true, ...readOnly }),
    appointments: relationship({ ref: 'Appointment.vehicle', many: true, ...readOnly }),
    lastOdometer: integer({ ...readOnly }),
    lastOdometerUnit: choice(['mi', 'km'], 'mi'),
    tireSpec: json({ defaultValue: {}, ui: { description: '{ front, rear, staggered, tpms }' } }),
    maintenanceIntervals: json({ defaultValue: {} }),
    notes: text({ ui: { displayMode: 'textarea' } }),
    status: lifecycle(['active', 'sold', 'scrapped', 'merged']),
    version: versionField(),
    ...trackingFields,
  },
})

/** Immutable decode snapshot (NHTSA vPIC or manual). */
export const VehicleDecode = list({
  access: immutable(['canReadRepairOrders', 'canManageCustomers']),
  ui: { listView: { initialColumns: ['vehicle', 'provider', 'requestedVin', 'errorCode', 'fetchedAt'] } },
  fields: {
    vehicle: relationship({ ref: 'Vehicle.decodes', ...readOnly }),
    provider: fixedChoice(['nhtsa_vpic', 'fixture', 'labor_guide', 'parts_catalog', 'manual']),
    requestedVin: systemText({ indexed: true, required: true }),
    decoded: json({ ...readOnly }),
    errorCode: systemText(),
    errorText: systemText(),
    fetchedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    fetchedBy: relationship({ ref: 'User', ...readOnly }),
  },
})

export const VehicleOwnership = list({
  access: governed(['canReadRepairOrders', 'canManageCustomers']),
  ui: { listView: { initialColumns: ['vehicle', 'customer', 'businessAccount', 'role', 'startedAt', 'endedAt'] } },
  fields: {
    vehicle: relationship({ ref: 'Vehicle.ownerships', ...readOnly }),
    customer: relationship({ ref: 'Customer.ownerships', ...readOnly }),
    businessAccount: relationship({ ref: 'BusinessAccount', ...readOnly }),
    role: fixedChoice(['owner', 'driver', 'lessee']),
    startedAt: calendarDay({ ...readOnly }),
    endedAt: calendarDay({ ...readOnly }),
    ...trackingFields,
  },
})

export const PlateRegistration = list({
  access: governed(['canReadRepairOrders', 'canManageCustomers']),
  ui: { labelField: 'plate', listView: { initialColumns: ['vehicle', 'state', 'plate', 'active', 'lastSeenAt'] } },
  fields: {
    vehicle: relationship({ ref: 'Vehicle.plates', ...readOnly }),
    plate: systemText({ required: true }),
    state: systemText({ required: true }),
    firstSeenAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    lastSeenAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    active: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

/** Immutable odometer history. A reading lower than the last one is accepted only with a reason (I-V2). */
export const OdometerReading = list({
  access: immutable(['canReadRepairOrders', 'canManageCustomers']),
  ui: { listView: { initialColumns: ['vehicle', 'value', 'unit', 'source', 'anomaly', 'at'] } },
  fields: {
    vehicle: relationship({ ref: 'Vehicle.odometerReadings', ...readOnly }),
    value: integer({ validation: { isRequired: true, min: 0 }, ...readOnly }),
    unit: fixedChoice(['mi', 'km']),
    source: fixedChoice(['ro_in', 'ro_out', 'customer', 'import', 'telematics']),
    checkIn: relationship({ ref: 'CheckIn', ...readOnly }),
    recordedBy: relationship({ ref: 'User', ...readOnly }),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    accepted: checkbox({ defaultValue: true, ...readOnly }),
    anomaly: fixedChoice(['none', 'lower_than_previous', 'jump']),
    overrideReason: systemText(),
  },
})

/** Immutable recall snapshot. Make/model/year matches are "possible recalls", not VIN-confirmed (R§12.3). */
export const RecallCheck = list({
  access: immutable(['canReadRepairOrders', 'canManageCustomers']),
  ui: { listView: { initialColumns: ['vehicle', 'source', 'campaignCount', 'parkItAny', 'checkedAt'] } },
  fields: {
    vehicle: relationship({ ref: 'Vehicle.recallChecks', ...readOnly }),
    source: fixedChoice(['nhtsa_make_model_year', 'fixture', 'oem_vin']),
    query: json({ ...readOnly }),
    campaigns: json({ ...readOnly }),
    campaignCount: integer({ defaultValue: 0, ...readOnly }),
    parkItAny: checkbox({ defaultValue: false, ...readOnly, ui: { ...readOnly.ui, description: 'A campaign says do not drive, or park outside.' } }),
    checkedAt: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    checkedBy: relationship({ ref: 'User', ...readOnly }),
  },
})

export const ExternalReference = list({
  access: governed(['canManageIntegrations', 'canReadAudit']),
  fields: {
    entityType: systemText({ required: true }),
    entityId: systemText({ indexed: true, required: true }),
    system: fixedChoice(['partstech', 'motor', 'alldata', 'nexpart', 'quickbooks', 'stripe', 'twilio', 'carfax', 'tekmetric_import', 'shopmonkey_import']),
    externalId: systemText({ required: true }),
    meta: json({ ...readOnly }),
    ...trackingFields,
  },
})
