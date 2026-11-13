import { accountForNewOrder } from './fleet'
import { advisoryLock, type Tx } from './db'
import { formatMinor } from './money'
import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, can, isMachine, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { nextShopReference } from './sequence'
import { canonicalJson, sha256, toJsonValue } from './canonical'
import { chargeCeilingMinor, parseToleranceRule } from './ceiling'
import { identityHash, priceJob, type JobPrice, type LineInput, type LineKind, type PricingPolicy } from './pricing'
import type { UnitOfWork } from './unitOfWork'
import { flagJob, shopPolicy } from './flagging'
import { assertCredentialForJob } from './labor'
import { releaseJobReservations } from './stock'
import { assertDiagnosisCleared } from './diagnosis'
import { guideSnapshot, laborGuide, type GuideOperation, type LibraryRow } from '../../integrations/labor-guide'

/*
 * Repair orders and jobs (STATE-MACHINES §2-3, §8). A repair order opens from a check-in and pins
 * the eight policy versions in force (I-O2). Jobs are priced from those pins only, under the
 * ro-pricing advisory lock, so a person and an assistant never price the same order at once.
 *
 * The ceiling (I-R4): an authorized job whose new price is above authorized + tolerance, or whose
 * part numbers, conditions or labor classes change (I-R5), moves to needs_reauthorization. Putting
 * the content back to what was authorized moves it back.
 */

export const OPEN_RO = ['checked_in', 'in_service', 'on_hold'] as const
const EDITABLE_JOB = ['draft', 'priced', 'offered', 'authorized', 'in_progress', 'needs_reauthorization'] as const
const AUTHORIZED_LIKE = ['authorized', 'in_progress', 'needs_reauthorization']

const POINTERS = {
  jurisdictionPolicyVersionId: 'jurisdictionPolicyId',
  shopPolicyVersionId: 'shopPolicyId',
  laborRateClassSetVersionId: 'laborRateClassSetId',
  laborMatrixVersionId: 'laborMatrixId',
  partsMatrixVersionId: 'partsMatrixId',
  feePolicyVersionId: 'feePolicyId',
  taxRuleSetVersionId: 'taxRuleSetId',
  warrantyTermSetVersionId: 'warrantyTermSetId',
} as const

const CONCERN_CATEGORIES: [RegExp, string][] = [
  [/nois|squeal|grind|rattl|clunk|knock|squeak|hum/i, 'noise'],
  [/leak|drip|puddle/i, 'leak'],
  [/light|warning|check engine|abs|tpms|dash/i, 'warning_light'],
  [/oil change|maintenance|service|tire rotation|filter/i, 'maintenance'],
  [/inspect|check over|look at/i, 'inspection_request'],
  [/stall|hesitat|misfire|power|start|rough|vibrat|pull/i, 'performance'],
]
export const concernCategory = (words: string) => CONCERN_CATEGORIES.find(([re]) => re.test(words))?.[1] ?? 'other'

// ── Open ──────────────────────────────────────────────────────────────────────

export type OpenInput = { checkInId: string; serviceAdvisorId?: string | null; designee?: { name: string; relationship: string; contact: string } | null; kind?: 'standard' | 'comeback' | 'internal' | 'fleet'; businessAccountId?: string | null; billTo?: 'account' | 'customer' | null }

/** Open the repair order for a check-in: draft (pins the policy) then checked_in (the check-in satisfies the guard). */
export async function openRepairOrder(uow: UnitOfWork, actor: Actor, input: OpenInput) {
  const { tx, now } = uow
  const checkIn = await lockRow<any>(tx, 'CheckIn', input.checkInId)
  if (checkIn.repairOrderId) throw new DomainError(Codes.DUPLICATE, 'This check-in already has a repair order.', { existingId: checkIn.repairOrderId })
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: checkIn.shopId } })
  const missing = Object.entries(POINTERS).filter(([, pointer]) => !(shop as any)[pointer]).map(([field]) => field)
  if (missing.length) throw new DomainError(Codes.POLICY_MISSING, `${shop.code} has unpublished policies (${missing.join(', ')}). Publish them under Settings → Policies first.`, { problems: missing })
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: shop.jurisdictionPolicyId! } })
  const concerns = Array.isArray(checkIn.concerns) ? (checkIn.concerns as string[]) : []
  if (!concerns.length) throw new DomainError(Codes.GUARD_FAILED, 'The check-in has no concerns. Record at least one before opening the repair order.')
  if (law.requireOdometerIn && !checkIn.odometerInId) throw new DomainError(Codes.ODOMETER_REQUIRED, 'Record the odometer in before opening the repair order.')
  if (law.requireSignedWorkOrder && !checkIn.signedAt) throw new DomainError(Codes.SIGNATURE_REQUIRED, 'The work order must be signed before the repair order opens.')

  let designee: Record<string, unknown> | null = null
  if (input.designee) {
    const rules = (law.designeeRules ?? {}) as { allowed?: boolean }
    if (rules.allowed === false) throw new DomainError(Codes.GUARD_FAILED, "This state's rules don't allow a designee.")
    const name = String(input.designee.name ?? '').trim().slice(0, 120)
    const relationship = String(input.designee.relationship ?? '').trim().slice(0, 80)
    const contact = String(input.designee.contact ?? '').trim().slice(0, 120)
    if (!name || !relationship || !contact) throw new DomainError(Codes.INVALID_INPUT, 'A designee needs a name, a relationship and a contact.', { field: 'designee' })
    if (/insur|adjust|shop|northgate/i.test(relationship)) throw new DomainError(Codes.INVALID_INPUT, 'A designee cannot be the shop or an insurer (16 CCR §3354(c)).', { field: 'designee' })
    designee = { name, relationship, contact, namedAt: now.toISOString() }
  }

  // A non-cash order on a business account is refused, with the reason, while the account is on credit hold.
  const billing = await accountForNewOrder(tx, { customerId: checkIn.customerId, vehicleId: checkIn.vehicleId, kind: input.kind ?? 'standard', businessAccountId: input.businessAccountId, billTo: input.billTo }, now)
  const roNumber = await nextShopReference(tx, 'RO', shop.code, now)
  const pins = Object.fromEntries(Object.entries(POINTERS).map(([field, pointer]) => [field, (shop as any)[pointer]]))
  const ro = await tx.repairOrder.create({
    data: {
      shopId: shop.id, roNumber, kind: (billing.kind ?? input.kind ?? 'standard') as never, businessAccountId: billing.businessAccountId, fleetUnitId: billing.fleetUnitId, customerId: checkIn.customerId, vehicleId: checkIn.vehicleId,
      serviceAdvisorId: input.serviceAdvisorId ?? actorUserId(actor), appointmentId: (await tx.appointment.findFirst({ where: { checkIn: { id: checkIn.id } }, select: { id: true } }))?.id ?? null,
      odometerInId: checkIn.odometerInId, promisedAt: checkIn.promisedAt, waiter: checkIn.waiter, keyTag: checkIn.keyTag,
      designee: (designee ?? undefined) as never, openedAt: now, openedById: actorUserId(actor), status: 'draft', ...pins,
    },
  })
  for (const [i, words] of concerns.entries()) {
    await tx.concern.create({ data: { repairOrderId: ro.id, customerWords: words, category: concernCategory(words), sortOrder: i } })
  }
  await tx.checkIn.update({ where: { id: checkIn.id }, data: { repairOrderId: ro.id } })
  auditCreate(uow, actor, 'RepairOrder', ro.id, 'ro.created', { roNumber, shopId: shop.id, checkIn: checkIn.reference, pins, designee: designee ? { relationship: designee.relationship } : null })
  await transition(uow, { model: 'RepairOrder', id: ro.id, from: ['draft'], to: 'checked_in', actor, eventType: 'ro.checked_in' })
  return { id: ro.id, roNumber }
}

