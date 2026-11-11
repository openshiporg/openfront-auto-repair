import { checkFleetAuthorization } from './fleet'
import { auditCreate, lockRow, transition } from './cas'
import { actorUserId, requireHuman, type Actor } from './actor'
import { DomainError, Codes } from './errors'
import { canonicalJson, sha256, toJsonValue } from './canonical'
import { chargeCeilingMinor, parseToleranceRule } from './ceiling'
import { checkSignature, type SignatureInput } from './checkIn'
import { assertOpen, refreshRoTotals } from './repairOrders'
import { deriveToken, hashToken, isTokenShape, newTokenId } from './publicTokens'
import { requireTransactionalConsent } from './inspections'
import { releaseJobReservations } from './stock'
import type { Tx } from './db'
import type { UnitOfWork } from './unitOfWork'

/*
 * Estimates and authorization (STATE-MACHINES §4-5; DOMAIN I-R3…I-R7; 16 CCR §§3353-3356).
 *
 * - An estimate version is what the customer sees. Sending it freezes a snapshot and a hash per
 *   job; it can never change again (database trigger).
 * - An authorization binds to one job's hash in one version. If the job's lines change after the
 *   version was sent, the authorization is refused (CONTENT_CHANGED): send a new version.
 * - Only a person records an authorization: staff for in-person, phone and written forms, the
 *   customer through the public link. An assistant can draft, send the link, or create a callback
 *   task. The database refuses Authorization and JobDecision rows in an agent's transaction.
 */

export const CONSENT_TEXT_VERSION = 'estimate-consent-v1'
export const CONSENT_TEXT = 'By approving, I authorize the work and the amounts shown for the jobs I selected. I understand the shop will not do other work, or charge more than the amount shown, without my further authorization.'

const STAFF_METHODS = ['in_person_signature', 'oral_phone', 'written_form', 'fleet_po'] as const
type StaffMethod = typeof STAFF_METHODS[number]

// ── Estimate versions ─────────────────────────────────────────────────────────

/** The disclosures the pinned law requires before an estimate can be sent (SM§4, I-R7). */
export async function disclosureProblems(tx: Tx, ro: any, jobIds: string[]) {
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId } })
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: ro.shopId }, select: { registrations: true } })
  const jobs = await tx.job.findMany({ where: { id: { in: jobIds } }, include: { lines: true, payerSplits: true, teardownDisclosure: true } })
  const missing: string[] = []
  for (const job of jobs) {
    for (const line of job.lines) {
      if (law.requirePartCondition && ['part', 'tire', 'refrigerant'].includes(line.kind) && !line.condition) missing.push(`part_condition: job ${job.number} "${line.description}"`)
      if (law.subletDisclosureRequired && line.kind === 'sublet' && !line.subletVendorName) missing.push(`sublet_vendor: job ${job.number}`)
    }
    if (job.kind === 'teardown' && !job.teardownDisclosure) missing.push(`teardown_terms: job ${job.number}`)
    if (job.payerSplits.some(p => ['insurer', 'service_contract'].includes(p.payerKind)) && !law.thirdPartyPayorNoticeText) missing.push('third_party_payor_notice')
  }
  if (law.replacedPartsOfferRequired && !law.replacedPartsOfferText) missing.push('replaced_parts_offer')
  const required = Array.isArray(law.invoiceRequiredFields) ? (law.invoiceRequiredFields as string[]) : []
  if (required.includes('registrationNumber') && !((shop.registrations ?? {}) as Record<string, unknown>).barArd) missing.push('shop_registration_number')
  return missing
}

