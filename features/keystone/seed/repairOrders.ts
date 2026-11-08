import { createHash } from 'node:crypto'
import { auditCreate } from '../lib/cas'
import type { Actor } from '../lib/actor'
import { checkInVehicle } from '../lib/checkIn'
import { addJob, openRepairOrder, setJobLines } from '../lib/repairOrders'
import { completeInspection, createInspection, recordItemResult, startInspection } from '../lib/inspections'
import { issueEstimate, recordAuthorization } from '../lib/authorization'
import type { UnitOfWork } from '../lib/unitOfWork'

/*
 * Phase 2 demo data: the shop's labor times, an inspection template and canned jobs (published v1
 * each), then the golden California brake RO for Patricia Lindqvist's 2014 BMW 328i, driven through
 * the real commands: check-in, open, inspect, findings to jobs, estimate, phone authorization.
 */

const NGA = 'seed_shop_nga'

/** The shop's own labor times (SCHEMA §2.2a), organisation-wide unless a shop is set. */
export const LABOR_OPERATIONS = [
  { id: 'seed_lop_brk_pad_f', code: 'BRK-PAD-F', description: 'Front brake pads, replace', centiHours: 110, skillLevel: 'c', rateClassCode: 'general', includes: ['Clean and lube slides', 'Road test'] },
  {
    id: 'seed_lop_brk_rot_f', code: 'BRK-ROT-F', description: 'Front brake rotors, replace (both)', centiHours: 80, skillLevel: 'c', rateClassCode: 'general', includes: ['Hub cleanup'],
    overlaps: [{ operationCode: 'BRK-PAD-F', deductCentiHours: 30 }],
  },
  // Two BMW 3-series variants: the guide must not guess (GUIDE_AMBIGUOUS). The xDrive one takes longer.
  { id: 'seed_lop_brk_pad_f_bmw', code: 'BRK-PAD-F', variant: 'With wear sensor (RWD)', description: 'Front brake pads and wear sensor, replace', centiHours: 130, skillLevel: 'c', rateClassCode: 'general', vehicleFilter: { makes: ['BMW'], models: ['328i', '335i', '320i'] } },
  { id: 'seed_lop_brk_pad_f_bmw_x', code: 'BRK-PAD-F', variant: 'With wear sensor (xDrive)', description: 'Front brake pads and wear sensor, replace', centiHours: 150, skillLevel: 'c', rateClassCode: 'general', vehicleFilter: { makes: ['BMW'], models: ['328i', '335i', '320i'] } },
  { id: 'seed_lop_oil', code: 'OIL-CHG', description: 'Engine oil and filter, change', centiHours: 50, skillLevel: 'c', rateClassCode: 'general', includes: ['Top off fluids', 'Reset service indicator'] },
  { id: 'seed_lop_diag', code: 'DIAG-1', description: 'Diagnostic time, first hour', centiHours: 100, skillLevel: 'a', rateClassCode: 'diagnostic' },
  { id: 'seed_lop_rotate', code: 'TIRE-ROT', description: 'Rotate tires and set pressures', centiHours: 40, skillLevel: 'c', rateClassCode: 'general' },
  { id: 'seed_lop_mount4', code: 'TIRE-MNT-4', description: 'Mount and balance four tires', centiHours: 100, skillLevel: 'c', rateClassCode: 'general', includes: ['New valve stems', 'TPMS relearn'] },
  { id: 'seed_lop_wiper', code: 'WIPER-F', description: 'Front wiper blades, replace', centiHours: 20, skillLevel: 'c', rateClassCode: 'general' },
  { id: 'seed_lop_cabin', code: 'FILTER-CABIN', description: 'Cabin air filter, replace', centiHours: 30, skillLevel: 'c', rateClassCode: 'general' },
] as { id: string; code: string; variant?: string; description: string; centiHours: number; skillLevel: string; rateClassCode: string; includes?: string[]; overlaps?: unknown[]; vehicleFilter?: unknown }[]

