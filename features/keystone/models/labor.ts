import { list } from '@keystone-6/core'
import { calendarDay, checkbox, integer, json, relationship, timestamp } from '@keystone-6/core/fields'
import { anyOf } from '../access'
import { lifecycle, minor, readOnly, systemChoice, systemText, versionField } from './domainFields'
import { governed, shopScoped } from './listAccess'
import { trackingFields } from './trackingFields'

/*
 * Labor, technicians, flagged hours, pay periods and comebacks (SCHEMA §9; STATE-MACHINES §10, §12).
 * Every list is governed: the generated API reads (with the shop row filter) and never writes. Commands
 * in lib/labor.ts and lib/comebacks.ts change everything in one audited transaction. Database triggers
 * (migration phase5) keep the flagged-hours ledger append-only, refuse an entry in a closed pay period,
 * and allow one open shift for each technician.
 */

const READ = ['canClockSelf', 'canManageTime', 'canApproveTime', 'canClosePayPeriod', 'canReadTechPay', 'canManageComebacks', 'canApproveGoodwill', 'canReadRepairOrders'] as const
const sys = () => false
/** Pay rates are visible to canReadTechPay only. */
const pay = { read: anyOf('canReadTechPay') as (args: any) => boolean, create: sys, update: sys }
const scoped = (path = 'shop') => shopScoped(governed([...READ]), path)

const PAY_PLANS = ['flat_rate', 'hourly', 'salary_plus_bonus'] as const
const CREDENTIAL_KINDS = ['epa_609', 'ase', 'state_license', 'manufacturer', 'other'] as const
const WAIT_REASONS = ['parts', 'authorization', 'bay', 'tool', 'info', 'other'] as const

export const TechnicianProfile = list({
  access: scoped(),
  ui: { labelField: 'displayName', listView: { initialColumns: ['displayName', 'shop', 'payPlan', 'active'] } },
  fields: {
    user: relationship({ ref: 'User', ...readOnly }),
    shop: relationship({ ref: 'Shop', ...readOnly }),
    displayName: systemText({ required: true }),
    payPlan: systemChoice(PAY_PLANS, 'flat_rate'),
    flatRateMinor: minor({ defaultValue: 0n, description: 'Paid for each flagged hour.', access: pay }),
    hourlyRateMinor: minor({ defaultValue: 0n, description: 'Paid for each hour on the clock.', access: pay }),
    skills: json({ defaultValue: [], ...readOnly }),
    rateClasses: json({ defaultValue: [], ...readOnly }),
    active: checkbox({ defaultValue: true, ...readOnly }),
    credentials: relationship({ ref: 'TechnicianCredential.technician', many: true }),
    version: versionField(),
    ...trackingFields,
  },
})

export const TechnicianCredential = list({
  access: scoped('technician.shop'),
  ui: { labelField: 'kind', listView: { initialColumns: ['technician', 'kind', 'identifier', 'expiresAt', 'status'] } },
  fields: {
    technician: relationship({ ref: 'TechnicianProfile.credentials', ...readOnly }),
    kind: systemChoice(CREDENTIAL_KINDS, 'other'),
    identifier: systemText(),
    issuedAt: calendarDay({ ...readOnly }),
    expiresAt: calendarDay({ ...readOnly }),
    verifiedBy: relationship({ ref: 'User', ...readOnly }),
    status: lifecycle(['active', 'expired', 'revoked']),
    version: versionField(),
    ...trackingFields,
  },
})