/** checked_in → in_service on the first job, inspection or clock (SM§2). */
export async function markInService(uow: UnitOfWork, actor: Actor, repairOrderId: string, cause: string) {
  const ro = await uow.tx.repairOrder.findUniqueOrThrow({ where: { id: repairOrderId }, select: { status: true } })
  if (ro.status === 'checked_in') await transition(uow, { model: 'RepairOrder', id: repairOrderId, from: ['checked_in'], to: 'in_service', actor, eventType: 'ro.in_service', metadata: { cause } })
}

export async function assertOpen(tx: Tx, repairOrderId: string) {
  const ro = await tx.repairOrder.findUnique({ where: { id: repairOrderId } })
  if (!ro) throw new DomainError(Codes.NOT_FOUND, 'Repair order not found.')
  if (!(OPEN_RO as readonly string[]).includes(ro.status) || ro.lockedAt) throw new DomainError(Codes.RO_LOCKED, `${ro.roNumber} is ${ro.status.replaceAll('_', ' ')}; it can't change.`, { currentStatus: ro.status })
  return ro
}

export async function setHold(uow: UnitOfWork, actor: Actor, input: { repairOrderId: string; expectedVersion: number; hold: boolean; reason?: string; note?: string }) {
  const reasons = ['customer_unreachable', 'parts_backorder', 'sublet_out', 'teardown_wait', 'other']
  if (input.hold) {
    if (!reasons.includes(String(input.reason))) throw new DomainError(Codes.INVALID_INPUT, `Choose why the car is on hold: ${reasons.join(', ').replaceAll('_', ' ')}.`, { field: 'reason' })
    return transition(uow, { model: 'RepairOrder', id: input.repairOrderId, from: ['in_service', 'checked_in'], to: 'on_hold', expectedVersion: input.expectedVersion, actor, eventType: 'ro.on_hold', reason: input.reason, data: { holdReason: input.reason, holdNote: String(input.note ?? '').slice(0, 300), heldAt: uow.now } })
  }
  return transition(uow, { model: 'RepairOrder', id: input.repairOrderId, from: ['on_hold'], to: 'in_service', expectedVersion: input.expectedVersion, actor, eventType: 'ro.resumed', data: { holdReason: 'none', holdNote: '', heldAt: null } })
}

// ── Pricing policy from the pins ──────────────────────────────────────────────

export async function pricingPolicy(tx: Tx, ro: { laborRateClassSetVersionId: string | null; laborMatrixVersionId: string | null; partsMatrixVersionId: string | null; feePolicyVersionId: string | null; taxRuleSetVersionId: string | null; jurisdictionPolicyVersionId: string | null }): Promise<PricingPolicy> {
  if (!ro.laborRateClassSetVersionId || !ro.partsMatrixVersionId || !ro.feePolicyVersionId || !ro.taxRuleSetVersionId || !ro.jurisdictionPolicyVersionId) throw new DomainError(Codes.POLICY_MISSING, 'This repair order has no pinned pricing policy.')
  const [classes, laborMatrix, partsMatrix, feeRules, taxSet, taxRules, law] = await Promise.all([
    tx.laborRateClass.findMany({ where: { setId: ro.laborRateClassSetVersionId }, include: { taxCategory: { select: { code: true } } } }),
    ro.laborMatrixVersionId ? tx.laborMatrixVersion.findUnique({ where: { id: ro.laborMatrixVersionId } }) : null,
    tx.partsMatrixVersion.findUniqueOrThrow({ where: { id: ro.partsMatrixVersionId } }),
    tx.feeRule.findMany({ where: { policyId: ro.feePolicyVersionId }, orderBy: { code: 'asc' } }),
    tx.taxRuleSetVersion.findUniqueOrThrow({ where: { id: ro.taxRuleSetVersionId } }),
    tx.taxRule.findMany({ where: { ruleSetId: ro.taxRuleSetVersionId }, include: { category: { select: { code: true } } } }),
    tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId } }),
  ])
  return {
    rateClasses: classes.map(c => ({ id: c.id, code: c.code, rateMinor: c.rateMinor, taxCategoryCode: c.taxCategory?.code ?? 'labor_repair', isDefault: c.isDefault })),
    laborMatrix: { bands: ((laborMatrix?.bands ?? []) as any[]).map(b => ({ ...b, factor: String(b.factor) })), appliesToClasses: (laborMatrix?.appliesToClasses ?? []) as string[] },
    partsMatrix: { tiers: (partsMatrix.tiers ?? []) as any[], categoryOverrides: (partsMatrix.categoryOverrides ?? {}) as Record<string, string>, marginFloorPct: partsMatrix.marginFloorPct.toString() },
    feeRules: feeRules.map(r => ({ id: r.id, code: r.code, kind: r.kind, base: r.base, percent: r.percent?.toString() ?? null, flatMinor: r.flatMinor, perUnitMinor: r.perUnitMinor, minMinor: r.minMinor, maxMinor: r.maxMinor, itemCategory: r.itemCategory, taxTreatment: r.taxTreatment, refundable: r.refundable, invoiceText: r.invoiceText })),
    taxRules: taxRules.map(r => ({ categoryCode: r.category?.code ?? '', categoryId: r.categoryId ?? '', taxable: r.taxable, rate: r.rate.toString() })),
    taxRounding: taxSet.rounding === 'per_invoice_category' ? 'per_invoice_category' : 'per_line',
    law: { requirePartCondition: law.requirePartCondition, shopSuppliesGenericAllowed: law.shopSuppliesGenericAllowed, subletDisclosureRequired: law.subletDisclosureRequired },
  }
}

