import { systemActor } from '../lib/actor'
import { isDomainError } from '../lib/errors'
import { runInTransaction } from '../lib/unitOfWork'
import { toJsonValue } from '../lib/canonical'
import { answerAuthorizationRequest, viewAuthorizationRequest, type PublicAnswerInput } from '../lib/authorization'
import { resolveAccessToken } from '../lib/publicTokens'
import type { Db } from '../lib/db'

/*
 * Public customer APIs (SCHEMA §17). APIs only: the customer pages that call them belong to the
 * storefront (Phase S), which this repo does not build. Each call is token-scoped; the token
 * resolves to one subject and one purpose. Nothing here reads a session.
 */

const CUSTOMER = systemActor('customer-link')
const STATUS: Record<string, number> = {
  TOKEN_INVALID: 404, TOKEN_EXPIRED: 410, ESTIMATE_SUPERSEDED: 409, CONTENT_CHANGED: 409, METHOD_NOT_ALLOWED: 403,
  EVIDENCE_MISSING: 422, INVALID_INPUT: 422, DISCLOSURE_MISSING: 422, INVALID_TRANSITION: 409, STALE_STATE: 409, RATE_LIMITED: 429,
}

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(toJsonValue(body)), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' },
})

function fail(error: unknown) {
  if (isDomainError(error)) {
    const field = typeof error.details.field === 'string' ? { field: error.details.field } : {}
    return respond({ error: { code: error.code, message: error.message, ...field } }, STATUS[error.code] ?? 400)
  }
  console.error('[public] request failed')
  return respond({ error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again or call the shop.' } }, 500)
}

const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || request.headers.get('x-real-ip') || ''

// A small per-address limit so a link can't be hammered. Per process; Railway runs one replica.
const hits = new Map<string, { n: number; reset: number }>()
function limited(request: Request, bucket: string, perMinute: number) {
  const key = `${bucket}:${clientIp(request)}`
  const now = Date.now()
  const row = hits.get(key)
  if (!row || row.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); if (hits.size > 5000) hits.clear(); return false }
  row.n += 1
  return row.n > perMinute
}
const tooMany = () => respond({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Wait a minute and try again.' } }, 429)

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return {}
  const text = await request.text()
  if (text.length > 200_000) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export async function getAuthorization(db: Db, request: Request, token: string) {
  if (limited(request, 'auth-get', 60)) return tooMany()
  try {
    const view = await runInTransaction(db, uow => viewAuthorizationRequest(uow, CUSTOMER, { token, ip: clientIp(request), userAgent: request.headers.get('user-agent') }), { actorKind: 'system' })
    return respond(view)
  } catch (error) {
    return fail(error)
  }
}

/** POST { answers: [{jobId, decision}], signerName, consent: true, replacedPartsElection?, signature? } or { callMe: true, callMeNote? }. */
export async function postAuthorization(db: Db, request: Request, token: string) {
  if (limited(request, 'auth-post', 20)) return tooMany()
  try {
    const input = await body(request)
    const answer: PublicAnswerInput = {
      token,
      answers: Array.isArray(input.answers) ? (input.answers as PublicAnswerInput['answers'])!.slice(0, 40) : [],
      signerName: typeof input.signerName === 'string' ? input.signerName : '',
      consent: input.consent === true,
      replacedPartsElection: (typeof input.replacedPartsElection === 'string' ? input.replacedPartsElection : null) as PublicAnswerInput['replacedPartsElection'],
      signature: (input.signature && typeof input.signature === 'object' ? input.signature : null) as PublicAnswerInput['signature'],
      callMe: input.callMe === true,
      callMeNote: typeof input.callMeNote === 'string' ? input.callMeNote : null,
      ip: clientIp(request),
      userAgent: request.headers.get('user-agent'),
    }
    const result = await runInTransaction(db, uow => answerAuthorizationRequest(uow, CUSTOMER, answer), { actorKind: 'system' })
    return respond(result, (result as { replay?: boolean }).replay ? 200 : 201)
  } catch (error) {
    return fail(error)
  }
}

export async function getInspection(db: Db, request: Request, token: string) {
  if (limited(request, 'inspection-get', 60)) return tooMany()
  try {
    const view = await runInTransaction(db, async uow => {
      const row = await resolveAccessToken(uow.tx, 'inspection', token, uow.now)
      const inspection = await uow.tx.inspection.findUniqueOrThrow({
        where: { id: row.subjectId },
        include: {
          repairOrder: { select: { roNumber: true, shop: { select: { name: true, phone: true } }, vehicle: { select: { year: true, make: true, model: true } } } },
          results: { include: { templateItem: { select: { section: true, label: true, sortOrder: true } }, media: { select: { id: true, kind: true } } } },
        },
      })
      if (!inspection.viewedAt) await uow.tx.inspection.update({ where: { id: inspection.id }, data: { viewedAt: uow.now } })
      const v = inspection.repairOrder?.vehicle
      return {
        shop: inspection.repairOrder?.shop, repairOrder: inspection.repairOrder?.roNumber, vehicle: v ? [v.year, v.make, v.model].filter(Boolean).join(' ') : '',
        completedAt: inspection.completedAt,
        items: inspection.results
          .filter(r => r.condition !== 'not_inspected')
          .sort((a, b) => (a.templateItem?.sortOrder ?? 0) - (b.templateItem?.sortOrder ?? 0))
          .map(r => ({ section: r.templateItem?.section ?? '', label: r.templateItem?.label ?? '', condition: r.condition, measurements: r.measurements, notes: r.notes, media: r.media.length })),
      }
    }, { actorKind: 'system' })
    return respond(view)
  } catch (error) {
    return fail(error)
  }
}
