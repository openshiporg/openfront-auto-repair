import type { Tx } from './db'
import { Codes, DomainError, isDomainError } from './errors'
import { actorUserId, type Actor } from './actor'
import { auditCreate, transition } from './cas'
import { payloadHash, sha256 } from './canonical'
import { nextShopReference } from './sequence'
import { readTable } from './csv'
import { normalizeContact, upsertCustomer, type ContactInput } from './customers'
import { upsertVehicle } from './vehicles'
import type { UnitOfWork } from './unitOfWork'

/*
 * CSV imports (R§17): Tekmetric, Shopmonkey and generic. A file is previewed first, row by row, with the
 * identity each row will keep (its id in the old system, kept in ExternalReference). Applying is idempotent:
 * the same file is the same job, and a row already imported is skipped, so a second run changes nothing.
 * Imported contacts carry no marketing consent; consent is never inferred from a migration (I-C).
 */

export const FORMATS = ['tekmetric_csv', 'shopmonkey_csv', 'generic_csv'] as const
export const ENTITIES = ['customers', 'vehicles'] as const
export type ImportFormat = (typeof FORMATS)[number]
export type ImportEntity = (typeof ENTITIES)[number]
export const SYSTEM_OF: Record<ImportFormat, string> = { tekmetric_csv: 'tekmetric_import', shopmonkey_csv: 'shopmonkey_import', generic_csv: 'generic_import' }
const MAX_BYTES = 2_000_000
const MAX_ROWS = 5000

/** Column names per source, as normalised headers (lower case, punctuation to underscores). The first present name wins. */
const COLUMNS: Record<ImportFormat, Record<ImportEntity, Record<string, string[]>>> = {
  tekmetric_csv: {
    customers: { id: ['customer_id', 'id'], firstName: ['first_name'], lastName: ['last_name'], company: ['company', 'company_name'], email: ['email'], phone: ['phone', 'primary_phone', 'mobile_phone'], phone2: ['secondary_phone', 'home_phone', 'work_phone'], notes: ['notes'] },
    vehicles: { id: ['vehicle_id', 'id'], customerId: ['customer_id'], year: ['year'], make: ['make'], model: ['model'], trim: ['sub_model', 'trim'], engine: ['engine'], color: ['color'], vin: ['vin'], plate: ['license_plate', 'plate'], state: ['license_state', 'state'], mileage: ['mileage', 'odometer'] },
  },
  shopmonkey_csv: {
    customers: { id: ['customer_id', 'id', 'customer_number'], firstName: ['first_name', 'firstname'], lastName: ['last_name', 'lastname'], company: ['company_name', 'company'], email: ['email', 'email_address'], phone: ['phone', 'phone_number', 'mobile'], phone2: ['phone_2', 'secondary_phone'], notes: ['notes'] },
    vehicles: { id: ['vehicle_id', 'id'], customerId: ['customer_id'], year: ['year'], make: ['make'], model: ['model'], trim: ['submodel', 'trim'], engine: ['engine'], color: ['color'], vin: ['vin'], plate: ['license_plate', 'plate'], state: ['license_plate_state', 'state'], mileage: ['mileage', 'odometer'] },
  },
  generic_csv: {
    customers: { id: ['external_id', 'id'], firstName: ['first_name'], lastName: ['last_name'], company: ['company', 'company_name'], email: ['email'], phone: ['phone', 'mobile'], phone2: ['phone_2'], notes: ['notes'] },
    vehicles: { id: ['external_id', 'id'], customerId: ['customer_external_id', 'customer_id'], year: ['year'], make: ['make'], model: ['model'], trim: ['trim'], engine: ['engine'], color: ['color'], vin: ['vin'], plate: ['plate', 'license_plate'], state: ['state', 'plate_state'], mileage: ['mileage', 'odometer'] },
  },
}

const pick = (values: Record<string, string>, names: string[]) => { for (const n of names) if (values[n]) return values[n]; return '' }
const field = (format: ImportFormat, entity: ImportEntity, values: Record<string, string>) =>
  Object.fromEntries(Object.entries(COLUMNS[format][entity]).map(([k, names]) => [k, pick(values, names)])) as Record<string, string>

export type PreviewRow = { line: number; externalId: string; label: string; action: 'create' | 'skip' | 'error'; message: string }

type Parsed = { line: number; externalId: string; data: Record<string, string> }