// ── Line input from the API, checked ─────────────────────────────────────────

const KINDS: LineKind[] = ['labor', 'part', 'tire', 'core', 'sublet', 'discount', 'refrigerant', 'fee']
const int = (v: unknown, field: string, min = 0) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : /^-?\d+$/.test(String(v)) ? Number(String(v)) : NaN
  if (!Number.isSafeInteger(n) || n < min) throw new DomainError(Codes.INVALID_INPUT, `${field} must be a whole number of at least ${min}.`, { field })
  return n
}
const cents = (v: unknown, field: string) => {
  if (v === null || v === undefined || v === '') return null
  const text = String(v).trim()
  if (!/^\d{1,12}$/.test(text)) throw new DomainError(Codes.INVALID_INPUT, `${field} must be whole cents.`, { field })
  return BigInt(text)
}
const str = (v: unknown, max: number) => (v === null || v === undefined ? null : String(v).trim().slice(0, max))

/** Validate lines that arrive as JSON. Computed values (prices, tax, fees) are never accepted. */
export function parseLines(raw: unknown): LineInput[] {
  if (!Array.isArray(raw)) throw new DomainError(Codes.INVALID_INPUT, 'Lines must be a list.', { field: 'lines' })
  if (raw.length > 60) throw new DomainError(Codes.INVALID_INPUT, 'Sixty lines at most on one job.', { field: 'lines' })
  return raw.map((r: any, i) => {
    const kind = r?.kind as LineKind
    if (!KINDS.includes(kind)) throw new DomainError(Codes.INVALID_INPUT, `Line ${i + 1}: unknown kind.`, { field: 'kind' })
    return {
      ref: `L${i + 1}`, kind, description: str(r.description, 300) ?? '',
      rateClassCode: str(r.rateClassCode, 40), soldCentiHours: int(r.soldCentiHours, 'soldCentiHours'), guideCentiHours: int(r.guideCentiHours, 'guideCentiHours'), overlapCentiHours: int(r.overlapCentiHours, 'overlapCentiHours'),
      fabrication: Boolean(r.fabrication), operationCode: str(r.operationCode, 40), partNumber: str(r.partNumber, 60), brand: str(r.brand, 60), partCategory: str(r.partCategory, 40),
      condition: str(r.condition, 40) || null, quantityMilli: int(r.quantityMilli, 'quantityMilli', 1), unitCostMinor: cents(r.unitCostMinor, 'unitCostMinor'), unitPriceOverrideMinor: cents(r.unitPriceOverrideMinor, 'unitPriceOverrideMinor'),
      isNewTire: Boolean(r.isNewTire), subletVendorName: str(r.subletVendorName, 120), subletCostMinor: cents(r.subletCostMinor, 'subletCostMinor'), subletPriceMinor: cents(r.subletPriceMinor, 'subletPriceMinor'),
      discountMinor: cents(r.discountMinor, 'discountMinor'), discountTargetRef: str(r.discountTargetRef, 10),
      ...(r.variant ? { variant: str(r.variant, 120) } : {}),
    } as LineInput & { variant?: string | null }
  })
}

/**
 * Lines typed by a machine (an assistant's tool step or an MCP token) carry no money decisions (I§8 never exposed):
 * no discount line, no price override, no negative amount. Discounts and price overrides are a person's call
 * (applyDiscount, overrideLinePrice), with the manager approval they need.
 */
const PRICE_DECISION_FIELDS = ['unitPriceOverrideMinor', 'discountMinor', 'discountTargetRef', 'subletPriceMinor']
export function assertAgentLines(raw: unknown) {
  if (raw === undefined || raw === null) return
  if (!Array.isArray(raw)) throw new DomainError(Codes.INVALID_INPUT, 'Lines must be a list.', { field: 'lines' })
  raw.forEach((r: any, i) => {
    if (!r || typeof r !== 'object') throw new DomainError(Codes.INVALID_INPUT, `Line ${i + 1} is not a line.`, { field: 'lines' })
    if (r.kind === 'discount') throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, `Line ${i + 1}: an assistant cannot give a discount. A person does that.`, { field: 'kind' })
    for (const f of PRICE_DECISION_FIELDS) if (r[f] !== undefined && r[f] !== null && r[f] !== '') throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, `Line ${i + 1}: an assistant cannot set ${f === 'subletPriceMinor' ? 'a sublet price' : f.startsWith('discount') ? 'a discount' : 'a price override'}. Prices come from the shop's matrix and rates; a person overrides them.`, { field: f })
    for (const [k, v] of Object.entries(r)) if (/(Minor|Milli|CentiHours)$/.test(k) && ((typeof v === 'number' && v < 0) || (typeof v === 'string' && /^\s*-/.test(v)))) throw new DomainError(Codes.AGENT_FORBIDDEN_ACTION, `Line ${i + 1}: an assistant cannot enter a negative amount.`, { field: k })
  })
}
const machineLines = (actor: Actor, raw: unknown) => { if (isMachine(actor)) assertAgentLines(raw) }