type CannedLine = Record<string, unknown>
export const CANNED_JOBS: { id: string; code: string; name: string; category: string; kind: string; description: string; lines: CannedLine[] }[] = [
  {
    id: 'seed_cj_brakes_front', code: 'BRAKES-FRONT', name: 'Front brake pads and rotors', category: 'brakes', kind: 'repair',
    description: 'Replace the front brake pads and both front rotors, clean and lubricate the caliper slides, and road test.',
    lines: [
      { kind: 'labor', description: 'Front brake pads, replace', operationCode: 'BRK-PAD-F' },
      { kind: 'labor', description: 'Front rotors, replace (overlap with pads)', operationCode: 'BRK-ROT-F' },
      { kind: 'part', description: 'Front brake pad set', partNumber: 'P06075', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '4800' },
      { kind: 'part', description: 'Front brake rotor', partNumber: '09.C394.13', brand: 'Brembo', partCategory: 'brakes', condition: 'new', quantityMilli: 2000, unitCostMinor: '6500' },
    ],
  },
  {
    id: 'seed_cj_wear_sensor', code: 'BRAKE-SENSOR-F', name: 'Front brake wear sensor', category: 'brakes', kind: 'repair',
    description: 'Replace the front brake pad wear sensor.',
    lines: [
      { kind: 'labor', description: 'Front brake wear sensor, replace', rateClassCode: 'general', soldCentiHours: 20 },
      { kind: 'part', description: 'Brake pad wear sensor, front', partNumber: '34356792289', brand: 'BMW', partCategory: 'brakes', condition: 'new', quantityMilli: 1000, unitCostMinor: '1450' },
    ],
  },
  {
    id: 'seed_cj_oil', code: 'OIL-SYN', name: 'Synthetic oil and filter change', category: 'maintenance', kind: 'maintenance',
    description: 'Drain and refill with full synthetic oil, new filter, top off fluids.',
    lines: [
      { kind: 'labor', description: 'Oil and filter change', operationCode: 'OIL-CHG' },
      { kind: 'part', description: 'Full synthetic oil 5W-30, quart', partNumber: 'MOB1-5W30', brand: 'Mobil 1', partCategory: 'fluids', condition: 'new', quantityMilli: 6500, unitCostMinor: '620' },
      { kind: 'part', description: 'Oil filter', partNumber: 'HU816X', brand: 'MANN', partCategory: 'filters', condition: 'new', quantityMilli: 1000, unitCostMinor: '950' },
    ],
  },
  {
    id: 'seed_cj_wipers', code: 'WIPERS', name: 'Front wiper blades', category: 'maintenance', kind: 'maintenance',
    description: 'Replace both front wiper blades.',
    lines: [
      { kind: 'labor', description: 'Front wiper blades, replace', operationCode: 'WIPER-F' },
      { kind: 'part', description: 'Wiper blade set', partNumber: 'BOSCH-3397', brand: 'Bosch', partCategory: 'wipers', condition: 'new', quantityMilli: 1000, unitCostMinor: '2400' },
    ],
  },
  {
    id: 'seed_cj_cabin', code: 'CABIN-FILTER', name: 'Cabin air filter', category: 'maintenance', kind: 'maintenance',
    description: 'Replace the cabin air filter.',
    lines: [
      { kind: 'labor', description: 'Cabin air filter, replace', operationCode: 'FILTER-CABIN' },
      { kind: 'part', description: 'Cabin air filter (charcoal)', partNumber: 'CUK8430-2', brand: 'MANN', partCategory: 'filters', condition: 'new', quantityMilli: 1000, unitCostMinor: '2200' },
    ],
  },
  {
    id: 'seed_cj_diag', code: 'DIAG', name: 'Diagnosis, first hour', category: 'diagnosis', kind: 'diagnosis',
    description: 'Road test, scan and pinpoint testing to find the cause. We call you with the findings before any repair.',
    lines: [{ kind: 'labor', description: 'Diagnostic time', operationCode: 'DIAG-1' }],
  },
  {
    id: 'seed_cj_tires4', code: 'TIRES-4', name: 'Four new tires, mounted and balanced', category: 'tires', kind: 'tire',
    description: 'Four new tires, mounted and balanced, with new valve stems and a TPMS relearn.',
    lines: [
      { kind: 'labor', description: 'Mount and balance four tires', operationCode: 'TIRE-MNT-4' },
      { kind: 'tire', description: 'All-season tire 225/45R17', partNumber: 'MICH-PRIM-22545', brand: 'Michelin', partCategory: 'tires', condition: 'new', isNewTire: true, quantityMilli: 4000, unitCostMinor: '12000' },
    ],
  },
]

const mm = (thresholds: { max?: number; min?: number; condition: 'green' | 'yellow' | 'red' }[], unit: string, positions?: string[]) => ({ unit, thresholds, ...(positions ? { positions } : {}) })