export async function issueEstimate(uow: UnitOfWork, actor: Actor, input: { repairOrderId: string; jobIds?: string[] | null; expectedVersion: number }) {
  const { tx, now } = uow
  const ro = await lockRow<any>(tx, 'RepairOrder', input.repairOrderId)
  if (ro.version !== input.expectedVersion) throw new DomainError(Codes.STALE_STATE, `${ro.roNumber} changed since you loaded it. Reload and try again.`, { currentVersion: ro.version })
  await assertOpen(tx, ro.id)
  const all = await tx.job.findMany({ where: { repairOrderId: ro.id }, orderBy: { number: 'asc' }, include: { lines: { orderBy: { sortOrder: 'asc' } }, teardownDisclosure: true } })
  const live = all.filter(j => !['declined', 'deferred', 'voided', 'completed'].includes(j.status))
  const chosen = input.jobIds?.length ? live.filter(j => input.jobIds!.includes(j.id)) : live
  if (!chosen.length) throw new DomainError(Codes.GUARD_FAILED, 'Add a job before sending an estimate.')
  if (input.jobIds?.length && chosen.length !== input.jobIds.length) throw new DomainError(Codes.INVALID_INPUT, 'Some jobs are not on this repair order or are closed.', { field: 'jobIds' })

  const missing = await disclosureProblems(tx, ro, chosen.map(j => j.id))
  if (missing.length) throw new DomainError(Codes.DISCLOSURE_MISSING, `The estimate can't be sent yet: ${missing.slice(0, 4).join('; ')}${missing.length > 4 ? '…' : ''}.`, { problems: missing, missing })
  const unpriced = chosen.filter(j => !j.contentHash || j.status === 'draft')
  if (unpriced.length) throw new DomainError(Codes.GUARD_FAILED, `Price every job first: job ${unpriced.map(j => j.number).join(', ')}.`, { problems: unpriced.map(j => `job ${j.number}`) })

  const [law, shop, customer, vehicle] = await Promise.all([
    tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId } }),
    tx.shop.findUniqueOrThrow({ where: { id: ro.shopId }, select: { code: true, name: true, legalName: true, registrations: true, timeZone: true } }),
    ro.customerId ? tx.customer.findUnique({ where: { id: ro.customerId }, select: { displayName: true, firstName: true } }) : null,
    ro.vehicleId ? tx.vehicle.findUnique({ where: { id: ro.vehicleId }, select: { year: true, make: true, model: true, vin: true } }) : null,
  ])
  const last = await tx.estimateVersion.findFirst({ where: { repairOrderId: ro.id }, orderBy: { versionNumber: 'desc' } })
  const versionNumber = (last?.versionNumber ?? 0) + 1
  const notices = (Array.isArray(law.requiredNotices) ? (law.requiredNotices as { key: string; where: string; text: string }[]) : []).filter(n => n.where === 'estimate')
  const jobHashes = Object.fromEntries(chosen.map(j => [j.id, j.contentHash]))
  const snapshot = toJsonValue({
    roNumber: ro.roNumber, versionNumber, issuedAt: now,
    shop: { code: shop.code, name: shop.name, legalName: shop.legalName, registrations: shop.registrations ?? {} },
    customer: { name: customer?.displayName ?? '' },
    vehicle: vehicle ? { label: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '), vinLast8: vehicle.vin ? vehicle.vin.slice(-8) : '' } : null,
    jobs: chosen.map(j => ({
      id: j.id, number: j.number, title: j.title, description: j.customerDescription, kind: j.kind, urgency: j.urgency, status: j.status, contentHash: j.contentHash,
      authorizedAlready: j.status !== 'needs_reauthorization' && j.authorizedContentHash === j.contentHash && Boolean(j.currentAuthorizationId),
      lines: j.lines.map(l => ({
        kind: l.kind, description: l.description, partNumber: l.partNumber, brand: l.brand, condition: l.condition, quantityMilli: l.quantityMilli, hours: l.kind === 'labor' ? l.soldCentiHours : null,
        unitPriceMinor: l.unitPriceMinor, extendedMinor: l.extendedMinor, taxMinor: l.taxMinor, taxable: l.taxable, taxCategory: l.taxCategoryCode, sublet: l.subletVendorName || null, fee: l.feeCode || null,
      })),
      laborMinor: j.laborMinor, partsMinor: j.partsMinor, feesMinor: j.feesMinor, subtotalMinor: j.subtotalMinor, taxMinor: j.taxMinor, totalMinor: j.totalMinor,
      teardown: j.teardownDisclosure ? { teardownCostMinor: j.teardownDisclosure.teardownCostMinor, reassemblyCostMinor: j.teardownDisclosure.reassemblyCostMinor, area: j.teardownDisclosure.areaDescription, maxReassemblyDays: j.teardownDisclosure.maxReassemblyDays, text: j.teardownDisclosure.disclosureText } : null,
    })),
    totals: {
      laborMinor: chosen.reduce((n, j) => n + j.laborMinor, 0n), partsMinor: chosen.reduce((n, j) => n + j.partsMinor, 0n), feesMinor: chosen.reduce((n, j) => n + j.feesMinor, 0n),
      subtotalMinor: chosen.reduce((n, j) => n + j.subtotalMinor, 0n), taxMinor: chosen.reduce((n, j) => n + j.taxMinor, 0n), totalMinor: chosen.reduce((n, j) => n + j.totalMinor, 0n),
    },
    disclosures: {
      notices: notices.map(n => ({ key: n.key, text: n.text })),
      replacedPartsOffer: law.replacedPartsOfferRequired ? law.replacedPartsOfferText : null,
      nonReturnableNote: law.nonReturnableNoteText || null,
      tolerance: law.toleranceRule,
      consentText: CONSENT_TEXT, consentTextVersion: CONSENT_TEXT_VERSION,
    },
    policy: { jurisdiction: ro.jurisdictionPolicyVersionId, laborRates: ro.laborRateClassSetVersionId, partsMatrix: ro.partsMatrixVersionId, fees: ro.feePolicyVersionId, tax: ro.taxRuleSetVersionId, warranty: ro.warrantyTermSetVersionId },
  })
  const contentHash = sha256(canonicalJson(snapshot))
  const totals = (snapshot as any).totals
  const row = await tx.estimateVersion.create({
    data: {
      repairOrderId: ro.id, versionNumber, reference: `${ro.roNumber}-E${versionNumber}`, snapshot: snapshot as never, contentHash, jobHashes: jobHashes as never, includedJobIds: chosen.map(j => j.id) as never,
      disclosuresChecked: ['part_condition', 'sublet_vendor', 'teardown_terms', 'third_party_payor_notice', 'replaced_parts_offer', 'shop_registration_number'] as never,
      subtotalMinor: BigInt(totals.subtotalMinor), taxMinor: BigInt(totals.taxMinor), totalMinor: BigInt(totals.totalMinor), status: 'draft',
    },
  })
  auditCreate(uow, actor, 'EstimateVersion', row.id, 'estimate.created', { reference: row.reference, versionNumber, contentHash, jobs: chosen.length })

  // Supersede the previous sent version and withdraw its open requests (their links stop working).
  if (last?.status === 'sent') {
    await transition(uow, { model: 'EstimateVersion', id: last.id, from: ['sent'], to: 'superseded', actor, eventType: 'estimate.superseded', metadata: { by: row.reference } })
    for (const request of await tx.authorizationRequest.findMany({ where: { estimateVersionId: last.id, status: { in: ['created', 'delivered', 'viewed'] } }, select: { id: true } })) {
      await transition(uow, { model: 'AuthorizationRequest', id: request.id, from: ['created', 'delivered', 'viewed'], to: 'withdrawn', actor, eventType: 'authorization_request.withdrawn', reason: 'superseded' })
    }
  }
  await transition(uow, { model: 'EstimateVersion', id: row.id, from: ['draft'], to: 'sent', actor, eventType: 'estimate.sent', data: { sentAt: now, sentById: actorUserId(actor) } })
  for (const job of chosen) {
    if (job.status === 'priced' || job.status === 'offered') {
      await transition(uow, { model: 'Job', id: job.id, from: [job.status], to: 'offered', actor, eventType: 'job.offered', data: { offeredInVersionId: row.id } })
    } else {
      await tx.job.update({ where: { id: job.id }, data: { offeredInVersionId: row.id, version: { increment: 1 } } })
    }
  }
  return { id: row.id, reference: row.reference, versionNumber, contentHash, totalMinor: String(totals.totalMinor) }
}