/** Rows of a job back to inputs (for re-pricing). Auto (fee) lines are recomputed, never re-entered. */
export function linesToInputs(rows: any[]): (LineInput & { variant?: string | null })[] {
  return rows.filter(r => !r.auto).sort((a, b) => a.sortOrder - b.sortOrder).map((r, i) => ({
    ref: `L${i + 1}`, kind: r.kind, description: r.description, rateClassCode: r.override?.rateClassCode ?? null, soldCentiHours: r.soldCentiHours, guideCentiHours: r.guideCentiHours, overlapCentiHours: r.overlapCentiHours,
    fabrication: r.taxCategoryCode === 'labor_fabrication', operationCode: r.guideSnapshot?.operationId ?? null, partNumber: r.partNumber, brand: r.brand, partCategory: r.partCategory, condition: r.condition ?? null,
    quantityMilli: r.quantityMilli, unitCostMinor: r.kind === 'labor' || r.kind === 'sublet' || r.kind === 'discount' ? null : r.unitCostMinor, unitPriceOverrideMinor: r.override?.unitPriceOverrideMinor ? BigInt(r.override.unitPriceOverrideMinor) : null,
    isNewTire: r.isNewTire, subletVendorName: r.subletVendorName, subletCostMinor: r.subletCostMinor, subletPriceMinor: r.kind === 'sublet' ? r.unitPriceMinor : null,
    discountMinor: r.kind === 'discount' ? -BigInt(r.extendedMinor) : null, discountTargetRef: r.override?.discountTargetRef ?? null,
    ...(r.guideSnapshot ? { variant: r.override?.variant ?? r.guideSnapshot.variant ?? '' } : {}),
  }))
}

// ── Labor guide ───────────────────────────────────────────────────────────────

/** Resolve a labor line's operation code through the guide. Several variants → GUIDE_AMBIGUOUS unless one is chosen. */
export async function resolveGuide(tx: Tx, shopId: string, vehicleId: string | null, actor: Actor, line: LineInput & { variant?: string | null }) {
  if (line.kind !== 'labor' || !line.operationCode) return null
  const vehicle = vehicleId ? await tx.vehicle.findUnique({ where: { id: vehicleId }, select: { year: true, make: true, model: true, engine: true } }) : null
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { name: true } })
  const load = async (): Promise<LibraryRow[]> => (await tx.laborOperation.findMany({ where: { code: line.operationCode!, OR: [{ shopId }, { shopId: null }] } })) as unknown as LibraryRow[]
  const guide = laborGuide(load, shop.name)
  const found = await guide.searchOperations(vehicle ?? {}, { code: line.operationCode })
  if (found.kind === 'error') throw new DomainError(Codes.PROVIDER_UNAVAILABLE, 'The labor guide did not answer. Enter the hours by hand.', { reason: found.code })
  let rows: GuideOperation[] = found.value
  if (line.variant !== undefined && line.variant !== null) rows = rows.filter(r => (r.variant ?? '') === line.variant)
  if (!rows.length) throw new DomainError(Codes.NOT_FOUND, `No labor time ${line.operationCode} fits this vehicle.`, { field: 'operationCode' })
  if (rows.length > 1) {
    // R§17.2: never guess between variants. A person picks one; an assistant is refused outright.
    const candidates = rows.map(r => ({ operationCode: line.operationCode, operationId: r.operationId, variant: r.variant ?? '', centiHours: r.centiHours, description: r.description }))
    throw new DomainError(Codes.GUIDE_AMBIGUOUS, isMachine(actor) ? 'Several labor-guide variants match. A person must choose one.' : `Several versions of ${line.operationCode} fit this vehicle. Choose one.`, { candidates })
  }
  return { op: rows[0], snapshot: guideSnapshot(guide.key, rows[0], new Date()) }
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type JobInput = {
  repairOrderId: string
  title: string
  kind?: string
  concernId?: string | null
  customerDescription?: string | null
  cannedJobId?: string | null
  inspectionItemResultId?: string | null
  source?: string
  urgency?: 'none' | 'green' | 'yellow' | 'red'
  lines?: unknown
  teardown?: { teardownCostMinor: string; reassemblyCostMinor: string; areaDescription: string; maxReassemblyDays?: number; restorationWarning?: boolean } | null
}

const JOB_KINDS = ['repair', 'maintenance', 'diagnosis', 'inspection', 'teardown', 'reassembly', 'tire', 'sublet', 'comeback', 'internal']