/** The multi-point inspection (SCHEMA §6). Thresholds: pads 3 mm red, 5 mm yellow; tread 2/32" red, 4/32" yellow. */
export const INSPECTION_ITEMS = [
  { code: 'brake_pads_front', section: 'Brakes', label: 'Front brake pads', measurement: mm([{ max: 3, condition: 'red' }, { max: 5, condition: 'yellow' }], 'mm', ['LF', 'RF']), photoRequiredOn: ['red'], cannedJobCode: 'BRAKES-FRONT' },
  { code: 'brake_pads_rear', section: 'Brakes', label: 'Rear brake pads', measurement: mm([{ max: 3, condition: 'red' }, { max: 5, condition: 'yellow' }], 'mm', ['LR', 'RR']), photoRequiredOn: ['red'], cannedJobCode: '' },
  { code: 'brake_rotors_front', section: 'Brakes', label: 'Front rotors', measurement: null, photoRequiredOn: ['red'], cannedJobCode: '' },
  { code: 'brake_fluid', section: 'Brakes', label: 'Brake fluid', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'tread_depth', section: 'Tires', label: 'Tire tread depth', measurement: mm([{ max: 2, condition: 'red' }, { max: 4, condition: 'yellow' }], '32nds', ['LF', 'RF', 'LR', 'RR']), photoRequiredOn: ['red'], cannedJobCode: 'TIRES-4' },
  { code: 'tire_pressure', section: 'Tires', label: 'Tire pressures set', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'wipers', section: 'Visibility', label: 'Wiper blades', measurement: null, photoRequiredOn: [], cannedJobCode: 'WIPERS' },
  { code: 'lights', section: 'Visibility', label: 'Exterior lights', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'battery', section: 'Electrical', label: 'Battery test', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'cabin_filter', section: 'Under hood', label: 'Cabin air filter', measurement: null, photoRequiredOn: [], cannedJobCode: 'CABIN-FILTER' },
  { code: 'engine_oil', section: 'Under hood', label: 'Engine oil level and condition', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'coolant', section: 'Under hood', label: 'Coolant level', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'belts_hoses', section: 'Under hood', label: 'Belts and hoses', measurement: null, photoRequiredOn: [], cannedJobCode: '' },
  { code: 'leaks', section: 'Underneath', label: 'Leaks', measurement: null, photoRequiredOn: ['red'], cannedJobCode: '' },
  { code: 'suspension', section: 'Underneath', label: 'Steering and suspension', measurement: null, photoRequiredOn: ['red'], cannedJobCode: '' },
]

export const TEMPLATE_ID = 'seed_tpl_mpi'
const TEMPLATE_VERSION_ID = 'seed_tpl_mpi_v1'

/** Labor times, the inspection template (published v1) and canned jobs (published v1). Idempotent by id. */
export async function seedServiceCatalog(uow: UnitOfWork, actor: Actor) {
  const { tx, now } = uow
  const created = { laborOperations: 0, inspectionTemplates: 0, cannedJobs: 0 }
  for (const op of LABOR_OPERATIONS) {
    if (await tx.laborOperation.findUnique({ where: { id: op.id }, select: { id: true } })) continue
    await tx.laborOperation.create({
      data: {
        id: op.id, code: op.code, description: op.description, variant: op.variant ?? '', centiHours: op.centiHours, skillLevel: op.skillLevel, rateClassCode: op.rateClassCode,
        includes: (op.includes ?? []) as never, overlaps: (op.overlaps ?? []) as never, vehicleFilter: (op.vehicleFilter ?? {}) as never, source: 'shop_time', active: true,
      },
    })
    auditCreate(uow, actor, 'LaborOperation', op.id, 'labor_operation.created', { code: op.code, variant: op.variant ?? '', centiHours: op.centiHours }, { metadata: { seed: true } })
    created.laborOperations += 1
  }

  if (!(await tx.inspectionTemplate.findUnique({ where: { id: TEMPLATE_ID }, select: { id: true } }))) {
    await tx.inspectionTemplate.create({ data: { id: TEMPLATE_ID, name: 'Multi-point inspection', kind: 'multi_point' } })
    await tx.inspectionTemplateVersion.create({ data: { id: TEMPLATE_VERSION_ID, templateId: TEMPLATE_ID, versionNumber: 1, status: 'draft' } })
    for (const [i, item] of INSPECTION_ITEMS.entries()) {
      await tx.inspectionTemplateItem.create({
        data: { id: `${TEMPLATE_VERSION_ID}_${item.code}`, templateVersionId: TEMPLATE_VERSION_ID, code: item.code, section: item.section, label: item.label, measurement: (item.measurement ?? undefined) as never, photoRequiredOn: item.photoRequiredOn as never, cannedJobCode: item.cannedJobCode, required: true, sortOrder: (i + 1) * 10 },
      })
    }
    await tx.inspectionTemplateVersion.update({ where: { id: TEMPLATE_VERSION_ID }, data: { status: 'published', publishedAt: now, version: { increment: 1 } } })
    auditCreate(uow, actor, 'InspectionTemplate', TEMPLATE_ID, 'inspection_template.published', { versionNumber: 1, items: INSPECTION_ITEMS.length }, { metadata: { seed: true } })
    created.inspectionTemplates += 1
  }

  for (const job of CANNED_JOBS) {
    if (await tx.cannedJob.findUnique({ where: { id: job.id }, select: { id: true } })) continue
    const versionId = `${job.id}_v1`
    await tx.cannedJob.create({ data: { id: job.id, code: job.code, name: job.name, category: job.category, active: true } })
    await tx.cannedJobVersion.create({ data: { id: versionId, cannedJobId: job.id, versionNumber: 1, kind: job.kind, lines: job.lines as never, customerDescription: job.description, status: 'draft' } })
    await tx.cannedJobVersion.update({ where: { id: versionId }, data: { status: 'published', publishedAt: now, version: { increment: 1 } } })
    await tx.cannedJob.update({ where: { id: job.id }, data: { currentVersionId: versionId } })
    auditCreate(uow, actor, 'CannedJob', job.id, 'canned_job.published', { code: job.code, versionNumber: 1, lines: job.lines.length }, { metadata: { seed: true } })
    created.cannedJobs += 1
  }
  return created
}

