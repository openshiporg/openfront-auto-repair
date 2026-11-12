import type { Permission } from '../access'
import { addJob, openRepairOrder, setJobLines, type JobInput } from '../lib/repairOrders'
import { issueEstimate, requestAuthorization, createStaffTask } from '../lib/authorization'
import { openComeback } from '../lib/comebacks'
import { bookAppointment, rescheduleAppointment } from '../lib/scheduling'
import { createSupplierOrder, recordPartQuote, type QuoteInput } from '../lib/supplierOrders'
import { matchSupplierInvoice } from '../lib/supplierInvoices'
import { addHypothesis, startDiagnosis } from '../lib/diagnosis'
import { Codes, DomainError } from '../lib/errors'
import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import type { Tx } from '../lib/db'
import type { UnitOfWork } from '../lib/unitOfWork'
import type { AgentScope } from './constants'

/*
 * The agent tool catalogue (INTEGRATIONS §8). Every tool here is a PROPOSAL tool: it wraps the same lib command the
 * dashboard uses and never writes on its own. The engine (lib/proposals.ts) dry-runs it inside a transaction that is
 * rolled back, to show the exact effect, then runs it for real only after a person confirms that step.
 * Nothing here records an authorization, finalizes an invoice, refunds, writes off, overrides a price, merges
 * customers, changes consent, or approves anything: those tools do not exist (NEVER_EXPOSED).
 */

export type StepCtx = { uow: UnitOfWork; actor: Actor; shopId: string; proposalId: string | null; runId: string | null; stepKey: string }
export type Entity = { entity: string; id: string }

export type AgentTool = {
  name: string
  description: string
  scope: AgentScope
  /** The user must hold one of these too (I-A1). */
  permissions: readonly Permission[]
  /** Class the shop's autonomy settings are keyed by. */
  actionClass: string
  fields: Record<string, { type: 'string' | 'number' | 'boolean' | 'array' | 'object'; description: string; optional?: boolean }>
  /** The shop the step touches, read in the same transaction (fails closed when missing). */
  shopOf(tx: Tx, args: any): Promise<string | null>
  /** Records the step reads and whose version must still match at Confirm. */
  reads(args: any): Entity[]
  run(ctx: StepCtx, args: any): Promise<Record<string, unknown>>
  /** Plain-words line for the preview. */
  summary(args: any): string
  /** A tool run by the person who confirms (they, not the assistant, are named on the record). */
  asConfirmer?: boolean
}

const str = (d: string, optional = false) => ({ type: 'string' as const, description: d, optional })
const arr = (d: string, optional = false) => ({ type: 'array' as const, description: d, optional })
const num = (d: string, optional = false) => ({ type: 'number' as const, description: d, optional })

