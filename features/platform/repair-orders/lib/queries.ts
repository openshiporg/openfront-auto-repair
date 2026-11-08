import { q } from '../../lib/server'

/** Fields every board card and list row needs. Cost fields are left out (canSeeCost only). */
const RO_BASE = `id roNumber status boardStage promisedAt waiter holdReason keyTag currentTotalMinor authorizedTotalMinor openedAt
  shop { id code name timeZone } customer { id displayName } vehicle { id label }
  serviceAdvisor { name }`
export const RO_CARD = `${RO_BASE}
  jobs { id status }
  tasks(where: { status: { equals: "open" } }) { id kind title }`

type RoBase = {
  id: string; roNumber: string; status: string; boardStage: string; promisedAt: string | null; waiter: boolean; holdReason: string; keyTag: string
  currentTotalMinor: string; authorizedTotalMinor: string; openedAt: string | null
  shop: { id: string; code: string; name: string; timeZone: string } | null
  customer: { id: string; displayName: string } | null
  vehicle: { id: string; label: string } | null
  serviceAdvisor: { name: string } | null
}
export type RoCard = RoBase & { jobs: { id: string; status: string }[]; tasks: { id: string; kind: string; title: string }[] }

export const OPEN_STATUSES = ['checked_in', 'in_service', 'on_hold', 'ready_to_invoice']

export async function openRepairOrders(shopId?: string) {
  const where = shopId ? `{ status: { in: ${JSON.stringify(OPEN_STATUSES)} }, shop: { id: { equals: $shop } } }` : `{ status: { in: ${JSON.stringify(OPEN_STATUSES)} } }`
  const d = await q<{ repairOrders: RoCard[]; shops: { id: string; code: string; name: string }[] }>(
    `query${shopId ? '($shop: ID!)' : ''} { repairOrders(where: ${where}, orderBy: { openedAt: asc }, take: 200) { ${RO_CARD} } shops(orderBy: { code: asc }) { id code name } }`,
    shopId ? { shop: shopId } : {},
  )
  return d
}

export const RO_DETAIL = `${RO_BASE}
  replacedPartsElection designee holdNote version
  checkIn { id reference signerName signedAt workOrderHash }
  odometerIn { value unit }
  jurisdictionPolicyVersion { id versionNumber pack { code name verified } toleranceRule allowedAuthorizationMethods requirePartCondition replacedPartsOfferRequired replacedPartsOfferText }
  concerns(orderBy: { sortOrder: asc }) { id customerWords category cause correction }
  jobs(orderBy: { number: asc }) {
    id number title kind status source urgency customerDescription version contentHash authorizedContentHash reauthorizationReason priceSnapshot
    laborMinor partsMinor feesMinor subtotalMinor taxMinor totalMinor authorizedAmountMinor chargeCeilingMinor workStartedAt completedAt
    concern { id customerWords }
    inspectionItemResult { id condition templateItem { label } }
    lines(orderBy: { sortOrder: asc }) { id kind description auto partNumber brand condition quantityMilli soldCentiHours guideCentiHours overlapCentiHours unitPriceMinor extendedMinor taxMinor taxable feeCode subletVendorName }
    authorizations(orderBy: { createdAt: desc }) { id method actorName amountMinor status authorizedAt contactUsed estimateVersion { reference } recordedByUser { name } }
    decisions(orderBy: { at: desc }) { id decision actorName method at reason }
  }
  inspections(orderBy: { createdAt: desc }) { id status startedAt completedAt sentAt technician { name } templateVersion { versionNumber template { name } } resultsCount }
  estimateVersions(orderBy: { versionNumber: desc }) { id reference versionNumber status totalMinor subtotalMinor taxMinor sentAt sentBy { name } includedJobIds snapshot }
  authorizationRequests(orderBy: { createdAt: desc }) { id channel contactLabel status expiresAt viewedAt answeredAt estimateVersion { reference } }
  tasks(orderBy: { createdAt: desc }) { id kind title detail source status outcome dueAt createdAt version }`

