'use client'

import * as React from 'react'
import { checkRepair, type LookupState, type RepairView } from '../actions/lookup'
import { jobStatus, money, repairStatus } from '../lib/format'

const START: LookupState = { ok: false, message: '' }

/** Where a repair stands: vehicle and repair order, inspection counts, the estimate job by job. */
export function RepairStatus({ repair, big = false }: { repair: RepairView; big?: boolean }) {
  const waiting = repair.estimate?.jobs.some(j => j.status === 'offered' || j.status === 'needs_reauthorization') ?? false
  return (
    <div aria-live="polite">
      <p className={`sf-label ${big ? 'text-[24px]' : 'text-[20px] lg:text-[24px]'}`}>{[repair.vehicle, repair.roNumber].filter(Boolean).join(' · ')}</p>
      <p className="text-[16px]">{repairStatus(repair.status)}</p>

      {repair.inspection ? (
        <div className="mt-2 text-[16px]">
          <p>Digital inspection ready:</p>
          <p className="flex items-center gap-3"><span className="sf-dot sf-dot-red" />{repair.inspection.red} need attention now</p>
          <p className="flex items-center gap-3"><span className="sf-dot sf-dot-yellow" />{repair.inspection.yellow} soon</p>
          <p className="flex items-center gap-3"><span className="sf-dot sf-dot-green" />{repair.inspection.green} good</p>
        </div>
      ) : null}

      {repair.estimate ? (
        <div className="sf-rule-top mt-3 pt-2">
          <p className="flex items-baseline gap-4"><span className="sf-label text-[24px]">Estimate</span><span className="sf-num text-[24px]">{money(repair.estimate.totalMinor)}</span></p>
          <p className="text-[15px]">{waiting ? 'Approve each job separately.' : 'Your answers are on file.'}</p>
          <ul className="sf-rows-soft mt-2">
            {repair.estimate.jobs.map(job => (
              <li key={job.number} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0 py-2 text-[16px] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,9.5rem)]">
                <span className="min-w-0 break-words">{job.title}</span>
                <span className="sf-num text-right">{money(job.totalMinor)}</span>
                <span className={`col-span-2 text-[15px] sm:col-span-1 sm:text-right ${job.status === 'offered' || job.status === 'needs_reauthorization' ? 'sf-accent' : ''}`}>{jobStatus(job.status)}</span>
              </li>
            ))}
          </ul>
          <p className="sf-rule-top mt-0 flex items-baseline justify-between gap-4 pt-2"><span className="sf-label text-[17px]">Total (incl. tax)</span><span className="sf-num text-[24px]">{money(repair.estimate.totalMinor)}</span></p>
          {waiting ? (
            <p className="sf-note mt-3 text-[15px]">
              To approve or decline, open the link we sent to {repair.approvalSentTo ?? 'your phone'}
              {repair.shopPhone ? <>, or call <span className="sf-num">{repair.shopPhone}</span></> : null}. Each job is signed for on its own.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[16px]">No estimate has been sent yet. We will text you when it is ready.</p>
      )}

      {repair.balanceMinor ? (
        <p className="mt-3 text-[16px]">Balance due <span className="sf-num">{money(repair.balanceMinor)}</span>. Pay on the invoice link we sent, or at the counter.</p>
      ) : null}
    </div>
  )
}

/** "Check my repair": the repair order number and the phone on file, then the status in place. */
export function CheckRepair({ idPrefix = 'check', big = false }: { idPrefix?: string; big?: boolean }) {
  const [state, action, pending] = React.useActionState(checkRepair, START)
  // Kept in state so a miss does not clear what was typed.
  const [ro, setRo] = React.useState('')
  const [phone, setPhone] = React.useState('')
  return (
    <div>
      <form action={action} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <label htmlFor={`${idPrefix}-ro`} className="sr-only">Repair order number</label>
          <input id={`${idPrefix}-ro`} name="roNumber" value={ro} onChange={e => setRo(e.target.value)} className="sf-field sf-num" placeholder="RO number" autoComplete="off" maxLength={40} required />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-phone`} className="sr-only">Phone number on file</label>
          <input id={`${idPrefix}-phone`} name="phone" value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" className="sf-field sf-num" placeholder="Phone on file" autoComplete="tel" maxLength={30} required />
        </div>
        <button type="submit" className="sf-btn-line sf-label" disabled={pending}>{pending ? 'Checking' : 'Check'}</button>
      </form>
      {state.message ? <p role="alert" className="sf-error mt-2 text-[15px]">{state.message}</p> : null}
      {state.repair ? (
        <div className="mt-4"><RepairStatus repair={state.repair} big={big} /></div>
      ) : (
        <p className="mt-3 text-[15px] lg:text-[16px]">
          Enter the repair order number from your work order and the phone number we have for you. You will see the inspection results, the estimate job by job, and where the repair stands.
        </p>
      )}
    </div>
  )
}