export async function addJob(uow: UnitOfWork, actor: Actor, input: JobInput) {
  const { tx, now } = uow
  const ro = await lockRow<any>(tx, 'RepairOrder', input.repairOrderId)
  await assertOpen(tx, ro.id)
  const title = String(input.title ?? '').trim().slice(0, 160)
  machineLines(actor, input.lines)
  let lines = input.lines === undefined ? [] : parseLines(input.lines)
  let kind = input.kind ?? 'repair'
  let cannedJobVersionId: string | null = null
  let customerDescription = str(input.customerDescription, 1000) ?? ''
  if (input.cannedJobId) {
    const canned = await tx.cannedJob.findUnique({ where: { id: input.cannedJobId }, include: { currentVersion: true } })
    if (!canned?.currentVersion || canned.currentVersion.status !== 'published') throw new DomainError(Codes.NOT_FOUND, 'That canned job has no published version.')
    cannedJobVersionId = canned.currentVersion.id
    if (input.lines === undefined) lines = parseLines(canned.currentVersion.lines)
    kind = canned.currentVersion.kind
    customerDescription = customerDescription || canned.currentVersion.customerDescription
  }
  if (!title) throw new DomainError(Codes.INVALID_INPUT, 'Give the job a title.', { field: 'title' })
  if (!JOB_KINDS.includes(kind)) throw new DomainError(Codes.INVALID_INPUT, 'Unknown job kind.', { field: 'kind' })
  if (input.concernId) {
    const concern = await tx.concern.findUnique({ where: { id: input.concernId }, select: { repairOrderId: true } })
    if (concern?.repairOrderId !== ro.id) throw new DomainError(Codes.INVALID_INPUT, 'That concern is on another repair order.', { field: 'concernId' })
  }
  const last = await tx.job.findFirst({ where: { repairOrderId: ro.id }, orderBy: { number: 'desc' }, select: { number: true } })
  const job = await tx.job.create({
    data: {
      repairOrderId: ro.id, number: (last?.number ?? 0) + 1, title, kind, concernId: input.concernId ?? null, customerDescription, cannedJobVersionId,
      inspectionItemResultId: input.inspectionItemResultId ?? null, source: input.source ?? (cannedJobVersionId ? 'canned_job' : isMachine(actor) ? 'agent' : 'manual'), urgency: input.urgency ?? 'none', status: 'draft',
    },
  })
  // Work on a business account's repair order is billed to the account (its hold, limit, certificate, PO rule and terms then apply at invoicing).
  // The repair order carries no account only when the driver pays (bill to customer), and then the customer pays it all.
  const account = ro.businessAccountId ? await tx.businessAccount.findUnique({ where: { id: ro.businessAccountId }, select: { id: true, name: true } }) : null
  await tx.payerSplit.create({ data: account ? { jobId: job.id, payerKind: 'business_account', businessAccountId: account.id, payorName: account.name, percent: '100.000000' } : { jobId: job.id, payerKind: 'customer', percent: '1.000000' } })
  if (kind === 'teardown') await saveTeardown(uow, job.id, ro.jurisdictionPolicyVersionId, input.teardown)
  auditCreate(uow, actor, 'Job', job.id, 'job.created', { repairOrderId: ro.id, number: job.number, title, kind, cannedJobVersionId, source: job.source })
  await markInService(uow, actor, ro.id, 'job')
  let priced: Awaited<ReturnType<typeof writeAndPrice>> | null = null
  try {
    priced = lines.length ? await writeAndPrice(uow, actor, job.id, lines) : null
  } catch (error) {
    // A finding or canned job whose labor time has several variants for this car: keep the job as a
    // draft with its lines waiting, and let a person choose (R§17.2). The guide is read before any
    // write, so the transaction is still clean. Typed-in jobs still get the error straight away.
    if (!(error instanceof DomainError && error.code === Codes.GUIDE_AMBIGUOUS && input.lines === undefined && cannedJobVersionId)) throw error
    const pending = toJsonValue({ at: now, problems: [error.message], pendingLines: input.cannedJobId ? (await tx.cannedJobVersion.findUniqueOrThrow({ where: { id: cannedJobVersionId } })).lines : [], candidates: error.details.candidates ?? [] })
    await tx.job.update({ where: { id: job.id }, data: { priceSnapshot: pending as never } })
    return { id: job.id, number: job.number, status: 'draft', problems: [error.message], totalMinor: '0', candidates: error.details.candidates ?? [] }
  }
  return { id: job.id, number: job.number, status: priced?.status ?? 'draft', problems: priced?.problems ?? [], totalMinor: priced?.totalMinor ?? '0' }
}

async function saveTeardown(uow: UnitOfWork, jobId: string, lawId: string, input: JobInput['teardown']) {
  const law = await uow.tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: lawId } })
  const rules = (law.teardownRules ?? {}) as { maxReassemblyDaysDefault?: number; disclosureText?: string }
  if (!input) throw new DomainError(Codes.DISCLOSURE_MISSING, 'A teardown job needs its disclosure: teardown cost, reassembly cost and the area to be torn down (16 CCR §3353(c)).', { field: 'teardown', missing: ['teardown'] })
  const row = await uow.tx.teardownDisclosure.create({
    data: {
      teardownCostMinor: cents(input.teardownCostMinor, 'teardownCostMinor') ?? 0n, reassemblyCostMinor: cents(input.reassemblyCostMinor, 'reassemblyCostMinor') ?? 0n,
      areaDescription: String(input.areaDescription ?? '').slice(0, 300), maxReassemblyDays: int(input.maxReassemblyDays, 'maxReassemblyDays', 1) ?? rules.maxReassemblyDaysDefault ?? 3,
      restorationWarning: Boolean(input.restorationWarning), disclosureText: rules.disclosureText ?? '', disclosureTextVersion: lawId,
    },
  })
  await uow.tx.job.update({ where: { id: jobId }, data: { teardownDisclosureId: row.id } })
}