const roShop = async (tx: Tx, id: string) => (await tx.repairOrder.findUnique({ where: { id: String(id ?? '') }, select: { shopId: true } }))?.shopId ?? null
const jobShop = async (tx: Tx, id: string) => (await tx.job.findUnique({ where: { id: String(id ?? '') }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId ?? null
const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))

export const TOOLS: AgentTool[] = [
  {
    name: 'open_repair_order', description: 'Open a repair order for a customer who has checked in.', scope: 'ro.propose', permissions: ['canWriteRepairOrders'], actionClass: 'ro.propose',
    fields: { checkInId: str('The check-in to open an order for.'), kind: str('standard, comeback, internal or fleet.', true) },
    shopOf: async (tx, a) => (await tx.checkIn.findUnique({ where: { id: String(a.checkInId ?? '') }, select: { shopId: true } }))?.shopId ?? null,
    reads: a => [{ entity: 'CheckIn', id: a.checkInId }],
    run: async ({ uow, actor }, a) => plain(await openRepairOrder(uow, actor, { checkInId: a.checkInId, kind: a.kind })),
    summary: () => 'Open a repair order from the check-in',
  },
  {
    name: 'add_job', description: 'Add a job to an open repair order, from a canned job, a finding or typed lines.', scope: 'ro.propose', permissions: ['canWriteRepairOrders', 'canPriceJobs'], actionClass: 'ro.propose',
    fields: { repairOrderId: str('The repair order.'), title: str('Job title.'), kind: str('repair, maintenance, diagnosis, inspection…', true), cannedJobId: str('A canned job to start from.', true), concernId: str('The customer concern it answers.', true), lines: arr('Labor and part lines.', true) },
    shopOf: (tx, a) => roShop(tx, a.repairOrderId), reads: a => [{ entity: 'RepairOrder', id: a.repairOrderId }],
    run: async ({ uow, actor }, a) => {
      const out = plain(await addJob(uow, actor, { repairOrderId: a.repairOrderId, title: a.title, kind: a.kind, cannedJobId: a.cannedJobId, concernId: a.concernId, lines: a.lines, source: 'agent' } as JobInput)) as Record<string, any>
      // R§17.2: an assistant never guesses between labor-guide variants. A job left waiting on a choice is refused, not proposed.
      if (Array.isArray(out.candidates) && out.candidates.length) throw new DomainError(Codes.GUIDE_AMBIGUOUS, 'Several labor-guide variants fit this vehicle. A person must choose one.', { candidates: out.candidates })
      return out
    },
    summary: a => `Add the job "${String(a.title ?? '').slice(0, 80)}"`,
  },
  {
    name: 'price_job', description: 'Price a job from the labor guide and parts. Refuses when several guide variants fit: a person picks one.', scope: 'estimate.price', permissions: ['canPriceJobs'], actionClass: 'estimate.price',
    fields: { jobId: str('The job.'), expectedVersion: num('The job version you read.'), lines: arr('Labor and part lines.') },
    shopOf: (tx, a) => jobShop(tx, a.jobId), reads: a => [{ entity: 'Job', id: a.jobId }],
    run: async ({ uow, actor }, a) => plain(await setJobLines(uow, actor, { jobId: a.jobId, expectedVersion: Number(a.expectedVersion), lines: a.lines })),
    summary: () => 'Price the job',
  },
  {
    name: 'build_estimate_version', description: 'Build the next estimate version for a repair order (checks required disclosures).', scope: 'estimate.price', permissions: ['canSendEstimates'], actionClass: 'estimate.price',
    fields: { repairOrderId: str('The repair order.'), expectedVersion: num('The order version you read.'), jobIds: arr('Jobs to include. Empty means all open jobs.', true) },
    shopOf: (tx, a) => roShop(tx, a.repairOrderId), reads: a => [{ entity: 'RepairOrder', id: a.repairOrderId }],
    run: async ({ uow, actor }, a) => plain(await issueEstimate(uow, actor, { repairOrderId: a.repairOrderId, jobIds: a.jobIds ?? null, expectedVersion: Number(a.expectedVersion) })),
    summary: () => 'Build the estimate for the customer',
  },
  {
    name: 'request_authorization', description: 'Prepare the authorization request for an estimate. This only asks; the customer decides and a person records it.', scope: 'estimate.send_request', permissions: ['canSendEstimates'], actionClass: 'estimate.send_request',
    fields: { estimateVersionId: str('The estimate version.'), channel: str('sms, email, in_person or phone_call.'), contactId: str('Customer contact to use.', true) },
    shopOf: async (tx, a) => (await tx.estimateVersion.findUnique({ where: { id: String(a.estimateVersionId ?? '') }, select: { repairOrder: { select: { shopId: true } } } }))?.repairOrder?.shopId ?? null,
    reads: a => [{ entity: 'EstimateVersion', id: a.estimateVersionId }],
    run: async ({ uow, actor }, a) => plain(await requestAuthorization(uow, actor, { estimateVersionId: a.estimateVersionId, channel: a.channel, contactId: a.contactId ?? null })),
    summary: a => `Prepare a ${String(a.channel ?? '').replace(/_/g, ' ')} authorization request`,
  },
  {
    name: 'record_supplier_quote', description: 'Record a supplier quote from a call, with who was spoken to.', scope: 'parts.quote', permissions: ['canOrderParts', 'canManageParts'], actionClass: 'parts.quote',
    fields: { shopId: str('Shop.'), supplierId: str('Supplier.'), partNumber: str('Part number.'), unitCostMinor: str('Cost in cents.'), spokeTo: str('Who quoted it.'), note: str('What they said.', true), jobId: str('Job it is for.', true), availability: str('In stock, ETA…', true) },
    shopOf: async (_tx, a) => a.shopId ?? null, reads: () => [],
    run: async ({ uow, actor }, a) => plain(await recordPartQuote(uow, actor, { shopId: a.shopId, supplierId: a.supplierId, source: 'phone', partNumber: a.partNumber, unitCostMinor: a.unitCostMinor, jobId: a.jobId ?? null, availability: a.availability, phoneEvidence: { spokeTo: a.spokeTo, note: a.note } } as QuoteInput)),
    summary: a => `Record a quote for ${String(a.partNumber ?? '')} from a phone call`,
  },
  {
    name: 'order_parts', description: 'Create a supplier order. Never placed without a person unless the shop allows small orders.', scope: 'parts.order_within_policy', permissions: ['canOrderParts'], actionClass: 'order_parts',
    fields: { shopId: str('Shop.'), supplierId: str('Supplier.'), lines: arr('Order lines.'), deliveryNote: str('Delivery note.', true) },
    shopOf: async (_tx, a) => a.shopId ?? null, reads: () => [],
    run: async ({ uow, actor }, a) => plain(await createSupplierOrder(uow, actor, { shopId: a.shopId, supplierId: a.supplierId, kind: 'job', lines: a.lines, deliveryNote: a.deliveryNote })),
    summary: () => 'Create the supplier order',
  },
  {
    name: 'book_appointment', description: 'Book an appointment in an open slot.', scope: 'booking.create', permissions: ['canManageSchedule'], actionClass: 'booking.propose',
    fields: { shopId: str('Shop.'), startsAt: str('ISO time.'), kind: str('drop_off, waiter, pickup_delivery or mobile.'), customerId: str('Customer.', true), vehicleId: str('Vehicle.', true), concernText: str('What they want looked at.', true), estimatedCentiHours: num('Expected time in hundredths of an hour.', true) },
    shopOf: async (_tx, a) => a.shopId ?? null, reads: () => [],
    run: async ({ uow, actor }, a) => plain(await bookAppointment(uow, actor, { shopId: a.shopId, startsAt: new Date(a.startsAt), kind: a.kind, customerId: a.customerId ?? null, vehicleId: a.vehicleId ?? null, concernText: a.concernText ?? null, estimatedCentiHours: a.estimatedCentiHours, source: 'phone_agent', confirm: true })),
    summary: a => `Book an appointment for ${String(a.startsAt ?? '')}`,
  },
  {
    name: 'reschedule_appointment', description: 'Move an appointment to another slot.', scope: 'booking.create', permissions: ['canManageSchedule'], actionClass: 'booking.propose',
    fields: { appointmentId: str('Appointment.'), startsAt: str('ISO time.'), expectedVersion: num('Version you read.', true) },
    shopOf: async (tx, a) => (await tx.appointment.findUnique({ where: { id: String(a.appointmentId ?? '') }, select: { shopId: true } }))?.shopId ?? null,
    reads: a => [{ entity: 'Appointment', id: a.appointmentId }],
    run: async ({ uow, actor }, a) => plain(await rescheduleAppointment(uow, actor, { id: a.appointmentId, startsAt: new Date(a.startsAt), expectedVersion: a.expectedVersion ?? null })),
    summary: a => `Move the appointment to ${String(a.startsAt ?? '')}`,
  },
  {
    name: 'open_comeback', description: 'Open a comeback on earlier work.', scope: 'ro.propose', permissions: ['canWriteRepairOrders', 'canManageComebacks'], actionClass: 'ro.propose',
    fields: { originalJobId: str('The earlier job.'), concern: str('What the customer reports.'), odometer: num('Odometer.', true) },
    shopOf: (tx, a) => jobShop(tx, a.originalJobId), reads: a => [{ entity: 'Job', id: a.originalJobId }],
    run: async ({ uow, actor }, a) => plain(await openComeback(uow, actor, { originalJobId: a.originalJobId, concern: a.concern, odometer: a.odometer ?? null })),
    summary: () => 'Open a comeback on the earlier job',
  },
  {
    name: 'start_diagnosis', description: 'Start a diagnosis session on an authorized diagnosis job.', scope: 'diagnosis.run', permissions: ['canDiagnose'], actionClass: 'diagnosis.run',
    fields: { repairOrderId: str('Repair order.'), concernId: str('Concern.'), jobId: str('The authorized diagnosis job.'), symptoms: arr('Symptoms.', true), dtcs: arr('Trouble codes.', true) },
    shopOf: (tx, a) => roShop(tx, a.repairOrderId), reads: a => [{ entity: 'Job', id: a.jobId }],
    run: async ({ uow, actor, runId }, a) => plain(await startDiagnosis(uow, actor, a, runId)),
    summary: () => 'Start a diagnosis session',
  },
  {
    name: 'add_hypothesis', description: 'Add a likely cause with its sources and a confidence from 0 to 1.', scope: 'diagnosis.run', permissions: ['canDiagnose'], actionClass: 'diagnosis.run',
    fields: { sessionId: str('Diagnosis session.'), cause: str('The likely cause.'), confidence: num('0 to 1.'), sources: arr('Where this comes from: [{sourceKind, title}].'), evidence: arr('Supporting facts.', true) },
    shopOf: async (tx, a) => (await tx.diagnosisSession.findUnique({ where: { id: String(a.sessionId ?? '') }, select: { shopId: true } }))?.shopId ?? null,
    reads: a => [{ entity: 'DiagnosisSession', id: a.sessionId }],
    run: async ({ uow, actor, runId }, a) => plain(await addHypothesis(uow, actor, a, runId)),
    summary: a => `Add the likely cause "${String(a.cause ?? '').slice(0, 80)}"`,
  },
  {
    name: 'reconcile_supplier_invoice', description: 'Match a supplier invoice to what was ordered and received and open discrepancies. Never approves.', scope: 'supplier_invoice.reconcile', permissions: ['canManageParts', 'canApproveSupplierInvoice'], actionClass: 'supplier_invoice.reconcile',
    fields: { invoiceId: str('Supplier invoice.') },
    shopOf: async (tx, a) => (await tx.supplierInvoice.findUnique({ where: { id: String(a.invoiceId ?? '') }, select: { shopId: true } }))?.shopId ?? null,
    reads: a => [{ entity: 'SupplierInvoice', id: a.invoiceId }],
    run: async ({ uow, actor }, a) => plain(await matchSupplierInvoice(uow, actor, { invoiceId: a.invoiceId })),
    summary: () => 'Match the invoice to the order and receiving',
  },
  {
    name: 'create_callback_task', description: 'When a customer says "yes, go ahead" to an assistant, this creates a task for staff to call back and record the authorization.', scope: 'ro.propose', permissions: ['canReadRepairOrders'], actionClass: 'callback_task',
    fields: { repairOrderId: str('Repair order.'), title: str('Task title.'), detail: str('What the customer said.', true) },
    shopOf: (tx, a) => roShop(tx, a.repairOrderId), reads: () => [],
    run: async ({ uow, actor, shopId }, a) => plain(await createStaffTask(uow, actor, { shopId, repairOrderId: a.repairOrderId, kind: 'customer_callback', title: String(a.title ?? '').slice(0, 200), detail: a.detail ? String(a.detail).slice(0, 1000) : null, source: 'agent' })),
    summary: a => `Create a callback task: ${String(a.title ?? '').slice(0, 80)}`,
  },
  {
    name: 'draft_message', description: 'Draft a customer message for staff to copy and send themselves. Nothing is sent.', scope: 'messages.draft', permissions: ['canMessageCustomers'], actionClass: 'message.draft',
    fields: { repairOrderId: str('Repair order.', true), shopId: str('Shop.'), purpose: str('transactional or marketing.'), body: str('The draft text.') },
    shopOf: async (_tx, a) => a.shopId ?? null, reads: () => [],
    run: async ({ uow, actor, shopId }, a) => { auditCreate(uow, actor, 'AgentProposal', 'draft', 'message.drafted', { shopId, purpose: a.purpose }); return { draft: String(a.body ?? '').slice(0, 1600), purpose: a.purpose } },
    summary: () => 'Draft a message for staff to copy',
  },
  {
    name: 'draft_dispute_email', description: 'Draft an email to a supplier about invoice discrepancies, for staff to copy. Nothing is sent.', scope: 'supplier_invoice.reconcile', permissions: ['canManageParts', 'canApproveSupplierInvoice'], actionClass: 'supplier_invoice.reconcile',
    fields: { invoiceId: str('Supplier invoice.'), body: str('Email text.', true) },
    shopOf: async (tx, a) => (await tx.supplierInvoice.findUnique({ where: { id: String(a.invoiceId ?? '') }, select: { shopId: true } }))?.shopId ?? null,
    reads: a => [{ entity: 'SupplierInvoice', id: a.invoiceId }],
    run: async ({ uow }, a) => { void uow; return { draft: String(a.body ?? '').slice(0, 4000) } },
    summary: () => 'Draft the dispute email for staff to copy',
  },
]

export const TOOL_BY_NAME = new Map(TOOLS.map(t => [t.name, t]))

export const toolSchema = (t: AgentTool) => ({
  type: 'object' as const,
  properties: Object.fromEntries(Object.entries(t.fields).map(([k, f]) => [k, { type: f.type, description: f.description }])),
  required: Object.entries(t.fields).filter(([, f]) => !f.optional).map(([k]) => k),
  additionalProperties: false,
})

/** Arguments are checked against the declared fields before anything runs. */
export function checkArgs(t: AgentTool, args: unknown) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new DomainError(Codes.INVALID_INPUT, `${t.name} needs its arguments as an object.`)
  const a = args as Record<string, unknown>
  for (const key of Object.keys(a)) if (!(key in t.fields)) throw new DomainError(Codes.INVALID_INPUT, `${t.name} has no "${key}" argument.`, { field: key })
  for (const [key, f] of Object.entries(t.fields)) {
    const v = a[key]
    if (v === undefined || v === null) { if (!f.optional) throw new DomainError(Codes.INVALID_INPUT, `${t.name} needs ${key}.`, { field: key }); continue }
    const ok = f.type === 'array' ? Array.isArray(v) : f.type === 'object' ? typeof v === 'object' : typeof v === f.type
    if (!ok) throw new DomainError(Codes.INVALID_INPUT, `${t.name}: ${key} must be a ${f.type}.`, { field: key })
  }
}