export function parseImport(format: ImportFormat, entity: ImportEntity, text: string) {
  if (!(FORMATS as readonly string[]).includes(format)) throw new DomainError(Codes.INVALID_INPUT, 'Choose Tekmetric, Shopmonkey or generic.', { field: 'format' })
  if (!(ENTITIES as readonly string[]).includes(entity)) throw new DomainError(Codes.INVALID_INPUT, 'Choose customers or vehicles.', { field: 'entity' })
  if (typeof text !== 'string' || !text.trim()) throw new DomainError(Codes.INVALID_INPUT, 'The file is empty.', { field: 'file' })
  if (Buffer.byteLength(text) > MAX_BYTES) throw new DomainError(Codes.INVALID_INPUT, 'The file is over 2 MB. Split it and import in parts.', { field: 'file' })
  let table
  try { table = readTable(text) } catch (e) { throw new DomainError(Codes.INVALID_INPUT, e instanceof Error ? e.message : 'The file is not a CSV.', { field: 'file' }) }
  if (table.records.length > MAX_ROWS) throw new DomainError(Codes.INVALID_INPUT, `The file has more than ${MAX_ROWS} rows. Split it.`, { field: 'file' })
  const wanted = COLUMNS[format][entity]
  const missing = Object.entries(wanted).filter(([key]) => ['id'].includes(key) && format !== 'generic_csv').filter(([, names]) => !names.some(n => table.headers.includes(n)))
  if (missing.length) throw new DomainError(Codes.INVALID_INPUT, `This does not look like a ${format.replace('_csv', '')} ${entity} export. It needs a column named ${wanted.id[0]}.`, { field: 'file' })
  const rows: Parsed[] = table.records.map(r => {
    const data = field(format, entity, r.values)
    // A generic file without an id column keeps a stable identity from its own content, so it can still be re-run safely.
    const externalId = data.id || (format === 'generic_csv' ? `row-${payloadHash(r.values).slice(0, 16)}` : '')
    return { line: r.line, externalId, data }
  })
  return rows
}

const customerLabel = (d: Record<string, string>) => d.company || `${d.firstName} ${d.lastName}`.trim() || '(no name)'
const vehicleLabel = (d: Record<string, string>) => `${d.year} ${d.make} ${d.model}`.trim() || d.vin || '(no description)'

function contactsOf(d: Record<string, string>): ContactInput[] {
  const out: ContactInput[] = []
  for (const [k, kind] of [['phone', 'mobile'], ['phone2', 'mobile'], ['email', 'email']] as const) {
    if (!d[k]) continue
    try { out.push({ kind, value: normalizeContact(kind, d[k]), isPrimary: out.every(c => c.kind !== kind) }) } catch { /* an unusable value is dropped; the row is kept */ }
  }
  const seen = new Set<string>()
  return out.filter(c => (seen.has(`${c.kind}:${c.value}`) ? false : (seen.add(`${c.kind}:${c.value}`), true)))
}

async function existingRef(tx: Tx, system: string, entityType: string, externalId: string) {
  return tx.externalReference.findUnique({ where: { system_entityType_externalId: { system, entityType, externalId } } })
}

/** What applying would do, row by row. Read only. */
export async function previewRows(tx: Tx, format: ImportFormat, entity: ImportEntity, rows: Parsed[]): Promise<PreviewRow[]> {
  const system = SYSTEM_OF[format]
  const entityType = entity === 'customers' ? 'Customer' : 'Vehicle'
  const seen = new Set<string>()
  const out: PreviewRow[] = []
  for (const r of rows) {
    const label = entity === 'customers' ? customerLabel(r.data) : vehicleLabel(r.data)
    if (!r.externalId) { out.push({ line: r.line, externalId: '', label, action: 'error', message: `Row has no ${COLUMNS[format][entity].id[0]}.` }); continue }
    if (seen.has(r.externalId)) { out.push({ line: r.line, externalId: r.externalId, label, action: 'error', message: 'This id appears twice in the file.' }); continue }
    seen.add(r.externalId)
    if (await existingRef(tx, system, entityType, r.externalId)) { out.push({ line: r.line, externalId: r.externalId, label, action: 'skip', message: 'Already imported.' }); continue }
    if (entity === 'customers' && !r.data.company && !r.data.firstName && !r.data.lastName) { out.push({ line: r.line, externalId: r.externalId, label, action: 'error', message: 'No name or company.' }); continue }
    if (entity === 'vehicles' && !r.data.vin && !(r.data.make || r.data.model)) { out.push({ line: r.line, externalId: r.externalId, label, action: 'error', message: 'No VIN, make or model.' }); continue }
    out.push({ line: r.line, externalId: r.externalId, label, action: 'create', message: '' })
  }
  return out
}