/** Replace a job's entered lines and price it. */
export async function setJobLines(uow: UnitOfWork, actor: Actor, input: { jobId: string; expectedVersion: number; lines: unknown }) {
  machineLines(actor, input.lines)
  const lines = parseLines(input.lines)
  // Lock before reading the version (RO then job, the order writeAndPrice uses), so two saves on one version can't both pass.
  // One statement locks both rows; command() retries the rare deadlock.
  const [job] = await uow.tx.$queryRaw<{ version: number }[]>`SELECT j.version FROM "Job" j JOIN "RepairOrder" r ON r.id = j."repairOrder" WHERE j.id = ${String(input.jobId ?? '')} FOR UPDATE`
  if (!job) throw new DomainError(Codes.NOT_FOUND, 'Job not found.')
  if (job.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The job changed since you loaded it. Reload and try again.', { currentVersion: job.version })
  return writeAndPrice(uow, actor, input.jobId, lines)
}

async function jobAt(uow: UnitOfWork, jobId: string, expectedVersion: number) {
  const job = await uow.tx.job.findUnique({ where: { id: jobId }, select: { version: true, priceSnapshot: true } })
  if (!job) throw new DomainError(Codes.NOT_FOUND, 'Job not found.')
  if (job.version !== expectedVersion) throw new DomainError(Codes.STALE_STATE, 'The job changed since you loaded it. Reload and try again.', { currentVersion: job.version })
  return job
}

/**
 * Edits from the RO screen work on the stored lines server-side, so the screen never needs (or
 * sees) part cost: append lines, remove one line, or choose a labor-guide variant.
 */
export async function editJobLines(uow: UnitOfWork, actor: Actor, input: { jobId: string; expectedVersion: number; add?: unknown; removeLineId?: string | null; choose?: { operationCode: string; variant: string } | null }) {
  const job = await jobAt(uow, input.jobId, input.expectedVersion)
  const rows = await uow.tx.jobLine.findMany({ where: { jobId: input.jobId } })
  const pending = (job.priceSnapshot as { pendingLines?: unknown[] } | null)?.pendingLines
  let lines = rows.length || !Array.isArray(pending) ? linesToInputs(rows.filter(r => r.id !== input.removeLineId)) : parseLines(pending)
  if (input.removeLineId && !rows.some(r => r.id === input.removeLineId && !r.auto)) throw new DomainError(Codes.NOT_FOUND, 'That line is not on this job.', { field: 'removeLineId' })
  if (input.add !== undefined && input.add !== null) machineLines(actor, Array.isArray(input.add) ? input.add : [input.add])
  if (input.add !== undefined && input.add !== null) lines = [...lines, ...parseLines(Array.isArray(input.add) ? input.add : [input.add])]
  if (input.choose) {
    const { operationCode, variant } = input.choose
    if (!lines.some(l => l.kind === 'labor' && l.operationCode === operationCode)) throw new DomainError(Codes.NOT_FOUND, `No ${operationCode} labor line on this job.`, { field: 'operationCode' })
    lines = lines.map(l => (l.kind === 'labor' && l.operationCode === operationCode ? { ...l, variant: String(variant).slice(0, 120) } : l))
  }
  if (lines.length > 60) throw new DomainError(Codes.INVALID_INPUT, 'Sixty lines at most on one job.', { field: 'lines' })
  return writeAndPrice(uow, actor, input.jobId, lines.map((l, i) => ({ ...l, ref: `L${i + 1}` })))
}

/** Re-price a job from its stored lines (e.g. after a guide or cost change). */
export async function repriceJob(uow: UnitOfWork, actor: Actor, jobId: string) {
  const rows = await uow.tx.jobLine.findMany({ where: { jobId } })
  return writeAndPrice(uow, actor, jobId, linesToInputs(rows))
}

/**
 * The one place job lines are written (SM§3 → priced, §8). Holds the RO row lock and the
 * ro-pricing advisory lock; reads the pinned policy; writes lines, totals, the snapshot and the
 * content hash; and moves the job: draft ⇄ priced, offered → priced (the sent version no longer
 * matches), authorized/in_progress → needs_reauthorization above the ceiling, and back on revert.
 */
export async function writeAndPrice(uow: UnitOfWork, actor: Actor, jobId: string, inputs: (LineInput & { variant?: string | null })[]) {
  const { tx, now } = uow
  const head = await tx.job.findUnique({ where: { id: jobId }, select: { repairOrderId: true } })
  if (!head?.repairOrderId) throw new DomainError(Codes.NOT_FOUND, 'Job not found.')
  const ro = await lockRow<any>(tx, 'RepairOrder', head.repairOrderId)
  await advisoryLock(tx, `ro-pricing:${ro.id}`)
  await assertOpen(tx, ro.id)
  const job = await lockRow<any>(tx, 'Job', jobId)
  if (!(EDITABLE_JOB as readonly string[]).includes(job.status)) throw new DomainError(Codes.INVALID_TRANSITION, `Job ${job.number} is ${job.status.replaceAll('_', ' ')}; its lines can't change.`, { currentStatus: job.status })

  const guides: Record<string, unknown> = {}
  const overlaps: Record<string, { operationId: string; deductCentiHours: number }[]> = {}
  for (const line of inputs) {
    const resolved = await resolveGuide(tx, ro.shopId, ro.vehicleId, actor, line)
    if (!resolved) continue
    line.guideCentiHours = resolved.op.centiHours
    if (!line.soldCentiHours) line.soldCentiHours = resolved.op.centiHours
    if (!line.rateClassCode && resolved.op.rateClass) line.rateClassCode = resolved.op.rateClass
    if (!line.description) line.description = resolved.op.description + (resolved.op.variant ? ` (${resolved.op.variant})` : '')
    line.variant = resolved.op.variant ?? ''
    guides[line.ref] = resolved.snapshot
    overlaps[line.ref] = resolved.op.overlapsWith ?? []
  }
  // Overlap (I§2): when two guide operations on one job overlap, the shared time is deducted once,
  // from the operation that includes the other. Only applied while the hours are still the guide's.
  const codes = new Set(inputs.filter(l => l.kind === 'labor' && l.operationCode).map(l => l.operationCode))
  for (const line of inputs) {
    const deduct = (overlaps[line.ref] ?? []).filter(o => codes.has(o.operationId)).reduce((n, o) => n + (Number.isSafeInteger(o.deductCentiHours) ? o.deductCentiHours : 0), 0)
    if (deduct > 0 && line.soldCentiHours === line.guideCentiHours) {
      line.overlapCentiHours = deduct
      line.soldCentiHours = Math.max(1, (line.soldCentiHours ?? 0) - deduct)
    }
  }

  const policy = await pricingPolicy(tx, ro)
  const price = priceJob(inputs, policy)
  await tx.jobLine.deleteMany({ where: { jobId } })
  const taxCategories = new Map((await tx.taxCategory.findMany({ select: { id: true, code: true } })).map(c => [c.code, c.id]))
  const rateClassIds = new Map(policy.rateClasses.map(c => [c.code, c.id]))
  for (const [i, l] of price.lines.entries()) {
    const input = inputs.find(x => x.ref === l.ref)
    await tx.jobLine.create({
      data: {
        jobId, kind: l.kind, description: l.description, auto: l.auto, rateClassId: l.rateClassCode ? rateClassIds.get(l.rateClassCode) ?? null : null, soldCentiHours: l.soldCentiHours, guideCentiHours: l.guideCentiHours,
        overlapCentiHours: l.overlapCentiHours, guideSnapshot: (guides[l.ref] ?? undefined) as never, rateMinor: l.rateMinor, partNumber: l.partNumber, brand: l.brand, partCategory: l.partCategory, condition: l.condition,
        quantityMilli: l.quantityMilli, unitCostMinor: l.unitCostMinor, unitPriceMinor: l.unitPriceMinor, matrixTierSnapshot: (l.matrixTier ?? undefined) as never, isNewTire: l.isNewTire,
        subletVendorName: l.subletVendorName, subletCostMinor: l.subletCostMinor, feeRuleId: l.feeRuleId, feeCode: l.feeCode, taxCategoryId: taxCategories.get(l.taxCategoryCode) ?? null, taxCategoryCode: l.taxCategoryCode,
        taxable: l.taxable, taxRate: l.taxRate, extendedMinor: l.extendedMinor, taxMinor: l.taxMinor, sortOrder: i,
        override: toJsonValue({ rateClassCode: input?.rateClassCode ?? null, variant: input?.variant ?? null, unitPriceOverrideMinor: input?.unitPriceOverrideMinor ?? null, discountTargetRef: input?.discountTargetRef ?? null }) as never,
      },
    })
  }

  const problems = [...price.problems]
  // SM§7 trust gate: a job resting on an uncleared diagnosis is never priced. An assistant is refused outright; a person's
  // lines are kept as a draft with the reason, and become priced once the diagnosis is ready to quote.
  try {
    if (job.concernId || job.addressesHypothesisId) await assertDiagnosisCleared(tx, [jobId])
  } catch (error) {
    if (!(error instanceof DomainError) || error.code !== Codes.TRUST_GATE || isMachine(actor)) throw error
    problems.push(error.message)
  }
  // SM§8: a price below the margin floor needs canApprovePriceOverride. A manager pricing it is the approval (recorded in the snapshot).
  // An assistant or MCP token never writes a below-floor price, approved or not: refused, nothing is written.
  if (price.belowFloor.length && isMachine(actor)) throw new DomainError(Codes.PRICE_OVERRIDE_REQUIRED, `Price below the margin floor on ${price.belowFloor.join(', ')}. Only a manager can approve that, in the dashboard.`, { lines: price.belowFloor })
  const floorApprovedBy = price.belowFloor.length && can(actor, 'canApprovePriceOverride') ? actorUserId(actor) : null
  if (price.belowFloor.length && !floorApprovedBy) problems.push(`Price below the margin floor on ${price.belowFloor.join(', ')}: a manager must approve the override.`)
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId }, select: { toleranceRule: true } })
  const rule = parseToleranceRule(law.toleranceRule)
  const identity = identityHash(price.lines.filter(l => !l.auto))
  const snapshot = toJsonValue({ at: now, problems, belowFloor: price.belowFloor, floorApprovedBy, policy: pinsOf(ro), totals: totalsOf(price), identityHash: identity })
  const amounts = { subtotalMinor: price.subtotalMinor, taxMinor: price.taxMinor, totalMinor: price.totalMinor, laborMinor: price.laborMinor, partsMinor: price.partsMinor, feesMinor: price.feesMinor, costMinor: price.costMinor, marginMinor: price.marginMinor }

  let to: string = job.status
  let reason: string | null = null
  if (AUTHORIZED_LIKE.includes(job.status)) {
    const compared = rule.includesTax ? price.totalMinor : price.subtotalMinor
    const ceiling = chargeCeilingMinor(rule, rule.includesTax ? job.authorizedAmountMinor : job.authorizedSubtotalMinor)
    if (price.contentHash === job.authorizedContentHash) to = job.workStartedAt ? 'in_progress' : 'authorized'
    else if (compared > ceiling) { to = 'needs_reauthorization'; reason = `New price ${formatMinor(compared)} is above the authorized ceiling ${formatMinor(ceiling)}.` }
    else if (identity !== job.authorizedIdentityHash) { to = 'needs_reauthorization'; reason = 'A part, condition or labor class changed on authorized work (I-R5).' }
    else if (problems.length) { to = 'needs_reauthorization'; reason = problems[0] }
    // Within the ceiling with the same identities (a cheaper part from the same source): stays authorized.
  } else {
    to = problems.length || !price.lines.length ? 'draft' : 'priced'
  }

  const data = { ...amounts, contentHash: price.lines.length && !problems.length ? price.contentHash : '', priceSnapshot: snapshot as never, reauthorizationReason: to === 'needs_reauthorization' ? reason ?? '' : '' }
  if (to === job.status) {
    await tx.job.update({ where: { id: jobId }, data: { ...data, version: { increment: 1 } } })
    auditCreate(uow, actor, 'Job', jobId, 'job.repriced', { contentHash: data.contentHash, totalMinor: price.totalMinor, lines: price.lines.length, problems: problems.length })
  } else {
    await transition(uow, { model: 'Job', id: jobId, from: [job.status], to, actor, eventType: to === 'needs_reauthorization' ? 'job.needs_reauthorization' : `job.${to}`, reason, data })
  }
  await refreshRoTotals(tx, ro.id)
  return { id: jobId, status: to, problems, contentHash: data.contentHash, totalMinor: price.totalMinor.toString(), subtotalMinor: price.subtotalMinor.toString(), taxMinor: price.taxMinor.toString(), reason }
}

