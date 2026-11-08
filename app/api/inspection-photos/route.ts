import type { IncomingMessage } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { keystoneContext } from '@/features/keystone/context'
import { actorFromSession, requirePermission } from '@/features/keystone/lib/actor'
import { command } from '@/features/keystone/lib/command'
import { isDomainError } from '@/features/keystone/lib/errors'
import { addInspectionPhoto } from '@/features/keystone/lib/inspections'
import { documentStorageConfigured, putDocumentObject } from '@/features/keystone/lib/documentStorage'

export const dynamic = 'force-dynamic'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }
const MAX_BYTES = 12 * 1024 * 1024
const KEY = /^[A-Za-z0-9._:-]{8,200}$/

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * A technician's inspection photo from the tablet: staff session only, same origin, an image under
 * 12 MB. The file goes to the private bucket first; the Document row and the attachment are one command.
 */
export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_APP_URL) return fail(403, 'Cross-site upload refused.')
  const context = await keystoneContext.withRequest({ headers: { cookie: request.headers.get('cookie') || '' }, method: 'POST', url: '/api/inspection-photos' } as IncomingMessage)
  if (!context.session?.itemId) return fail(401, 'Sign in to add photos.')
  try {
    const actor = actorFromSession(context.session)
    requirePermission(actor, 'canPerformInspections')
    if (!documentStorageConfigured()) return fail(503, 'Photo storage is not set up on this server. Ask the owner to add the S3 settings.')
    const form = await request.formData()
    const resultId = String(form.get('resultId') ?? '')
    const idempotencyKey = String(form.get('idempotencyKey') ?? '')
    const file = form.get('file')
    if (!KEY.test(idempotencyKey)) return fail(400, 'Missing request key. Reload and try again.')
    if (!(file instanceof File)) return fail(400, 'Choose a photo.')
    const ext = TYPES[file.type]
    if (!ext) return fail(415, 'Photos must be JPEG, PNG, WebP or HEIC.')
    if (file.size > MAX_BYTES) return fail(413, 'Photos must be under 12 MB.')
    // The item must be one the caller's shops can see (row access through the session context).
    const visible = await context.db.InspectionItemResult.findOne({ where: { id: resultId } }).catch(() => null)
    if (!visible) return fail(404, 'Inspection item not found.')
    const body = new Uint8Array(await file.arrayBuffer())
    const sha256 = createHash('sha256').update(body).digest('hex')
    const storageKey = `inspection/${resultId}/${sha256.slice(0, 16)}-${randomUUID().slice(0, 8)}.${ext}`
    await putDocumentObject(storageKey, body, file.type)
    const done = await command(keystoneContext.sudo().prisma, { name: 'inspection.photo', actor, idempotencyKey, params: { resultId, sha256 } }, uow => addInspectionPhoto(uow, actor, { resultId, storageKey, sha256, mimeType: file.type, bytes: body.byteLength }))
    return Response.json({ ...done.value, replay: done.replay }, { status: done.replay ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (isDomainError(error)) return fail(error.code === 'NOT_AUTHORIZED' || error.code === 'AGENT_FORBIDDEN_ACTION' ? 403 : 409, error.message)
    console.error('Photo upload failed:', error instanceof Error ? error.message.slice(0, 200) : 'unknown')
    return fail(500, 'The photo did not save. Try again.')
  }
}
