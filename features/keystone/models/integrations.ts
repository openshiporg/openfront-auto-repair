import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { lifecycle, minor, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { anyOf } from '../access'
import { governed, immutable, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Reporting, accounting export, imports and integrations (SCHEMA §11.10, §15; INTEGRATIONS §10, §11).
 * Every list is governed: commands in lib/reporting.ts, lib/accounting.ts, lib/importers.ts and
 * lib/integrations.ts write them in one audited transaction. Provider responses and observations are
 * append-only (migration phase9 attaches deny_update_delete). There is no general ledger here: an export
 * batch is staged, stays NOT_POSTED until a person confirms the books took it.
 */

const REPORTS = ['canReadReports', 'canReadFinancials'] as const
const BOOKS = ['canReadFinancials', 'canCloseDay', 'canManageIntegrations'] as const
const INTEGRATIONS = ['canManageIntegrations'] as const

export const KpiSnapshot = list({
  access: shopScoped(governed([...REPORTS])),
  ui: { labelField: 'reportKey', listView: { initialColumns: ['reportKey', 'shop', 'periodStart', 'periodEnd', 'computedAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reportKey: systemChoice(['car_count', 'aro', 'elr', 'gp_labor', 'gp_parts', 'tech_productivity', 'approval_rate', 'dvi_rate', 'comeback_rate', 'cycle_time', 'all']),
    periodStart: calendarDay({ ...readOnly }),
    periodEnd: calendarDay({ ...readOnly }),
    values: json({ defaultValue: {}, ...readOnly }),
    definitions: json({ defaultValue: {}, ...readOnly }),
    inputHash: systemText(),
    computedAt: timestamp({ ...readOnly }),
    computedById: systemText(),
    ...trackingFields,
  },
})

export const AccountingMapping = list({
  access: shopScoped(governed([...BOOKS])),
  ui: { labelField: 'sourceKey', listView: { initialColumns: ['sourceKey', 'shop', 'accountCode', 'accountName', 'side'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    // What is mapped: labor, parts, tires, fees, sublet, tax, discount, tender.cash, tender.card, accounts_receivable, refunds, deposits, cores.
    sourceKey: systemText({ required: true }),
    accountCode: systemText({ required: true }),
    accountName: systemText(),
    side: systemChoice(['credit', 'debit']),
    active: checkbox({ defaultValue: true, ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

export const AccountingBatch = list({
  access: shopScoped(governed([...BOOKS])),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'shop', 'businessDate', 'status', 'postingStatus', 'debitTotalMinor', 'creditTotalMinor'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    businessDate: calendarDay({ ...readOnly }),
    status: lifecycle(['staged', 'exported', 'confirmed', 'rejected', 'voided']),
    // Always NOT_POSTED until a person confirms the provider took it. This build never posts to books.
    postingStatus: systemChoice(['NOT_POSTED', 'POSTED']),
    lines: json({ defaultValue: [], ...readOnly }),
    debitTotalMinor: minor({ defaultValue: 0n, access: { create: () => false, update: () => false } }),
    creditTotalMinor: minor({ defaultValue: 0n, access: { create: () => false, update: () => false } }),
    sourceHash: systemText(),
    unmapped: json({ defaultValue: [], ...readOnly }),
    exportJob: relationship({ ref: 'ExportJob', ...readOnly }),
    connection: relationship({ ref: 'IntegrationConnection', ...readOnly }),
    stagedById: systemText(),
    confirmedById: systemText(),
    confirmedAt: timestamp({ ...readOnly }),
    providerRef: systemText(),
    supersededBy: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const AccountingProviderResponse = list({
  access: shopScoped(immutable([...BOOKS]), 'batch.shop'),
  ui: { labelField: 'outcome' },
  fields: {
    batch: relationship({ ref: 'AccountingBatch', ...readOnly }),
    outcome: systemChoice(['accepted', 'rejected', 'partial', 'error']),
    providerRef: systemText(),
    message: systemText(),
    payload: json({ defaultValue: {}, ...readOnly }),
    contentHash: systemText(),
    receivedAt: timestamp({ ...readOnly }),
    recordedById: systemText(),
    ...trackingFields,
  },
})

export const ImportJob = list({
  access: shopScoped(governed([...INTEGRATIONS])),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'shop', 'format', 'entity', 'status', 'rowCount', 'createdAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    format: systemChoice(['tekmetric_csv', 'shopmonkey_csv', 'generic_csv']),
    entity: systemChoice(['customers', 'vehicles', 'repair_orders', 'inventory']),
    status: lifecycle(['previewed', 'applied', 'failed', 'discarded']),
    fileName: systemText(),
    fileSha256: systemText(),
    rowCount: integer({ defaultValue: 0, ...readOnly }),
    // Per-row identity and outcome: { row, externalId, action: create|update|skip|error, message }
    preview: json({ defaultValue: [], ...readOnly }),
    result: json({ defaultValue: {}, ...readOnly }),
    sourceText: text({ ...readOnly, ui: { displayMode: 'textarea', itemView: { fieldMode: 'hidden' } } }),
    mapping: json({ defaultValue: {}, ...readOnly }),
    appliedAt: timestamp({ ...readOnly }),
    createdById: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const ExportJob = list({
  access: shopScoped(governed([...BOOKS])),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'shop', 'kind', 'status', 'rowCount', 'createdAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    kind: systemChoice(['accounting_journal', 'invoices', 'customers', 'inventory', 'repair_orders']),
    status: lifecycle(['ready', 'downloaded', 'failed']),
    periodStart: calendarDay({ ...readOnly }),
    periodEnd: calendarDay({ ...readOnly }),
    fileName: systemText(),
    contentType: systemText(),
    content: text({ ...readOnly, access: { ...readOnly.access, read: anyOf('canReadFinancials', 'canManageIntegrations') }, ui: { displayMode: 'textarea', itemView: { fieldMode: 'hidden' } } }),
    sha256: systemText(),
    rowCount: integer({ defaultValue: 0, ...readOnly }),
    requestedById: systemText(),
    ...trackingFields,
  },
})

export const IntegrationConnection = list({
  access: shopScoped(governed([...INTEGRATIONS, 'canReadAudit'])),
  ui: { labelField: 'providerKey', listView: { initialColumns: ['providerKey', 'kind', 'shop', 'mode', 'status', 'lastHealthAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    kind: systemChoice(['vehicle_data', 'labor_guide', 'parts_catalog', 'messaging', 'voice', 'payments', 'financing', 'accounting', 'service_history', 'tire_registration', 'tax', 'import']),
    providerKey: systemChoice(['nhtsa', 'motor', 'alldata', 'partstech', 'nexpart', 'twilio', 'stripe', 'quickbooks', 'carfax', 'manual']),
    mode: systemChoice(['manual', 'live']),
    // Name of a SecretBox key. The secret itself is never a field of this list.
    secretRef: systemText(),
    capabilityProfile: json({ defaultValue: {}, ...readOnly }),
    capabilityHash: systemText(),
    health: json({ defaultValue: {}, ...readOnly }),
    lastHealthAt: timestamp({ ...readOnly }),
    status: lifecycle(['unconfigured', 'configured', 'pending_auth', 'active', 'degraded', 'needs_review', 'revoked']),
    note: systemText(),
    version: versionField(),
    ...trackingFields,
  },
})

export const ProviderObservation = list({
  access: shopScoped(immutable([...INTEGRATIONS]), 'connection.shop'),
  ui: { labelField: 'externalId', listView: { initialColumns: ['connection', 'kind', 'externalId', 'receivedAt', 'applyResult'] } },
  fields: {
    connection: relationship({ ref: 'IntegrationConnection', ...readOnly }),
    kind: systemChoice(['webhook', 'response', 'poll', 'manual_entry']),
    externalId: systemText(),
    contentHash: systemText({ required: true }),
    payload: json({ defaultValue: {}, ...readOnly }),
    receivedAt: timestamp({ ...readOnly }),
    appliedAt: timestamp({ ...readOnly }),
    applyResult: systemText(),
    ...trackingFields,
  },
})