// ── The golden RO ─────────────────────────────────────────────────────────────

const GOLDEN_CUSTOMER = 'seed_cust_05' // Patricia Lindqvist, 2014 BMW 328i
const SIGN = (name: string) => ({ method: 'in_person' as const, signerName: name, strokes: [Array.from({ length: 14 }, (_, i) => [10 + i * 6, 30 + Math.round(12 * Math.sin(i / 2))])] })

/**
 * Check in Patricia's BMW (today's 10:30 appointment), open the RO, run the multi-point inspection
 * (front pads at 2 mm: red, with a photo; cabin filter yellow), turn the findings into jobs, send
 * estimate v1, and record her phone "yes" to the brakes. The cabin filter stays offered. Runs once.
 */
export async function seedGoldenRepairOrder(uow: UnitOfWork, actor: Actor): Promise<Record<string, number>> {
  const { tx, now } = uow
  if (await tx.repairOrder.findFirst({ where: { customerId: GOLDEN_CUSTOMER }, select: { id: true } })) return { repairOrders: 0 }
  const owned = await tx.vehicleOwnership.findFirst({ where: { customerId: GOLDEN_CUSTOMER, endedAt: null }, include: { vehicle: true } })
  if (!owned?.vehicle) return { repairOrders: 0 }
  // The advisor and technician of record; the seed acts as them so evidence names a real person.
  const advisor = await tx.user.findFirst({ where: { OR: [{ id: 'seed_user_shah' }, { email: { startsWith: 'priya.shah@' } }] }, select: { id: true, name: true } })
  const tech = await tx.user.findFirst({ where: { OR: [{ id: 'seed_user_ramirez' }, { email: { startsWith: 'luis.ramirez@' } }] }, select: { id: true } })
  if (!advisor || !tech) return { repairOrders: 0 }
  const asAdvisor: Actor = { kind: 'user', userId: advisor.id, name: advisor.name ?? 'Priya Shah', permissions: new Set(['canWriteRepairOrders', 'canPriceJobs', 'canSendEstimates', 'canRecordAuthorizations']) as never, channel: 'web' }
  const asTech: Actor = { kind: 'user', userId: tech.id, name: 'Luis Ramirez', permissions: new Set(['canPerformInspections']) as never, channel: 'web' }

  const appointment = await tx.appointment.findFirst({ where: { customerId: GOLDEN_CUSTOMER, status: { in: ['requested', 'confirmed'] } }, orderBy: { startsAt: 'asc' }, select: { id: true } })
  const promisedAt = new Date(now.getTime() + 6 * 3_600_000)
  const checkIn = await checkInVehicle(uow, asAdvisor, {
    shopId: NGA, appointmentId: appointment?.id ?? null, customerId: GOLDEN_CUSTOMER, vehicleId: owned.vehicleId!,
    odometer: { value: (owned.vehicle.lastOdometer ?? 121_940) + 412 }, concerns: ['Grinding noise from the front when braking.'],
    promisedAt, waiter: false, keyTag: '14', contactPreference: 'sms', signature: SIGN('Patricia Lindqvist'),
  })
  const ro = await openRepairOrder(uow, asAdvisor, { checkInId: checkIn.id, serviceAdvisorId: advisor.id })
  void actor

  const inspection = await createInspection(uow, asTech, { repairOrderId: ro.id, templateId: TEMPLATE_ID, technicianId: tech.id })
  await startInspection(uow, asTech, { inspectionId: inspection.id, expectedVersion: (await tx.inspection.findUniqueOrThrow({ where: { id: inspection.id } })).version })
  const results = await tx.inspectionItemResult.findMany({ where: { inspectionId: inspection.id }, include: { templateItem: true } })
  const plan: Record<string, { condition?: string; measurements?: { position: string; value: number }[]; notes?: string }> = {
    brake_pads_front: { measurements: [{ position: 'LF', value: 2 }, { position: 'RF', value: 3 }], notes: 'Pads at 2 mm and 3 mm; the wear sensor is reading. Rotors scored from metal-to-metal contact.' },
    brake_pads_rear: { measurements: [{ position: 'LR', value: 6 }, { position: 'RR', value: 6 }] },
    brake_rotors_front: { condition: 'red', notes: 'Both front rotors scored; below minimum thickness after machining.' },
    tread_depth: { measurements: [{ position: 'LF', value: 6 }, { position: 'RF', value: 6 }, { position: 'LR', value: 7 }, { position: 'RR', value: 7 }] },
    cabin_filter: { condition: 'yellow', notes: 'Dirty; due at the next oil service.' },
  }
  for (const r of results) {
    const p = plan[r.templateItem!.code] ?? { condition: 'green' }
    await recordItemResult(uow, asTech, { resultId: r.id, expectedVersion: r.version, condition: p.condition ?? null, measurements: p.measurements ?? null, notes: p.notes ?? null })
    if (r.templateItem!.code === 'brake_pads_front' || r.templateItem!.code === 'brake_rotors_front') {
      const digest = createHash('sha256').update(`seed-photo:${r.id}`).digest('hex')
      const doc = await tx.document.create({ data: { shopId: NGA, title: `${r.templateItem!.label} (photo)`, kind: 'inspection_photo', visibility: 'customer_link', storageKey: `seed/inspection/${r.templateItem!.code}.jpg`, sha256: digest, mimeType: 'image/jpeg', bytes: 182_400 } })
      await tx.inspectionItemResult.update({ where: { id: r.id }, data: { media: { connect: { id: doc.id } } } })
    }
  }
  const done = await completeInspection(uow, asTech, { inspectionId: inspection.id, expectedVersion: (await tx.inspection.findUniqueOrThrow({ where: { id: inspection.id } })).version })

  // The front-brake finding became the canned brake job, waiting on a choice: two BMW labor-time
  // variants fit this car. The advisor picks the rear-wheel-drive one (her car is a 328i, not xDrive).
  const concern = await tx.concern.findFirst({ where: { repairOrderId: ro.id }, select: { id: true } })
  let brakes = await tx.job.findFirst({ where: { repairOrderId: ro.id, title: 'Front brake pads and rotors' } })
  if (!brakes) {
    await addJob(uow, asAdvisor, { repairOrderId: ro.id, title: 'Front brake pads and rotors', cannedJobId: 'seed_cj_brakes_front', concernId: concern?.id ?? null })
    brakes = await tx.job.findFirstOrThrow({ where: { repairOrderId: ro.id, title: 'Front brake pads and rotors' } })
  }
  if (concern) await tx.job.update({ where: { id: brakes.id }, data: { concernId: concern.id } })
  if (brakes.status === 'draft') {
    const canned = CANNED_JOBS.find(j => j.id === 'seed_cj_brakes_front')!
    const lines = canned.lines.map(l => (l.operationCode === 'BRK-PAD-F' ? { ...l, variant: 'With wear sensor (RWD)' } : l))
    const current = await tx.job.findUniqueOrThrow({ where: { id: brakes.id }, select: { version: true } })
    await setJobLines(uow, asAdvisor, { jobId: brakes.id, expectedVersion: current.version, lines })
  }
  void done

  const fresh = await tx.repairOrder.findUniqueOrThrow({ where: { id: ro.id }, select: { version: true } })
  const estimate = await issueEstimate(uow, asAdvisor, { repairOrderId: ro.id, expectedVersion: fresh.version })
  await recordAuthorization(uow, asAdvisor, {
    estimateVersionId: estimate.id, method: 'oral_phone', actorName: 'Patricia Lindqvist', phoneNumber: '+19165550105',
    answers: [{ jobId: brakes.id, decision: 'approve' }], replacedPartsElection: 'show_only', at: new Date(now.getTime() - 60_000).toISOString(),
  })
  return { repairOrders: 1, jobs: await tx.job.count({ where: { repairOrderId: ro.id } }) }
}
