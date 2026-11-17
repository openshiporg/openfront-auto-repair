'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { money } from '../lib/format'

async function post(api: string, body: unknown) {
  const res = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data: data as Record<string, any> }
}
const problem = (data: Record<string, any>, fallback: string) => String(data?.error?.message || data?.message || fallback)

// ── Estimate: approve or decline each job, then sign ──────────────────────────

type Decision = 'approve' | 'decline' | 'defer'
export type EstimateJob = { id: string; number: number; title: string; description: string; totalMinor: string; alreadyAuthorized: boolean; standing: string; lines: { description: string; extendedMinor: string }[]; teardownText: string }

export function EstimateDecision({ token, jobs, totalMinor, consentText, replacedPartsOffer, shopName, shopPhone }: {
  token: string
  jobs: EstimateJob[]
  totalMinor: string
  consentText: string
  replacedPartsOffer: string | null
  shopName: string
  shopPhone: string
}) {
  const router = useRouter()
  const api = `/api/public/authorizations/${token}`
  const open = jobs.filter(j => !j.alreadyAuthorized)
  const [decisions, setDecisions] = React.useState<Record<string, Decision>>({})
  const [signerName, setSignerName] = React.useState('')
  const [consent, setConsent] = React.useState(false)
  const [parts, setParts] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState('')
  const [callNote, setCallNote] = React.useState('')
  const [callAsked, setCallAsked] = React.useState(false)

  const approved = open.filter(j => decisions[j.id] === 'approve')
  const approvedTotal = approved.reduce((n, j) => n + BigInt(j.totalMinor), 0n)
  const unanswered = open.filter(j => !decisions[j.id])
  const choose = (id: string, d: Decision) => setDecisions(current => ({ ...current, [id]: d }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (unanswered.length) return setError(`Choose Approve, Decline or Later for ${unanswered.length === 1 ? `"${unanswered[0].title}"` : `the ${unanswered.length} jobs without an answer`}.`)
    if (!signerName.trim()) return setError('Type your full name to sign.')
    if (!consent) return setError('Tick the box to agree to the authorization wording.')
    if (approved.length && replacedPartsOffer && !parts) return setError('Tell us what to do with the replaced parts.')
    setPending(true)
    const { ok, data } = await post(api, {
      answers: open.map(j => ({ jobId: j.id, decision: decisions[j.id] })), signerName: signerName.trim(), consent: true,
      replacedPartsElection: approved.length && parts ? parts : null,
    })
    setPending(false)
    if (!ok) return setError(problem(data, 'Your answer was not saved. Please try again or call the shop.'))
    router.refresh()
  }

  async function callMe() {
    setError('')
    setPending(true)
    const { ok, data } = await post(api, { callMe: true, callMeNote: callNote })
    setPending(false)
    if (!ok) return setError(problem(data, 'We could not pass on your request. Please call the shop.'))
    setCallAsked(true)
  }

  return (
    <form onSubmit={submit}>
      <ul className="sf-rows-soft sf-rule-top">
        {jobs.map(job => (
          <li key={job.id} className="py-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="sf-label min-w-0 flex-1 break-words text-[18px]" style={{ fontFamily: 'var(--font-sf-body)' }}>{job.title}</span>
              <span className="sf-num text-[18px]">{money(job.totalMinor)}</span>
              {job.alreadyAuthorized ? (
                <span className="w-full text-[16px] sm:w-auto">{job.standing || 'Approved earlier'}</span>
              ) : (
                <span className="flex w-full items-center gap-2 text-[17px] sm:w-auto" role="group" aria-label={`Answer for ${job.title}`}>
                  <button type="button" className="sf-text-btn is-accent" aria-pressed={decisions[job.id] === 'approve'} onClick={() => choose(job.id, 'approve')}>Approve</button>
                  <span aria-hidden="true">|</span>
                  <button type="button" className="sf-text-btn" aria-pressed={decisions[job.id] === 'decline'} onClick={() => choose(job.id, 'decline')}>Decline</button>
                  <span aria-hidden="true">|</span>
                  <button type="button" className="sf-text-btn" aria-pressed={decisions[job.id] === 'defer'} onClick={() => choose(job.id, 'defer')}>Later</button>
                </span>
              )}
            </div>
            {job.description ? <p className="mt-1 max-w-[62ch] text-[15px]">{job.description}</p> : null}
            {job.lines.length ? (
              <details className="mt-1 text-[15px]">
                <summary className="inline-flex min-h-11 cursor-pointer items-center sf-dim">Parts and labor</summary>
                <ul>
                  {job.lines.map((line, i) => (
                    <li key={i} className="flex justify-between gap-4 py-0.5"><span className="min-w-0 break-words">{line.description}</span><span className="sf-num shrink-0">{money(line.extendedMinor)}</span></li>
                  ))}
                </ul>
              </details>
            ) : null}
            {job.teardownText ? <p className="sf-note mt-2 text-[15px]">{job.teardownText}</p> : null}
          </li>
        ))}
      </ul>

      <div className="sf-rule-top flex flex-wrap items-baseline justify-between gap-x-6 pt-3">
        <p className="flex items-baseline gap-4"><span className="sf-label text-[18px]">Total (incl. tax)</span><span className="sf-num text-[22px]">{money(totalMinor)}</span></p>
        <p className="flex items-baseline gap-4" aria-live="polite"><span className="sf-label text-[18px]">You are approving</span><span className="sf-num sf-accent text-[22px]">{money(approvedTotal)}</span></p>
      </div>

      {approved.length && replacedPartsOffer ? (
        <fieldset className="mt-5">
          <legend className="sf-label text-[17px]">Replaced parts</legend>
          <p className="max-w-[62ch] text-[15px]">{replacedPartsOffer}</p>
          <div className="mt-1 flex flex-col">
            <label className="sf-radio text-[16px]"><input type="radio" name="parts" checked={parts === 'return'} onChange={() => setParts('return')} />Give me the replaced parts</label>
            <label className="sf-radio text-[16px]"><input type="radio" name="parts" checked={parts === 'show_only'} onChange={() => setParts('show_only')} />Show them to me at pick-up</label>
            <label className="sf-radio text-[16px]"><input type="radio" name="parts" checked={parts === 'do_not_return'} onChange={() => setParts('do_not_return')} />I do not need them</label>
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5 grid gap-4">
        <div className="max-w-[420px]">
          <label htmlFor="sign-name" className="sf-label mb-1 block text-[16px]">Your full name (this is your signature)</label>
          <input id="sign-name" className="sf-field" value={signerName} onChange={e => setSignerName(e.target.value)} autoComplete="name" maxLength={120} />
        </div>
        <label className="sf-check max-w-[66ch] text-[15px]">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>{consentText}</span>
        </label>
      </div>

      {error ? <p role="alert" className="sf-error mt-3 text-[16px]">{error}</p> : null}
      <button type="submit" className="sf-btn sf-btn-wide mt-4 !text-[20px]" disabled={pending}>{pending ? 'Saving your answer' : 'Sign and send my answer'}</button>

      <div className="mt-6 border-t sf-hair pt-4">
        {callAsked ? (
          <p role="status" className="text-[16px]">We have your request. A service advisor at {shopName} will call you. Your estimate stays open until you answer.</p>
        ) : (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-[16px]">Rather talk it through? Ask us to call you</summary>
            <label htmlFor="call-note" className="sr-only">What would you like to talk about?</label>
            <textarea id="call-note" className="sf-field mt-2" value={callNote} onChange={e => setCallNote(e.target.value)} maxLength={500} placeholder="A good time to call, or your question" />
            <button type="button" className="sf-btn-line mt-2" onClick={callMe} disabled={pending}>Call me</button>
            {shopPhone ? <p className="mt-2 text-[15px]">Or call us on <span className="sf-num">{shopPhone}</span>.</p> : null}
          </details>
        )}
      </div>
    </form>
  )
}

// ── Paying an invoice by card ─────────────────────────────────────────────────

/** Opens the card page, and after the customer comes back asks where the payment stands until it settles. */
export function PayByCard({ token, balance, returned, inProgress }: { token: string; balance: string; returned: string; inProgress: string | null }) {
  const router = useRouter()
  const api = `/api/public/invoices/${token}`
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState('')
  const [checking, setChecking] = React.useState(returned === 'paid' && !!inProgress)

  React.useEffect(() => {
    if (!checking || !inProgress) return
    let tries = 0
    const id = setInterval(async () => {
      tries += 1
      const { data } = await post(api, { paymentId: inProgress }).catch(() => ({ data: {} as Record<string, any> }))
      if (data?.status === 'succeeded') { clearInterval(id); router.refresh() }
      else if (data?.status === 'failed' || tries > 30) { clearInterval(id); setChecking(false) }
    }, 2000)
    return () => clearInterval(id)
  }, [checking, inProgress, api, router])

  async function start() {
    setPending(true)
    setError('')
    const { ok, data } = await post(api, {})
    if (ok && data.checkoutUrl) { window.location.assign(data.checkoutUrl); return }
    setPending(false)
    setError(problem(data, 'We could not open the card page. Please try again or call the shop.'))
  }

  return (
    <div className="space-y-3">
      {returned === 'cancelled' ? <p role="status" className="text-[16px]">Nothing was charged. You can pay when you are ready.</p> : null}
      {checking ? <p role="status" className="text-[16px]">Confirming your payment. This takes a few seconds.</p> : null}
      <button type="button" onClick={start} disabled={pending || checking} className="sf-btn sf-btn-wide !text-[20px]">{pending ? 'Opening the card page' : `Pay ${balance} by card`}</button>
      {error ? <p role="alert" className="sf-error break-words text-[16px]">{error}</p> : null}
    </div>
  )
}

// ── Fleet account: approve within a limit, pay an invoice ─────────────────────

export type FleetWaiting = { estimateVersionId: string; estimate: string; repairOrder: string; unit: string; jobs: { jobId: string; number: number; title: string; totalMinor: string; withinYourLimit: boolean }[] }

export function FleetApprove({ token, item, canApprove, poRequired }: { token: string; item: FleetWaiting; canApprove: boolean; poRequired: boolean }) {
  const router = useRouter()
  const [picked, setPicked] = React.useState<string[]>([])
  const [po, setPo] = React.useState('')
  const [parts, setParts] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState('')
  const [done, setDone] = React.useState(false)
  const total = item.jobs.filter(j => picked.includes(j.jobId)).reduce((n, j) => n + BigInt(j.totalMinor), 0n)

  async function approve() {
    setError('')
    if (!picked.length) return setError('Tick the jobs to approve.')
    if (poRequired && !po.trim()) return setError('Enter the purchase order number.')
    if (!parts) return setError('Tell us what to do with the replaced parts.')
    setPending(true)
    const { ok, data } = await post(`/api/public/fleet/${token}`, { action: 'approve', estimateVersionId: item.estimateVersionId, jobIds: picked, poNumber: po.trim() || null, replacedPartsElection: parts })
    setPending(false)
    if (!ok) return setError(problem(data, 'The approval was not saved. Please try again or call the shop.'))
    setDone(true)
    setPicked([])
    router.refresh()
  }

  return (
    <div className="py-4">
      <p className="sf-label text-[18px]">{[item.unit ? `Unit ${item.unit}` : '', item.repairOrder, item.estimate].filter(Boolean).join(' · ')}</p>
      <ul className="sf-rows-soft mt-1">
        {item.jobs.map(job => (
          <li key={job.jobId}>
            <label className="sf-check min-h-12 items-center py-1 text-[16px]">
              {canApprove ? <input type="checkbox" checked={picked.includes(job.jobId)} disabled={!job.withinYourLimit} onChange={e => setPicked(current => (e.target.checked ? [...current, job.jobId] : current.filter(id => id !== job.jobId)))} /> : null}
              <span className="min-w-0 flex-1 break-words">{job.title}{canApprove && !job.withinYourLimit ? <span className="sf-dim"> (over your limit)</span> : null}</span>
              <span className="sf-num shrink-0">{money(job.totalMinor)}</span>
            </label>
          </li>
        ))}
      </ul>
      {canApprove ? (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor={`po-${item.estimateVersionId}`} className="sf-label mb-1 block text-[15px]">PO number{poRequired ? '' : ' (optional)'}</label>
            <input id={`po-${item.estimateVersionId}`} className="sf-field sf-num !w-[220px]" value={po} onChange={e => setPo(e.target.value)} maxLength={60} />
          </div>
          <div>
            <label htmlFor={`parts-${item.estimateVersionId}`} className="sf-label mb-1 block text-[15px]">Replaced parts</label>
            <select id={`parts-${item.estimateVersionId}`} className="sf-field !w-[240px]" value={parts} onChange={e => setParts(e.target.value)}>
              <option value="">Choose</option>
              <option value="do_not_return">We do not need them</option>
              <option value="return">Return them to us</option>
              <option value="show_only">Show them at pick-up</option>
            </select>
          </div>
          <button type="button" className="sf-btn" onClick={approve} disabled={pending}>{pending ? 'Approving' : `Approve ${picked.length ? money(total) : ''}`.trim()}</button>
        </div>
      ) : (
        <p className="mt-2 text-[15px]">You can see this estimate. An approver on the account approves it.</p>
      )}
      {done ? <p role="status" className="mt-2 text-[16px]">Approved. The shop can start the work.</p> : null}
      {error ? <p role="alert" className="sf-error mt-2 text-[16px]">{error}</p> : null}
    </div>
  )
}

export function FleetPay({ token, invoiceId, balance }: { token: string; invoiceId: string; balance: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState('')
  async function pay() {
    setPending(true)
    setError('')
    const { ok, data } = await post(`/api/public/fleet/${token}`, { action: 'pay', invoiceId })
    if (ok && data.checkoutUrl) { window.location.assign(data.checkoutUrl); return }
    if (ok && data.status === 'succeeded') { setPending(false); router.refresh(); return }
    setPending(false)
    setError(problem(data, 'We could not open the card page. Please try again or call the shop.'))
  }
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" className="sf-text-btn is-accent" onClick={pay} disabled={pending}>{pending ? 'Opening' : `Pay ${balance}`}</button>
      {error ? <span role="alert" className="sf-error max-w-[16rem] text-right text-[14px]">{error}</span> : null}
    </span>
  )
}