async function currentSentVersion(tx: Tx, estimateVersionId: string) {
  const ev = await tx.estimateVersion.findUnique({ where: { id: estimateVersionId } })
  if (!ev) throw new DomainError(Codes.NOT_FOUND, 'Estimate not found.')
  if (ev.status !== 'sent') throw new DomainError(Codes.ESTIMATE_SUPERSEDED, `Estimate ${ev.reference} has been replaced by a newer version.`, { currentStatus: ev.status })
  return ev
}

// ── Authorization requests (links) ────────────────────────────────────────────

export async function requestAuthorization(uow: UnitOfWork, actor: Actor, input: { estimateVersionId: string; channel: 'sms' | 'email' | 'in_person' | 'phone_call'; contactId?: string | null; depositRequestedMinor?: string | null }) {
  const { tx, now } = uow
  const ev = await currentSentVersion(tx, input.estimateVersionId)
  const ro = await tx.repairOrder.findUniqueOrThrow({ where: { id: ev.repairOrderId! } })
  await assertOpen(tx, ro.id)
  if (!['sms', 'email', 'in_person', 'phone_call'].includes(input.channel)) throw new DomainError(Codes.INVALID_INPUT, 'Choose text, email, in person or phone.', { field: 'channel' })
  const contact = input.channel === 'sms' || input.channel === 'email' ? await requireTransactionalConsent(uow, ro.customerId!, input.contactId ?? null, input.channel) : null
  const policy = ro.shopPolicyVersionId ? await tx.shopPolicyVersion.findUnique({ where: { id: ro.shopPolicyVersionId }, select: { authorizationLinkTtlHours: true } }) : null
  const ttl = Math.min(720, Math.max(1, policy?.authorizationLinkTtlHours ?? 72))
  const id = newTokenId()
  const row = await tx.authorizationRequest.create({
    data: {
      id, repairOrderId: ro.id, estimateVersionId: ev.id, channel: input.channel, contactId: contact?.id ?? null, contactLabel: contact?.label ?? '', tokenHash: hashToken('authorization', deriveToken('authorization', id)),
      expiresAt: new Date(now.getTime() + ttl * 3_600_000), consentTextVersion: CONSENT_TEXT_VERSION, createdByUserId: actor.kind === 'user' ? actor.userId : null, createdByAgentId: actor.kind === 'agent' ? actor.agentId : null,
      depositRequestedMinor: input.depositRequestedMinor ? BigInt(String(input.depositRequestedMinor).replace(/\D/g, '') || '0') : null,
      status: input.channel === 'in_person' ? 'delivered' : 'created', deliveredAt: input.channel === 'in_person' ? now : null,
    },
  })
  auditCreate(uow, actor, 'AuthorizationRequest', row.id, 'authorization_request.created', { estimate: ev.reference, channel: input.channel, contact: contact?.label ?? null, expiresAt: row.expiresAt })
  // The token is not returned here (command receipts are stored); callers derive it with authorizationLink().
  return { id: row.id, expiresAt: row.expiresAt?.toISOString() ?? null, status: row.status }
}