export type JobLine = {
  id: string; kind: string; description: string; auto: boolean; partNumber: string; brand: string; condition: string | null; quantityMilli: number
  soldCentiHours: number; guideCentiHours: number; overlapCentiHours: number; unitPriceMinor: string; extendedMinor: string; taxMinor: string; taxable: boolean; feeCode: string; subletVendorName: string
}
export type JobDetail = {
  id: string; number: number; title: string; kind: string; status: string; source: string; urgency: string; customerDescription: string; version: number
  contentHash: string; authorizedContentHash: string; reauthorizationReason: string; priceSnapshot: { problems?: string[]; candidates?: { variant: string; centiHours: number; description: string }[] } | null
  laborMinor: string; partsMinor: string; feesMinor: string; subtotalMinor: string; taxMinor: string; totalMinor: string; authorizedAmountMinor: string; chargeCeilingMinor: string | null
  workStartedAt: string | null; completedAt: string | null
  concern: { id: string; customerWords: string } | null
  inspectionItemResult: { id: string; condition: string; templateItem: { label: string } | null } | null
  lines: JobLine[]
  authorizations: { id: string; method: string; actorName: string; amountMinor: string; status: string; authorizedAt: string; contactUsed: string; estimateVersion: { reference: string } | null; recordedByUser: { name: string } | null }[]
  decisions: { id: string; decision: string; actorName: string; method: string; at: string; reason: string }[]
}
export type RoDetail = RoBase & {
  replacedPartsElection: string; designee: { name?: string; relationship?: string } | null; holdNote: string; version: number
  checkIn: { id: string; reference: string; signerName: string; signedAt: string | null; workOrderHash: string } | null
  odometerIn: { value: number; unit: string } | null
  jurisdictionPolicyVersion: { id: string; versionNumber: number; pack: { code: string; name: string; verified: boolean } | null; toleranceRule: unknown; allowedAuthorizationMethods: string[] | null; requirePartCondition: boolean; replacedPartsOfferRequired: boolean; replacedPartsOfferText: string } | null
  concerns: { id: string; customerWords: string; category: string; cause: string; correction: string }[]
  jobs: JobDetail[]
  inspections: { id: string; status: string; startedAt: string | null; completedAt: string | null; sentAt: string | null; technician: { name: string } | null; templateVersion: { versionNumber: number; template: { name: string } | null } | null; resultsCount: number }[]
  estimateVersions: { id: string; reference: string; versionNumber: number; status: string; totalMinor: string; subtotalMinor: string; taxMinor: string; sentAt: string | null; sentBy: { name: string } | null; includedJobIds: string[] | null; snapshot: EstimateSnapshotView | null }[]
  authorizationRequests: { id: string; channel: string; contactLabel: string; status: string; expiresAt: string; viewedAt: string | null; answeredAt: string | null; estimateVersion: { reference: string } | null }[]
  tasks: { id: string; kind: string; title: string; detail: string; source: string; status: string; outcome: string; dueAt: string | null; createdAt: string; version: number }[]
}

export async function repairOrder(id: string) {
  const d = await q<{ repairOrder: RoDetail | null }>(`query($id: ID!) { repairOrder(where: { id: $id }) { ${RO_DETAIL} } }`, { id })
  return d.repairOrder
}

/** The parts of a sent estimate's frozen snapshot the staff screens show (money as minor-unit strings). */
export type EstimateSnapshotView = {
  jobs?: { id: string; number: number; title: string; description?: string; contentHash?: string; authorizedAlready?: boolean; laborMinor: string; partsMinor: string; feesMinor: string; taxMinor: string; totalMinor: string
    lines: { kind: string; description: string; condition?: string | null; quantityMilli?: number; hours?: number | null; extendedMinor: string }[] }[]
  disclosures?: { consentText?: string }
}

/** Jobs a sent version can still authorize: offered or over the ceiling, and unchanged since it was sent. */
export function answerableJobs(sent: { includedJobIds: string[] | null; snapshot: EstimateSnapshotView | null }, jobs: { id: string; status: string; contentHash: string }[]) {
  const frozen = new Map((sent.snapshot?.jobs ?? []).map(j => [j.id, j]))
  const waiting = jobs.filter(j => (sent.includedJobIds ?? []).includes(j.id) && ['offered', 'needs_reauthorization'].includes(j.status))
  return {
    answerable: waiting.filter(j => frozen.get(j.id)?.contentHash === j.contentHash).map(j => frozen.get(j.id)!),
    changed: waiting.filter(j => frozen.get(j.id)?.contentHash !== j.contentHash).map(j => j.id),
  }
}
