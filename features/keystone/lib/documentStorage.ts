import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Inspection photos and other documents live in the deployment's private bucket (the five S3_*
 * settings E-commerce uses; ported from Law Firm's documentStorage). Nothing is public: staff and
 * customer links get short-lived signed URLs.
 */
function settings() {
  const bucket = process.env.S3_BUCKET_NAME
  const region = process.env.S3_REGION
  const endpoint = process.env.S3_ENDPOINT
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) return null
  const forcePathStyle = !/amazonaws\.com/.test(endpoint)
  return { bucket, client: new S3Client({ region, endpoint, forcePathStyle, credentials: { accessKeyId, secretAccessKey } }) }
}

export function documentStorageConfigured() {
  return settings() !== null
}

export async function putDocumentObject(key: string, body: Uint8Array, contentType: string) {
  const storage = settings()
  if (!storage) throw new Error('Photo storage is not configured on this server.')
  await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: key, Body: body, ContentType: contentType }))
}

/** A five-minute link to view a stored file. Seeded rows point at keys that were never uploaded. */
export async function documentViewUrl(key: string) {
  const storage = settings()
  if (!storage || !key || key.startsWith('seed/')) return null
  return getSignedUrl(storage.client, new GetObjectCommand({ Bucket: storage.bucket, Key: key }), { expiresIn: 300 })
}