/** The customer link for a request, derived again on demand (never stored). */
export const authorizationLink = (requestId: string) => {
  const token = deriveToken('authorization', requestId)
  return { token, path: `/api/public/authorizations/${token}` }
}

// ── Recording an authorization ────────────────────────────────────────────────

export type JobAnswer = { jobId: string; decision: 'approve' | 'decline' | 'defer'; reason?: string | null; deferUntil?: string | null; deferMiles?: number | null }

export type StaffAuthorizationInput = {
  estimateVersionId: string
  method: StaffMethod
  actorKind?: 'customer' | 'designee' | 'fleet_approver'
  actorName: string
  answers: JobAnswer[]
  replacedPartsElection?: 'return' | 'do_not_return' | 'show_only' | null
  /** oral_phone: the number called (§3353.1(c)). */
  phoneNumber?: string | null
  /** oral_phone: when the customer said yes; defaults to now. */
  at?: string | null
  signature?: SignatureInput | null
  documentId?: string | null
  poNumber?: string | null
  fleetApproverId?: string | null
  authorizationRequestId?: string | null
}

type Evidence = { method: string; actorKind: string; actorName: string; contactUsed: string; evidence: Record<string, unknown>; recordedByUserId: string | null; authorizationRequestId: string | null; signatureDocumentId: string | null; poNumber: string; at: Date; fleetApproverId?: string | null }

/** Staff-recorded authorization (in person, phone, written form, fleet PO). Never an agent. */
export async function recordAuthorization(uow: UnitOfWork, actor: Actor, input: StaffAuthorizationInput) {
  requireHuman(actor, 'record a customer authorization')
  const { tx, now } = uow
  const ev = await currentSentVersion(tx, input.estimateVersionId)
  const ro = await lockRow<any>(tx, 'RepairOrder', ev.repairOrderId!)
  await assertOpen(tx, ro.id)
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId } })
  const allowed = Array.isArray(law.allowedAuthorizationMethods) ? (law.allowedAuthorizationMethods as string[]) : []
  if (!(STAFF_METHODS as readonly string[]).includes(input.method) || !allowed.includes(input.method)) throw new DomainError(Codes.METHOD_NOT_ALLOWED, `${String(input.method).replaceAll('_', ' ')} is not an allowed way to authorize here.`, { field: 'method' })
  const actorName = String(input.actorName ?? '').trim().slice(0, 120)
  if (!actorName) throw new DomainError(Codes.EVIDENCE_MISSING, 'Enter the name of the person who authorized.', { field: 'actorName' })
  const actorKind = input.actorKind ?? 'customer'
  if (actorKind === 'designee') {
    const designee = (ro.designee ?? null) as { name?: string } | null
    if (!designee?.name || designee.name.trim().toLowerCase() !== actorName.toLowerCase()) throw new DomainError(Codes.EVIDENCE_MISSING, 'Only the designee named on the signed work order can authorize for the customer (16 CCR §3354(c)).', { field: 'actorName' })
  }
  const at = input.at ? new Date(input.at) : now
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + 60_000 || at.getTime() < now.getTime() - 7 * 86_400_000) throw new DomainError(Codes.INVALID_INPUT, 'The time of the authorization must be within the last week.', { field: 'at' })

  const evidence: Record<string, unknown> = { staffUserId: actorUserId(actor), at: at.toISOString() }
  let contactUsed = ''
  let signatureDocumentId: string | null = null
  if (input.method === 'oral_phone') {
    const phone = String(input.phoneNumber ?? '').replace(/[^\d+]/g, '')
    if (phone.replace(/\D/g, '').length < 10) throw new DomainError(Codes.EVIDENCE_MISSING, 'Record the phone number you called (16 CCR §3353.1(c)).', { field: 'phoneNumber' })
    contactUsed = phone
    Object.assign(evidence, { personName: actorName, phoneNumber: phone })
  } else if (input.method === 'in_person_signature') {
    const signature = checkSignature(input.signature ? { ...input.signature, method: 'in_person' } : null)
    if (!signature) throw new DomainError(Codes.SIGNATURE_REQUIRED, 'Ask the customer to sign.', { field: 'signature' })
    const digest = sha256(canonicalJson(signature))
    const doc = await tx.document.create({ data: { shopId: ro.shopId, title: `Authorization signature ${ev.reference}`, kind: 'signature', visibility: 'staff', storageKey: `inline:authorization:${digest}`, sha256: digest, mimeType: 'application/json', bytes: canonicalJson(signature).length } })
    signatureDocumentId = doc.id
    Object.assign(evidence, { signerName: signature.signerName, signature, witness: actorUserId(actor) })
  } else if (input.method === 'written_form') {
    const doc = input.documentId ? await tx.document.findUnique({ where: { id: input.documentId } }) : null
    if (!doc || doc.shopId !== ro.shopId) throw new DomainError(Codes.EVIDENCE_MISSING, 'Attach the signed form.', { field: 'documentId' })
    signatureDocumentId = doc.id
    Object.assign(evidence, { documentId: doc.id, documentSha256: doc.sha256 })
  } else if (input.method === 'fleet_po') {
    if (!String(input.poNumber ?? '').trim()) throw new DomainError(Codes.PO_REQUIRED, 'Enter the purchase order number.', { field: 'poNumber' })
    Object.assign(evidence, { poNumber: String(input.poNumber).trim().slice(0, 60) })
  }
  // Fleet accounts: the PO rule, and the approver's limit. Over the limit escalates to the next approver in the chain.
  let fleetApproverId: string | null = null
  if (ro.businessAccountId && (input.method === 'fleet_po' || actorKind === 'fleet_approver')) {
    const approved = (input.answers ?? []).filter(a => a.decision === 'approve').map(a => a.jobId)
    const checked = await checkFleetAuthorization(tx, ro, { approverId: input.fleetApproverId, poNumber: input.poNumber, jobIds: approved })
    fleetApproverId = checked.approverId
    if (checked.approverId) Object.assign(evidence, { fleetApproverId: checked.approverId, approverName: checked.approverName })
  }
  const rules = (law.authorizationEvidenceRules ?? {}) as Record<string, string[]>
  const needed = Array.isArray(rules[input.method]) ? rules[input.method] : []
  const have: Record<string, unknown> = { ...evidence, personName: evidence.personName ?? actorName, amountMinor: 'per job', staffUserId: actorUserId(actor) }
  const absent = needed.filter(k => have[k] === undefined || have[k] === null || have[k] === '')
  if (absent.length) throw new DomainError(Codes.EVIDENCE_MISSING, `Missing evidence for ${input.method.replaceAll('_', ' ')}: ${absent.join(', ')}.`, { problems: absent })

  let requestId: string | null = null
  if (input.authorizationRequestId) {
    const request = await tx.authorizationRequest.findUnique({ where: { id: input.authorizationRequestId } })
    if (!request || request.estimateVersionId !== ev.id) throw new DomainError(Codes.INVALID_INPUT, 'That request is for another estimate.', { field: 'authorizationRequestId' })
    requestId = request.id
  }
  const result = await applyAnswers(uow, actor, ev, ro, law, input.answers, input.replacedPartsElection ?? null, {
    method: input.method, actorKind, actorName, contactUsed, evidence, recordedByUserId: actorUserId(actor), authorizationRequestId: requestId, signatureDocumentId, poNumber: String(input.poNumber ?? '').trim().slice(0, 60), at, fleetApproverId,
  })
  if (requestId) {
    const request = await tx.authorizationRequest.findUniqueOrThrow({ where: { id: requestId } })
    if (['created', 'delivered', 'viewed'].includes(request.status)) {
      await transition(uow, { model: 'AuthorizationRequest', id: requestId, from: ['created', 'delivered', 'viewed'], to: 'answered', actor, eventType: 'authorization_request.answered', data: { answeredAt: now, answer: toJsonValue(result) as never } })
    }
  }
  return result
}