const pinsOf = (ro: any) => Object.fromEntries(Object.keys(POINTERS).map(k => [k, ro[k]]))
const totalsOf = (p: JobPrice) => ({ labor: p.laborMinor, parts: p.partsMinor, sublet: p.subletMinor, fees: p.feesMinor, discount: p.discountMinor, subtotal: p.subtotalMinor, tax: p.taxMinor, total: p.totalMinor })

export async function refreshRoTotals(tx: Tx, repairOrderId: string) {
  const jobs = await tx.job.findMany({ where: { repairOrderId, status: { notIn: ['declined', 'deferred', 'voided'] } }, select: { totalMinor: true, authorizedAmountMinor: true, status: true } })
  const current = jobs.reduce((n, j) => n + j.totalMinor, 0n)
  const authorized = jobs.filter(j => ['authorized', 'in_progress', 'needs_reauthorization', 'completed'].includes(j.status)).reduce((n, j) => n + j.authorizedAmountMinor, 0n)
  await tx.repairOrder.update({ where: { id: repairOrderId }, data: { currentTotalMinor: current, authorizedTotalMinor: authorized } })
}

/** A technician who starts refrigerant work needs a current EPA Section 609 certificate (I-R11). */
async function assertActorCredential(uow: UnitOfWork, actor: Actor, jobId: string, repairOrderId: string) {
  const userId = actorUserId(actor)
  if (!userId) return
  const ro = await uow.tx.repairOrder.findUnique({ where: { id: repairOrderId }, select: { shopId: true } })
  const profile = ro?.shopId ? await uow.tx.technicianProfile.findFirst({ where: { userId, shopId: ro.shopId, active: true }, select: { id: true } }) : null
  if (profile) await assertCredentialForJob(uow.tx, profile.id, jobId, uow.now)
}