export const ShiftClock = list({
  access: scoped(),
  ui: { labelField: 'status', listView: { initialColumns: ['technician', 'clockInAt', 'clockOutAt', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    technician: relationship({ ref: 'TechnicianProfile', ...readOnly }),
    clockInAt: timestamp({ ...readOnly }),
    clockOutAt: timestamp({ ...readOnly }),
    breaks: json({ defaultValue: [], ...readOnly }),
    status: lifecycle(['clocked_in', 'on_break', 'clocked_out']),
    version: versionField(),
    ...trackingFields,
  },
})

export const JobClock = list({
  access: scoped(),
  ui: { labelField: 'status', listView: { initialColumns: ['technician', 'job', 'startedAt', 'stoppedAt', 'workedCentiHours', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    technician: relationship({ ref: 'TechnicianProfile', ...readOnly }),
    job: relationship({ ref: 'Job', ...readOnly }),
    shiftClock: relationship({ ref: 'ShiftClock', ...readOnly }),
    startedAt: timestamp({ ...readOnly }),
    stoppedAt: timestamp({ ...readOnly }),
    workedCentiHours: integer({ defaultValue: 0, validation: { isRequired: true }, ...readOnly }),
    status: lifecycle(['running', 'stopped']),
    version: versionField(),
    ...trackingFields,
  },
})

export const WaitingInterval = list({
  access: scoped('jobClock.shop'),
  ui: { labelField: 'reason', listView: { initialColumns: ['jobClock', 'reason', 'startedAt', 'endedAt'] } },
  fields: {
    jobClock: relationship({ ref: 'JobClock', ...readOnly }),
    reason: systemChoice(WAIT_REASONS, 'other'),
    startedAt: timestamp({ ...readOnly }),
    endedAt: timestamp({ ...readOnly }),
    note: systemText(),
    ...trackingFields,
  },
})

export const ClockCorrection = list({
  access: scoped(),
  ui: { labelField: 'targetKind', listView: { initialColumns: ['technician', 'targetKind', 'reason', 'status', 'createdAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    technician: relationship({ ref: 'TechnicianProfile', ...readOnly }),
    targetKind: systemChoice(['shift', 'job_clock'], 'shift'),
    targetId: systemText({ required: true }),
    before: json({ ...readOnly }),
    after: json({ ...readOnly }),
    reason: systemText({ required: true }),
    requestedBy: relationship({ ref: 'User', ...readOnly }),
    approval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    appliedAt: timestamp({ ...readOnly }),
    status: lifecycle(['pending', 'applied', 'rejected']),
    version: versionField(),
    ...trackingFields,
  },
})

export const PayPeriod = list({
  access: scoped(),
  ui: { labelField: 'startsOn', listView: { initialColumns: ['shop', 'startsOn', 'endsOn', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    startsOn: calendarDay({ ...readOnly }),
    endsOn: calendarDay({ ...readOnly }),
    closedAt: timestamp({ ...readOnly }),
    closedBy: relationship({ ref: 'User', ...readOnly }),
    approvedBy: relationship({ ref: 'User', ...readOnly }),
    exportedAt: timestamp({ ...readOnly }),
    exportCsv: systemText(),
    status: lifecycle(['open', 'closed', 'exported']),
    version: versionField(),
    ...trackingFields,
  },
})

/** The immutable ledger of flagged hours. A reversal or adjustment is a new row; nothing is edited. */
export const FlaggedHoursEntry = list({
  access: scoped(),
  ui: { labelField: 'kind', listView: { initialColumns: ['technician', 'job', 'centiHours', 'kind', 'flaggedAt'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    technician: relationship({ ref: 'TechnicianProfile', ...readOnly }),
    job: relationship({ ref: 'Job', ...readOnly }),
    centiHours: integer({ defaultValue: 0, validation: { isRequired: true }, ...readOnly }),
    kind: systemChoice(['flag', 'reversal', 'adjustment'], 'flag'),
    reason: systemText(),
    sourceEvent: systemText({ required: true }),
    payPeriod: relationship({ ref: 'PayPeriod', ...readOnly }),
    flaggedAt: timestamp({ ...readOnly }),
    ...trackingFields,
  },
})

export const ComebackCase = list({
  access: scoped(),
  ui: { labelField: 'reference', listView: { initialColumns: ['reference', 'originalJob', 'cause', 'noCharge', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    reference: systemText({ indexed: 'unique', required: true }),
    originalJob: relationship({ ref: 'Job', ...readOnly }),
    comebackJob: relationship({ ref: 'Job', ...readOnly }),
    concern: systemText(),
    coverage: relationship({ ref: 'WarrantyCoverage', ...readOnly }),
    coverageValid: checkbox({ defaultValue: false, ...readOnly }),
    cause: systemChoice(['undetermined', 'workmanship', 'part_failure', 'new_issue', 'customer_caused'], 'undetermined'),
    diagnosis: systemText(),
    noCharge: checkbox({ defaultValue: false, ...readOnly }),
    goodwillApproval: relationship({ ref: 'ApprovalRequest', ...readOnly }),
    resolution: systemText(),
    openedBy: relationship({ ref: 'User', ...readOnly }),
    resolvedAt: timestamp({ ...readOnly }),
    status: lifecycle(['open', 'diagnosed', 'resolved', 'cancelled']),
    version: versionField(),
    ...trackingFields,
  },
})

export const PartWarrantyClaim = list({
  access: scoped(),
  ui: { labelField: 'claimNumber', listView: { initialColumns: ['claimNumber', 'supplier', 'laborReimbursementMinor', 'status'] } },
  fields: {
    shop: relationship({ ref: 'Shop', ...readOnly }),
    comeback: relationship({ ref: 'ComebackCase', ...readOnly }),
    supplier: relationship({ ref: 'Supplier', ...readOnly }),
    jobLine: relationship({ ref: 'JobLine', ...readOnly }),
    claimNumber: systemText({ required: true }),
    laborReimbursementMinor: minor({ defaultValue: 0n, access: { read: anyOf('canSeeCost'), create: sys, update: sys } }),
    voidReason: systemText(),
    voidedAt: timestamp({ ...readOnly }),
    status: lifecycle(['draft', 'submitted', 'credited', 'denied', 'withdrawn']),
    version: versionField(),
    ...trackingFields,
  },
})