/** Write Authorization/JobDecision rows and move the jobs. Shared by staff recording and the public answer. */
async function applyAnswers(uow: UnitOfWork, actor: Actor, ev: any, ro: any, law: any, answers: JobAnswer[], election: string | null, e: Evidence) {
  const { tx, now } = uow
  if (!Array.isArray(answers) || !answers.length) throw new DomainError(Codes.INVALID_INPUT, 'Answer at least one job.', { field: 'answers' })
  const hashes = (ev.jobHashes ?? {}) as Record<string, string>
  const seen = new Set<string>()
  const approved: { jobId: string; number: number; amountMinor: string; authorizationId: string }[] = []
  const decided: { jobId: string; number: number; decision: string }[] = []
  const rule = parseToleranceRule(law.toleranceRule)
  for (const answer of answers) {
    if (!answer || seen.has(answer.jobId)) throw new DomainError(Codes.INVALID_INPUT, 'Answer each job once.', { field: 'answers' })
    seen.add(answer.jobId)
    if (!['approve', 'decline', 'defer'].includes(answer.decision)) throw new DomainError(Codes.INVALID_INPUT, 'Each job is approved, declined or deferred.', { field: 'decision' })
    if (!(answer.jobId in hashes)) throw new DomainError(Codes.INVALID_INPUT, 'That job is not on this estimate.', { field: 'jobId' })
    const job = await lockRow<any>(tx, 'Job', answer.jobId)
    if (job.repairOrderId !== ro.id) throw new DomainError(Codes.INVALID_INPUT, 'That job is on another repair order.')
    if (job.contentHash !== hashes[job.id]) {
      throw new DomainError(Codes.CONTENT_CHANGED, `Job ${job.number} changed after this estimate was sent. Send the new version before recording an answer.`, { field: 'jobId', reason: 'hash_mismatch' })
    }
    if (answer.decision === 'approve') {
      if (job.status === 'authorized' || job.status === 'in_progress') {
        if (job.authorizedContentHash === job.contentHash) continue // already authorized for exactly this content
      }
      if (!['offered', 'needs_reauthorization'].includes(job.status)) throw new DomainError(Codes.INVALID_TRANSITION, `Job ${job.number} is ${job.status.replaceAll('_', ' ')} and can't be authorized now.`, { currentStatus: job.status })
      const identity = String((job.priceSnapshot as any)?.identityHash ?? '')
      if (job.currentAuthorizationId) {
        // One recorded authorization per job (partial unique): the previous one is superseded first.
        await tx.authorization.update({ where: { id: job.currentAuthorizationId }, data: { status: 'superseded' } })
        auditCreate(uow, actor, 'Authorization', job.currentAuthorizationId, 'authorization.superseded', { estimate: ev.reference })
      }
      const authorization = await tx.authorization.create({
        data: {
          jobId: job.id, estimateVersionId: ev.id, jobContentHash: job.contentHash, amountMinor: job.totalMinor, subtotalMinor: job.subtotalMinor, method: e.method, actorKind: e.actorKind, actorName: e.actorName,
          contactUsed: e.contactUsed, evidence: toJsonValue({ ...e.evidence, amountMinor: job.totalMinor }) as never, authorizedAt: e.at, recordedByUserId: e.recordedByUserId, authorizationRequestId: e.authorizationRequestId,
          fleetApproverId: e.fleetApproverId ?? null, signatureId: e.signatureDocumentId, consentTextVersion: e.method === 'electronic_link' ? CONSENT_TEXT_VERSION : '', poNumber: e.poNumber, status: 'recorded',
        },
      })
      const ceiling = chargeCeilingMinor(rule, rule.includesTax ? job.totalMinor : job.subtotalMinor)
      const to = job.status === 'needs_reauthorization' && job.workStartedAt ? 'in_progress' : 'authorized'
      await transition(uow, {
        model: 'Job', id: job.id, from: [job.status], to, actor, eventType: 'job.authorized', metadata: { method: e.method, estimate: ev.reference, authorizationId: authorization.id },
        data: { authorizedAmountMinor: job.totalMinor, authorizedSubtotalMinor: job.subtotalMinor, authorizedContentHash: job.contentHash, authorizedIdentityHash: identity, chargeCeilingMinor: ceiling, currentAuthorizationId: authorization.id, reauthorizationReason: '' },
      })
      if (job.teardownDisclosureId) await tx.teardownDisclosure.update({ where: { id: job.teardownDisclosureId }, data: { lockedAt: now } })
      auditCreate(uow, actor, 'Authorization', authorization.id, 'authorization.recorded', { jobId: job.id, estimate: ev.reference, amountMinor: job.totalMinor, method: e.method, actorKind: e.actorKind, contentHash: job.contentHash })
      approved.push({ jobId: job.id, number: job.number, amountMinor: job.totalMinor.toString(), authorizationId: authorization.id })
    } else {
      if (job.status !== 'offered') throw new DomainError(Codes.INVALID_TRANSITION, `Job ${job.number} is ${job.status.replaceAll('_', ' ')}; only an offered job can be declined or deferred.`, { currentStatus: job.status })
      const deferUntil = answer.deferUntil ? new Date(answer.deferUntil) : null
      const decision = await tx.jobDecision.create({
        data: {
          jobId: job.id, estimateVersionId: ev.id, decision: answer.decision === 'decline' ? 'declined' : 'deferred', actorName: e.actorName, method: e.method, at: e.at, reason: String(answer.reason ?? '').slice(0, 300),
          deferUntil: deferUntil && !Number.isNaN(deferUntil.getTime()) ? deferUntil : null, deferMiles: Number.isSafeInteger(answer.deferMiles) ? answer.deferMiles : null, recordedByUserId: e.recordedByUserId, authorizationRequestId: e.authorizationRequestId,
        },
      })
      const to = answer.decision === 'decline' ? 'declined' : 'deferred'
      await transition(uow, { model: 'Job', id: job.id, from: ['offered'], to, actor, eventType: `job.${to}`, metadata: { decisionId: decision.id, method: e.method } })
      await releaseJobReservations(uow, actor, job.id, `Customer ${to === 'declined' ? 'declined' : 'deferred'} the job`)
      decided.push({ jobId: job.id, number: job.number, decision: to })
    }
  }
  if (approved.length) {
    const needsElection = law.replacedPartsOfferRequired && (await tx.jobLine.count({ where: { jobId: { in: approved.map(a => a.jobId) }, kind: { in: ['part', 'tire'] } } })) > 0
    if (needsElection && !['return', 'do_not_return', 'show_only'].includes(String(election))) {
      throw new DomainError(Codes.DISCLOSURE_MISSING, 'Ask whether the customer wants the replaced parts back (16 CCR §3355) and record the answer.', { field: 'replacedPartsElection', problems: ['replaced_parts_election'] })
    }
    if (election) await tx.repairOrder.update({ where: { id: ro.id }, data: { replacedPartsElection: election, electedAt: now } })
  }
  await refreshRoTotals(tx, ro.id)
  await tx.repairOrder.update({ where: { id: ro.id }, data: { version: { increment: 1 } } })
  return { estimate: ev.reference, approved, decided, replacedPartsElection: election }
}

