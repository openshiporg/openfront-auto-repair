import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, text, timestamp } from '@keystone-6/core/fields'
import { anyOf, permissions } from '../access'
import { centiHours, choice, fixedChoice, lifecycle, readOnly, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { auditedHooks } from './auditHooks'
import { trackingFields } from './trackingFields'

/*
 * Scheduling and intake (SCHEMA §4.3-4.6, STATE-MACHINES §1). Capacity is checked under one
 * advisory lock per shop and day, so the last slot goes to exactly one booking. Holds count against
 * capacity until they are consumed or expire (10 minutes).
 */

const sys = () => false
const readSchedule = anyOf('canReadRepairOrders', 'canManageSchedule')

export const BookingRule = list({
  access: shopScoped({ operation: { query: readSchedule, create: permissions.canManageShops, update: permissions.canManageShops, delete: sys } }),
  hooks: auditedHooks('BookingRule'),
  ui: { labelField: 'kind', listView: { initialColumns: ['shop', 'kind', 'value', 'active'] } },
  fields: {
    shop: relationship({ ref: 'Shop' }),
    kind: choice(['max_dropoffs_per_day', 'waiter_slots_per_hour', 'max_bay_hours_per_day', 'no_waiters_after', 'lead_time_hours', 'slot_minutes'], 'max_dropoffs_per_day'),
    value: json({ ui: { description: 'A whole number (count, hours or minutes); "HH:mm" for no_waiters_after; centi-hours for max_bay_hours_per_day.' } }),
    appliesToDays: json({ defaultValue: [], ui: { description: 'Days of week 0-6 (Sunday 0). Empty = every open day.' } }),
    active: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
})

export const BookingHold = list({
  access: shopScoped(governed(['canManageSchedule', 'canReadRepairOrders'])),
  ui: { listView: { initialColumns: ['shop', 'date', 'slotStart', 'kind', 'status', 'expiresAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    date: calendarDay({ ...readOnly }),
    slotStart: timestamp({ ...readOnly }),
    kind: fixedChoice(['drop_off', 'waiter']),
    bayCentiHours: integer({ defaultValue: 0, ...readOnly }),
    tokenHash: systemText({ indexed: 'unique', required: true }),
    source: fixedChoice(['staff', 'storefront_api', 'phone_agent', 'sms_agent']),
    expiresAt: timestamp({ ...readOnly }),
    status: lifecycle(['held', 'consumed', 'expired', 'released']),
    appointment: relationship({ ref: 'Appointment', ...readOnly }),
    ...trackingFields,
  },
})

export const Appointment = list({
  access: shopScoped({ operation: { query: readSchedule, create: sys, update: permissions.canManageSchedule, delete: sys } }),
  hooks: auditedHooks('Appointment'),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'shop', 'startsAt', 'kind', 'customer', 'vehicle', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    customer: relationship({ ref: 'Customer.appointments', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle.appointments', ...readOnly }),
    lead: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Name, phone and vehicle text when the customer is not on file yet.' } }),
    date: calendarDay({ ...readOnly }),
    startsAt: timestamp({ ...readOnly }),
    endsAt: timestamp({ ...readOnly }),
    kind: fixedChoice(['drop_off', 'waiter', 'pickup_delivery', 'mobile']),
    requestedServices: json({ defaultValue: [], ...readOnly }),
    concernText: text({ ui: { displayMode: 'textarea', description: "The customer's words." } }),
    estimatedCentiHours: centiHours({ defaultValue: 0 }),
    bay: relationship({ ref: 'Bay' }),
    assignedTech: relationship({ ref: 'User' }),
    source: fixedChoice(['staff', 'storefront_api', 'phone_agent', 'sms_agent', 'import']),
    status: lifecycle(['requested', 'confirmed', 'arrived', 'no_show', 'cancelled']),
    cancelReason: systemText(),
    checkIn: relationship({ ref: 'CheckIn.appointment', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})

/**
 * Check-in at the counter or on the staff tablet: odometer in, the signed work order, promised time,
 * key tag and walkaround notes. One per visit. Phase 2 opens the repair order from it.
 */
export const CheckIn = list({
  access: shopScoped(governed(['canReadRepairOrders', 'canManageSchedule'])),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'shop', 'vehicle', 'customer', 'promisedAt', 'signedAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    appointment: relationship({ ref: 'Appointment.checkIn', ...readOnly }),
    customer: relationship({ ref: 'Customer', ...readOnly }),
    vehicle: relationship({ ref: 'Vehicle', ...readOnly }),
    odometerIn: relationship({ ref: 'OdometerReading', ...readOnly }),
    concerns: json({ defaultValue: [], ...readOnly }),
    keyTag: systemText(),
    waiter: checkbox({ defaultValue: false, ...readOnly }),
    promisedAt: timestamp({ ...readOnly }),
    contactPreference: fixedChoice(['sms', 'email', 'phone']),
    transportationNeed: fixedChoice(['none', 'shuttle', 'loaner', 'rideshare']),
    signatureMethod: fixedChoice(['in_person', 'electronic_link']),
    signerName: systemText(),
    signature: json({ ...readOnly, access: { read: anyOf('canReadCustomerPII', 'canManageSchedule'), create: sys, update: sys } }),
    signatureHash: systemText(),
    workOrderText: systemText(),
    workOrderHash: systemText(),
    signedAt: timestamp({ ...readOnly }),
    valuablesNote: systemText(),
    recallWarning: json({ ...readOnly, ui: { ...readOnly.ui, description: 'Possible recalls shown at check-in (do-not-drive campaigns in red).' } }),
    jurisdictionPolicyVersion: relationship({ ref: 'JurisdictionPolicyVersion', ...readOnly }),
    repairOrder: relationship({ ref: 'RepairOrder.checkIn', ...readOnly }),
    at: timestamp({ defaultValue: { kind: 'now' }, ...readOnly }),
    by: relationship({ ref: 'User', ...readOnly }),
    version: versionField(),
    ...trackingFields,
  },
})
