/**
 * The work-board stage of a repair order (STATE-MACHINES §2). A projection, not a state: jobs and
 * inspections carry the real states. Pure, so the server, the board screen and the tests agree.
 *
 * Priority for an RO in service: awaiting authorization > waiting parts > in progress >
 * quality check > inspecting > estimating.
 */

export type BoardInput = {
  status: string
  jobs: { status: string; waitingParts?: boolean }[]
  inspections: { status: string }[]
  qualityCheckPending?: boolean
}

export const BOARD_STAGES = [
  'checked_in', 'inspecting', 'estimating', 'awaiting_authorization', 'waiting_parts', 'in_progress', 'quality_check', 'on_hold', 'ready', 'invoiced',
] as const
export type BoardStage = typeof BOARD_STAGES[number] | 'draft' | 'closed' | 'void'

export const BOARD_LABELS: Record<string, string> = {
  checked_in: 'Checked in',
  inspecting: 'Inspecting',
  estimating: 'Estimating',
  awaiting_authorization: 'Waiting on customer',
  waiting_parts: 'Waiting parts',
  in_progress: 'In progress',
  quality_check: 'Quality check',
  on_hold: 'On hold',
  ready: 'Ready to invoice',
  invoiced: 'Invoiced',
}

export function boardStage(input: BoardInput): BoardStage {
  switch (input.status) {
    case 'draft': return 'draft'
    case 'checked_in': return input.jobs.length || input.inspections.some(i => i.status !== 'assigned') ? stageInService(input) : 'checked_in'
    case 'on_hold': return 'on_hold'
    case 'ready_to_invoice': return 'ready'
    case 'invoiced': return 'invoiced'
    case 'closed': return 'closed'
    case 'void': return 'void'
    default: return stageInService(input)
  }
}

function stageInService(input: BoardInput): BoardStage {
  const jobs = input.jobs
  if (jobs.some(j => j.status === 'offered' || j.status === 'needs_reauthorization')) return 'awaiting_authorization'
  if (jobs.some(j => (j.status === 'authorized' || j.status === 'in_progress') && j.waitingParts)) return 'waiting_parts'
  if (jobs.some(j => j.status === 'in_progress')) return 'in_progress'
  if (input.qualityCheckPending) return 'quality_check'
  if (input.inspections.some(i => i.status === 'in_progress' || i.status === 'assigned')) return 'inspecting'
  if (jobs.length && jobs.every(j => ['authorized', 'completed', 'declined', 'deferred', 'voided'].includes(j.status)) && jobs.some(j => j.status === 'authorized')) return 'in_progress'
  return 'estimating'
}

/** Why the RO is not moving, in words for the board ("Waiting on customer since 10:40"). */
export function waitingReason(input: BoardInput & { holdReason?: string | null }): string | null {
  if (input.status === 'on_hold') return (input.holdReason ?? 'other').replaceAll('_', ' ')
  if (input.jobs.some(j => j.status === 'needs_reauthorization')) return 'new authorization needed'
  if (input.jobs.some(j => j.status === 'offered')) return 'customer to answer the estimate'
  return null
}

/** Promised-time risk: late, due within the hour, or fine. */
export function promisedRisk(promisedAt: string | Date | null | undefined, now: Date, done: boolean): 'late' | 'due_soon' | 'ok' | 'none' {
  if (!promisedAt || done) return 'none'
  const ms = new Date(promisedAt).getTime() - now.getTime()
  if (ms < 0) return 'late'
  if (ms < 60 * 60_000) return 'due_soon'
  return 'ok'
}