// ── The public link (no UI here: the storefront renders it in Phase S) ───────

async function requestForToken(tx: Tx, token: unknown) {
  if (!isTokenShape(token)) throw new DomainError(Codes.TOKEN_INVALID, 'This link is not valid.')
  const request = await tx.authorizationRequest.findUnique({ where: { tokenHash: hashToken('authorization', token) } })
  if (!request) throw new DomainError(Codes.TOKEN_INVALID, 'This link is not valid.')
  return request
}

/** GET: the estimate as the customer sees it. First open marks the request viewed with the viewer's evidence. */
export async function viewAuthorizationRequest(uow: UnitOfWork, actor: Actor, input: { token: string; ip?: string | null; userAgent?: string | null }) {
  const { tx, now } = uow
  const request = await requestForToken(tx, input.token)
  if (request.status === 'withdrawn') throw new DomainError(Codes.ESTIMATE_SUPERSEDED, 'This estimate has been replaced. Use the newest link the shop sent.')
  const expired = request.expiresAt!.getTime() <= now.getTime() && request.status !== 'answered'
  if (expired) throw new DomainError(Codes.TOKEN_EXPIRED, 'This link has expired. Ask the shop to send a new one.')
  if (request.status === 'created' || request.status === 'delivered') {
    const viewerEvidence = { ip: String(input.ip ?? '').slice(0, 64), userAgent: String(input.userAgent ?? '').slice(0, 300), at: now.toISOString() }
    await transition(uow, { model: 'AuthorizationRequest', id: request.id, from: ['created', 'delivered'], to: 'viewed', actor, eventType: 'authorization_request.viewed', data: { viewedAt: now, viewerEvidence: viewerEvidence as never } })
  }
  const ev = await tx.estimateVersion.findUniqueOrThrow({ where: { id: request.estimateVersionId! } })
  const snapshot = ev.snapshot as any
  return {
    status: request.status === 'answered' ? 'answered' : 'open', estimate: ev.reference, expiresAt: request.expiresAt!.toISOString(), superseded: ev.status !== 'sent',
    shop: snapshot.shop, vehicle: snapshot.vehicle, customer: { name: String(snapshot.customer?.name ?? '').split(' ')[0] },
    jobs: snapshot.jobs.map((j: any) => ({ id: j.id, number: j.number, title: j.title, description: j.description, urgency: j.urgency, lines: j.lines, totalMinor: j.totalMinor, subtotalMinor: j.subtotalMinor, taxMinor: j.taxMinor, teardown: j.teardown, alreadyAuthorized: j.authorizedAlready })),
    totals: snapshot.totals, disclosures: snapshot.disclosures, depositRequestedMinor: request.depositRequestedMinor?.toString() ?? null,
    answer: request.status === 'answered' ? request.answer : null,
  }
}

