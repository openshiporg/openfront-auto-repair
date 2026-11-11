import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text } from '@keystone-6/core/fields'
import { anyOf } from '../access'
import { choice, lifecycle, minor, readOnly, systemText, versionField } from './domainFields'
import { governed } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Fleet and business accounts (SCHEMA §3.6 to §3.8). Everything here is written by commands in
 * lib/fleet.ts (validated, audited, one transaction); the generated API only reads. Contact values
 * are personal data and need canReadCustomerPII.
 */

const readFleet = governed(['canReadRepairOrders', 'canManageCustomers', 'canReadCustomerPII'])
const pii = { read: anyOf('canReadCustomerPII') as (args: any) => boolean, create: () => false, update: () => false }

export const BusinessAccountContact = list({
  access: readFleet,
  ui: { labelField: 'name', listView: { initialColumns: ['name', 'businessAccount', 'roles', 'active'] } },
  fields: {
    businessAccount: relationship({ ref: 'BusinessAccount.contacts', ...readOnly }),
    name: systemText({ required: true }),
    email: text({ access: pii, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    phone: text({ access: pii, ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } } }),
    roles: json({ defaultValue: [], ...readOnly, ui: { ...readOnly.ui, description: 'billing, approver, driver.' } }),
    portalUser: relationship({ ref: 'User', ...readOnly }),
    active: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const FleetApprover = list({
  access: readFleet,
  ui: { labelField: 'id', listView: { initialColumns: ['businessAccount', 'contact', 'limitMinor', 'order', 'active'] } },
  fields: {
    businessAccount: relationship({ ref: 'BusinessAccount.approvers', ...readOnly }),
    contact: relationship({ ref: 'BusinessAccountContact', ...readOnly }),
    limitMinor: minor({ defaultValue: 0n, description: 'The largest job this person can approve alone. Anything above goes to the next approver in order.' }),
    order: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 }, ...readOnly }),
    active: checkbox({ defaultValue: true, ...readOnly }),
    ...trackingFields,
  },
})

export const ExemptionCertificate = list({
  access: readFleet,
  ui: { labelField: 'number', listView: { initialColumns: ['businessAccount', 'kind', 'number', 'issuingState', 'effectiveFrom', 'expiresAt', 'status'] } },
  fields: {
    businessAccount: relationship({ ref: 'BusinessAccount.certificates', ...readOnly }),
    kind: choice(['resale', 'government', 'nonprofit', 'other'], 'government'),
    number: systemText({ required: true }),
    issuingState: systemText(),
    effectiveFrom: calendarDay({ ...readOnly }),
    expiresAt: calendarDay({ ...readOnly }),
    document: relationship({ ref: 'Document', ...readOnly }),
    status: lifecycle(['active', 'expired', 'revoked']),
    version: versionField(),
    ...trackingFields,
  },
})

export const FleetUnit = list({
  access: readFleet,
  ui: { labelField: 'unitNumber', listView: { initialColumns: ['businessAccount', 'unitNumber', 'vehicle', 'driverName', 'costCenter'] } },
  fields: {
    businessAccount: relationship({ ref: 'BusinessAccount.units', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    unitNumber: systemText({ required: true }),
    driverName: systemText(),
    costCenter: systemText(),
    ...trackingFields,
  },
})