/** authorized → in_progress (I-R1: work starts only on authorized jobs). */
export async function startJob(uow: UnitOfWork, actor: Actor, input: { jobId: string; expectedVersion: number }) {
  const job = await uow.tx.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { repairOrderId: true } })
  await assertOpen(uow.tx, job.repairOrderId!)
  await assertActorCredential(uow, actor, input.jobId, job.repairOrderId!)
  const row = await transition(uow, {
    model: 'Job', id: input.jobId, from: ['authorized'], to: 'in_progress', expectedVersion: input.expectedVersion, actor, eventType: 'job.started', data: { workStartedAt: uow.now },
    guard: (j: any) => { if (!j.currentAuthorizationId && !j.noChargeReason && !j.belowThresholdRecordedAt) throw new DomainError(Codes.AUTHORIZATION_REQUIRED, 'Work cannot start before the customer authorizes it.') },
  })
  await markInService(uow, actor, job.repairOrderId!, 'job_started')
  return { id: row.id, status: 'in_progress' }
}

/** in_progress → completed: the concern's cause and correction are written (the BAR story). */
export async function completeJob(uow: UnitOfWork, actor: Actor, input: { jobId: string; expectedVersion: number; cause: string; correction: string }) {
  const cause = String(input.cause ?? '').trim().slice(0, 1000)
  const correction = String(input.correction ?? '').trim().slice(0, 1000)
  if (!cause || !correction) throw new DomainError(Codes.INVALID_INPUT, 'Write the cause and the correction before completing the job.', { field: !cause ? 'cause' : 'correction' })
  const job = await uow.tx.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { concernId: true, repairOrderId: true } })
  await assertOpen(uow.tx, job.repairOrderId!)
  await transition(uow, { model: 'Job', id: input.jobId, from: ['in_progress'], to: 'completed', expectedVersion: input.expectedVersion, actor, eventType: 'job.completed', data: { completedAt: uow.now } })
  if (job.concernId) await uow.tx.concern.update({ where: { id: job.concernId }, data: { cause, correction } })
  await releaseJobReservations(uow, actor, input.jobId, 'Job finished: the unused reservation goes back to stock')
  const ro = await uow.tx.repairOrder.findUniqueOrThrow({ where: { id: job.repairOrderId! }, select: { shopId: true, warrantyTermSetVersionId: true } })
  // The job carries the shop's standard warranty term from the set pinned on the order (I-W1), unless one was chosen.
  if (!(await uow.tx.job.findUnique({ where: { id: input.jobId }, select: { warrantyTermId: true } }))?.warrantyTermId && ro.warrantyTermSetVersionId) {
    const term = await uow.tx.warrantyTerm.findFirst({ where: { termSetId: ro.warrantyTermSetVersionId, code: 'standard' }, select: { id: true } })
    if (term) await uow.tx.job.update({ where: { id: input.jobId }, data: { warrantyTermId: term.id } })
  }
  if ((await shopPolicy(uow.tx, ro.shopId!)).flagHoursAt === 'job_completed') await flagJob(uow, actor, input.jobId, 'job.completed')
  return { id: input.jobId, status: 'completed' }
}

/** Pre-work void (SM§3). A job the customer authorized can still be withdrawn before any part is issued or any time is clocked; its reservation is released. */
export async function voidJob(uow: UnitOfWork, actor: Actor, input: { jobId: string; expectedVersion: number; reason: string }) {
  const reason = String(input.reason ?? '').trim().slice(0, 300)
  if (!reason) throw new DomainError(Codes.INVALID_INPUT, 'Say why the job is removed.', { field: 'reason' })
  await transition(uow, {
    model: 'Job', id: input.jobId, from: ['draft', 'priced', 'offered', 'authorized', 'declined', 'deferred'], to: 'voided', expectedVersion: input.expectedVersion, actor, eventType: 'job.voided', reason,
    guard: async (j: any) => {
      if (j.workStartedAt) throw new DomainError(Codes.GUARD_FAILED, 'Work has started on this job, so it cannot be voided.')
      const issued = await uow.tx.stockMovement.count({ where: { jobId: j.id, type: 'issue' } })
      if (issued) throw new DomainError(Codes.GUARD_FAILED, 'Parts were issued to this job. Return them to stock before voiding it.')
    },
  })
  await releaseJobReservations(uow, actor, input.jobId, `Job voided: ${reason}`)
  const job = await uow.tx.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { repairOrderId: true } })
  await refreshRoTotals(uow.tx, job.repairOrderId!)
  return { id: input.jobId, status: 'voided' }
}

export const contentHashOf = (value: unknown) => sha256(canonicalJson(value))