export type PublicAnswerInput = {
  token: string
  answers?: JobAnswer[]
  signerName?: string
  consent?: boolean
  replacedPartsElection?: 'return' | 'do_not_return' | 'show_only' | null
  signature?: SignatureInput | null
  callMe?: boolean
  callMeNote?: string | null
  ip?: string | null
  userAgent?: string | null
}

/**
 * POST: the customer's answer. One answer per request: a repeated POST returns the stored answer
 * unchanged (replay: true), whatever it carries. "Call me" creates a staff callback task and leaves
 * the request open.
 */
export async function answerAuthorizationRequest(uow: UnitOfWork, actor: Actor, input: PublicAnswerInput) {
  const { tx, now } = uow
  const found = await requestForToken(tx, input.token)
  const request = await lockRow<any>(tx, 'AuthorizationRequest', found.id)
  if (request.status === 'answered') return { replay: true, ...(request.answer as object) }
  if (request.status === 'withdrawn') throw new DomainError(Codes.ESTIMATE_SUPERSEDED, 'This estimate has been replaced. Use the newest link the shop sent.')
  if (request.expiresAt.getTime() <= now.getTime()) throw new DomainError(Codes.TOKEN_EXPIRED, 'This link has expired. Ask the shop to send a new one.')
  const ev = await currentSentVersion(tx, request.estimateVersionId)
  const ro = await lockRow<any>(tx, 'RepairOrder', ev.repairOrderId!)

  if (input.callMe) {
    const task = await createStaffTask(uow, actor, { shopId: ro.shopId, repairOrderId: ro.id, authorizationRequestId: request.id, kind: 'authorization_callback', title: `Call back about ${ev.reference}`, detail: String(input.callMeNote ?? '').slice(0, 500), source: 'public_api', evidence: { at: now.toISOString(), ip: String(input.ip ?? '').slice(0, 64) } })
    return { replay: false, status: 'callback_requested', taskId: task.id }
  }
  const law = await tx.jurisdictionPolicyVersion.findUniqueOrThrow({ where: { id: ro.jurisdictionPolicyVersionId } })
  const allowed = Array.isArray(law.allowedAuthorizationMethods) ? (law.allowedAuthorizationMethods as string[]) : []
  if (!allowed.includes('electronic_link')) throw new DomainError(Codes.METHOD_NOT_ALLOWED, 'This shop takes approvals in person or by phone. Use "Call me".')
  const signerName = String(input.signerName ?? '').trim().slice(0, 120)
  if (!signerName) throw new DomainError(Codes.EVIDENCE_MISSING, 'Type your full name to sign.', { field: 'signerName' })
  if (input.consent !== true) throw new DomainError(Codes.EVIDENCE_MISSING, 'Tick the box to agree to the authorization wording.', { field: 'consent' })
  const signature = input.signature ? checkSignature({ ...input.signature, method: 'electronic_link', signerName }) : null
  const evidence = {
    signerName, ip: String(input.ip ?? '').slice(0, 64), userAgent: String(input.userAgent ?? '').slice(0, 300), consentText: CONSENT_TEXT, consentTextVersion: CONSENT_TEXT_VERSION, at: now.toISOString(),
    requestId: request.id, tokenHash: request.tokenHash, contactUsed: request.contactLabel, ...(signature ? { signature } : { typedSignature: true }),
  }
  const result = await applyAnswers(uow, actor, ev, ro, law, input.answers ?? [], input.replacedPartsElection ?? null, {
    method: 'electronic_link', actorKind: 'customer', actorName: signerName, contactUsed: request.contactLabel, evidence, recordedByUserId: null, authorizationRequestId: request.id, signatureDocumentId: null, poNumber: '', at: now,
  })
  const answer = toJsonValue({ status: 'answered', ...result, answeredAt: now })
  await transition(uow, { model: 'AuthorizationRequest', id: request.id, from: ['created', 'delivered', 'viewed'], to: 'answered', actor, eventType: 'authorization_request.answered', data: { answeredAt: now, answer: answer as never } })
  return { replay: false, ...(answer as object) }
}