export async function previewImport(uow: UnitOfWork, actor: Actor, input: { shopId: string; format: ImportFormat; entity: ImportEntity; fileName?: string | null; text: string }) {
  const { tx, now } = uow
  const rows = parseImport(input.format, input.entity, input.text)
  const fileSha256 = sha256(input.text)
  const prior = await tx.importJob.findUnique({ where: { shopId_format_entity_fileSha256: { shopId: input.shopId, format: input.format, entity: input.entity, fileSha256 } } })
  if (prior && prior.status !== 'discarded') return { id: prior.id, reference: prior.reference, status: prior.status, existing: true, rowCount: prior.rowCount, preview: prior.preview, result: prior.result }
  const preview = await previewRows(tx, input.format, input.entity, rows)
  const shop = await tx.shop.findUnique({ where: { id: input.shopId }, select: { code: true } })
  if (!shop) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  const reference = await nextShopReference(tx, 'IMP', shop.code.toUpperCase(), now)
  const data = { shopId: input.shopId, reference, format: input.format, entity: input.entity, status: 'previewed', fileName: String(input.fileName ?? '').slice(0, 200), fileSha256, rowCount: rows.length, preview: preview as never, sourceText: input.text, createdById: actorUserId(actor) ?? '' }
  const job = prior
    ? await tx.importJob.update({ where: { id: prior.id }, data: { ...data, reference: prior.reference, status: 'previewed', result: {} as never, version: { increment: 1 } } })
    : await tx.importJob.create({ data })
  auditCreate(uow, actor, 'ImportJob', job.id, 'import.previewed', { reference: job.reference, format: input.format, entity: input.entity, rows: rows.length, create: preview.filter(p => p.action === 'create').length, skip: preview.filter(p => p.action === 'skip').length, error: preview.filter(p => p.action === 'error').length })
  return { id: job.id, reference: job.reference, status: 'previewed', existing: false, rowCount: rows.length, preview, result: {} }
}

export async function applyImport(uow: UnitOfWork, actor: Actor, input: { jobId: string }) {
  const { tx, now } = uow
  const job = await tx.importJob.findUnique({ where: { id: input.jobId } })
  if (!job) throw new DomainError(Codes.NOT_FOUND, 'Not found.')
  if (job.status === 'applied') return { id: job.id, status: 'applied', existing: true, result: job.result }
  if (job.status !== 'previewed') throw new DomainError(Codes.INVALID_TRANSITION, `This import is ${job.status}.`, { currentStatus: job.status })
  const format = job.format as ImportFormat
  const entity = job.entity as ImportEntity
  const system = SYSTEM_OF[format]
  const rows = parseImport(format, entity, job.sourceText)
  const plan = await previewRows(tx, format, entity, rows)
  const counts = { created: 0, matched: 0, skipped: 0, errors: 0 }
  const outcome: { line: number; externalId: string; action: string; message: string; id?: string }[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const p = plan[i]
    if (p.action === 'skip') { counts.skipped += 1; outcome.push({ line: r.line, externalId: r.externalId, action: 'skipped', message: p.message }); continue }
    if (p.action === 'error') { counts.errors += 1; outcome.push({ line: r.line, externalId: r.externalId, action: 'error', message: p.message }); continue }
    try {
      let entityId: string
      let how: 'created' | 'matched' = 'created'
      if (entity === 'customers') {
        const d = r.data
        const business = !!d.company && !d.firstName && !d.lastName
        try {
          const made = await upsertCustomer(uow, actor, { kind: business ? 'business' : 'person', firstName: d.firstName, lastName: d.lastName, companyName: d.company, homeShopId: job.shopId, notes: d.notes, contacts: contactsOf(d) })
          entityId = made.id
        } catch (e) {
          // The same phone or email is already a customer here: the old record points at that customer instead of making a second one.
          if (isDomainError(e) && e.code === Codes.DUPLICATE && typeof e.details.existingId === 'string') { entityId = e.details.existingId; how = 'matched' } else throw e
        }
      } else {
        const d = r.data
        const owner = d.customerId ? await existingRef(tx, system, 'Customer', d.customerId) : null
        const year = d.year && /^\d{4}$/.test(d.year) ? Number(d.year) : null
        const made = await upsertVehicle(uow, actor, { vin: d.vin || null, noVinReason: d.vin ? null : 'Imported without a VIN', year, make: d.make, model: d.model, trim: d.trim, engine: d.engine, color: d.color, customerId: owner?.entityId ?? null, plate: d.plate && d.state ? { plate: d.plate.toUpperCase(), state: d.state.toUpperCase() } : null })
        entityId = made.id
        if (made.existing) how = 'matched'
      }
      await tx.externalReference.create({ data: { entityType: entity === 'customers' ? 'Customer' : 'Vehicle', entityId, system: system as never, externalId: r.externalId, meta: { importJob: job.reference, line: r.line, how } as never } })
      counts[how] += 1
      outcome.push({ line: r.line, externalId: r.externalId, action: how, message: how === 'matched' ? 'Matched an existing record.' : '', id: entityId })
    } catch (e) {
      if (!isDomainError(e)) throw e
      counts.errors += 1
      outcome.push({ line: r.line, externalId: r.externalId, action: 'error', message: e.message })
    }
  }
  const result = { ...counts, rows: outcome }
  await transition(uow, { model: 'ImportJob', id: job.id, from: ['previewed'], to: 'applied', actor, eventType: 'import.applied', data: { result: result as never, appliedAt: now }, metadata: { ...counts } })
  return { id: job.id, status: 'applied', existing: false, result }
}

export async function discardImport(uow: UnitOfWork, actor: Actor, input: { jobId: string }) {
  await transition(uow, { model: 'ImportJob', id: input.jobId, from: ['previewed', 'failed'], to: 'discarded', actor, eventType: 'import.discarded', data: { sourceText: '' } })
  return { id: input.jobId, status: 'discarded' }
}