// ── Staff tasks (callbacks) ───────────────────────────────────────────────────

export type TaskInput = { shopId: string; repairOrderId?: string | null; authorizationRequestId?: string | null; kind: 'authorization_callback' | 'authorization_follow_up' | 'customer_callback' | 'reassembly_due' | 'other'; title: string; detail?: string | null; source: 'staff' | 'agent' | 'voice' | 'timer' | 'public_api'; evidence?: Record<string, unknown>; dueAt?: Date | null; assigneeId?: string | null }

/**
 * A to-do for staff. This is all an assistant (or a voice call) can do with a customer's "yes":
 * it becomes a callback task, and a person calls back and records the authorization.
 */
export async function createStaffTask(uow: UnitOfWork, actor: Actor, input: TaskInput) {
  const title = String(input.title ?? '').trim().slice(0, 160)
  if (!title) throw new DomainError(Codes.INVALID_INPUT, 'Give the task a title.', { field: 'title' })
  const row = await uow.tx.staffTask.create({
    data: {
      shopId: input.shopId, repairOrderId: input.repairOrderId ?? null, authorizationRequestId: input.authorizationRequestId ?? null, kind: input.kind, title, detail: String(input.detail ?? '').slice(0, 1000),
      source: input.source, evidence: toJsonValue(input.evidence ?? {}) as never, dueAt: input.dueAt ?? new Date(uow.now.getTime() + 30 * 60_000), assigneeId: input.assigneeId ?? null,
      createdByUserId: actor.kind === 'user' ? actor.userId : null, createdByAgentId: actor.kind === 'agent' ? actor.agentId : null, status: 'open',
    },
  })
  auditCreate(uow, actor, 'StaffTask', row.id, 'task.created', { kind: input.kind, source: input.source, repairOrderId: input.repairOrderId ?? null })
  return { id: row.id }
}

export async function closeStaffTask(uow: UnitOfWork, actor: Actor, input: { taskId: string; expectedVersion: number; outcome: string; cancel?: boolean }) {
  requireHuman(actor, 'close a staff task')
  const outcome = String(input.outcome ?? '').trim().slice(0, 500)
  if (!outcome) throw new DomainError(Codes.INVALID_INPUT, 'Write what happened.', { field: 'outcome' })
  await transition(uow, { model: 'StaffTask', id: input.taskId, from: ['open'], to: input.cancel ? 'cancelled' : 'done', expectedVersion: input.expectedVersion, actor, eventType: input.cancel ? 'task.cancelled' : 'task.done', data: { outcome, doneAt: uow.now, doneById: actorUserId(actor) } })
  return { id: input.taskId, status: input.cancel ? 'cancelled' : 'done' }
}
