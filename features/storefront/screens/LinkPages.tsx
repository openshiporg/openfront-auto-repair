import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuthorization, getFleet, getInspection, getInvoice, getPortal } from '@/features/keystone/public/handlers'
import { EstimateDecision, FleetApprove, FleetPay, PayByCard, type EstimateJob, type FleetWaiting } from '../components/LinkClients'
import { LinkProblem, Page } from '../components/Shell'
import { getStorefront, storefrontDb, type Storefront } from '../lib/data'
import { dayAt, dayOfDate, jobStatus, money, phone, repairStatus, words } from '../lib/format'
import { callerRequest } from '../lib/guard'

/*
 * The pages behind the links the shop hands a customer: estimate, inspection, invoice, their
 * vehicles and repairs, and the fleet account. Each one calls the same token-scoped handler as the
 * public API (features/keystone/public/handlers), so the page and the API can never disagree.
 */

type Any = Record<string, any>

async function store(): Promise<Storefront> {
  const found = await getStorefront()
  if (!found) redirect('/dashboard')
  return found
}

async function read(res: Response): Promise<{ ok: true; view: Any } | { ok: false; message: string }> {
  const body = (await res.json().catch(() => ({}))) as Any
  if (res.status !== 200) return { ok: false, message: String(body?.error?.message ?? '') }
  return { ok: true, view: body }
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4 py-2"><dt className="sf-label">{label}</dt><dd className="min-w-0 break-words text-right">{children}</dd></div>
)

// ── Estimate ─────────────────────────────────────────────────────────────────

export async function EstimatePage({ token }: { token: string }) {
  const s = await store()
  const got = await read(await getAuthorization(storefrontDb(), await callerRequest('/estimate'), token))
  if (!got.ok) return <LinkProblem store={s} message={got.message} />
  const v = got.view
  const shopPhone = s.shops.find(x => x.code === v.shop?.code)?.phone ?? s.shop.phone
  // Where each job stands today. A job answered since the estimate was sent (by phone, at the counter) is shown as settled, not asked again.
  const live = new Map((await storefrontDb().job.findMany({ where: { id: { in: (v.jobs ?? []).map((j: Any) => String(j.id)) } }, select: { id: true, status: true } })).map(j => [j.id, j.status]))
  const settled = (id: string) => live.has(id) && !['offered', 'needs_reauthorization'].includes(live.get(id)!)
  const jobs: EstimateJob[] = (v.jobs ?? []).map((j: Any) => ({
    id: j.id, number: j.number, title: j.title, description: j.description ?? '', totalMinor: String(j.totalMinor), alreadyAuthorized: !!j.alreadyAuthorized || settled(j.id),
    standing: settled(j.id) ? jobStatus(live.get(j.id)!) : j.alreadyAuthorized ? 'Approved earlier' : '',
    lines: (j.lines ?? []).map((l: Any) => ({ description: String(l.description ?? ''), extendedMinor: String(l.extendedMinor ?? '0') })),
    teardownText: j.teardown?.text ? String(j.teardown.text) : '',
  }))
  const bar = v.shop?.registrations?.barArd

  return (
    <Page title="Your estimate" lead={[v.vehicle?.label, v.estimate].filter(Boolean).join(' · ')} narrow>
      <div className="sf-panel px-5 py-5 lg:px-7">
        <p className="text-[17px]">{v.customer?.name ? `${v.customer.name}, here` : 'Here'} is what we found and what it costs. Approve each job separately.</p>

        {v.status === 'answered' ? (
          <div role="status">
            <p className="sf-note mt-4 text-[17px]">Your answer is on file{v.answer?.answeredAt ? `, sent ${dayAt(v.answer.answeredAt, s.shop.timeZone)}` : ''}. Thank you.</p>
            <ul className="sf-rows-soft sf-rule-top mt-4">
              {jobs.map(job => {
                const approved = ['authorized', 'in_progress', 'completed'].includes(live.get(job.id) ?? '')
                return (
                  <li key={job.id} className="flex flex-wrap items-baseline gap-x-5 py-2.5 text-[17px]">
                    <span className="min-w-0 flex-1 break-words">{job.title}</span>
                    <span className="sf-num">{money(job.totalMinor)}</span>
                    <span className={`w-full sm:w-52 sm:text-right ${approved ? 'sf-accent' : ''}`}>{live.has(job.id) ? jobStatus(live.get(job.id)!) : job.standing}</span>
                  </li>
                )
              })}
            </ul>
            <p className="mt-4 text-[16px]">To change your answer, call {v.shop?.name ?? s.shop.name}{shopPhone ? <> on <span className="sf-num">{shopPhone}</span></> : null}.</p>
          </div>
        ) : v.superseded ? (
          <p className="sf-note mt-4 text-[17px]">This estimate has been replaced by a newer one. Use the newest link we sent, or call {shopPhone ? <span className="sf-num">{shopPhone}</span> : 'the shop'}.</p>
        ) : (
          <div className="mt-4">
            <EstimateDecision
              token={token} jobs={jobs} totalMinor={String(v.totals?.totalMinor ?? '0')} consentText={String(v.disclosures?.consentText ?? '')}
              replacedPartsOffer={v.disclosures?.replacedPartsOffer ? String(v.disclosures.replacedPartsOffer) : null} shopName={v.shop?.name ?? s.shop.name} shopPhone={shopPhone}
            />
          </div>
        )}
      </div>

      <div className="mt-5 space-y-2 text-[15px]">
        {v.depositRequestedMinor ? <p>Deposit requested before work starts: <span className="sf-num">{money(v.depositRequestedMinor)}</span>.</p> : null}
        {(v.disclosures?.notices ?? []).map((n: Any) => <p key={n.key}>{n.text}</p>)}
        {v.disclosures?.nonReturnableNote ? <p>{v.disclosures.nonReturnableNote}</p> : null}
        <p className="sf-dim">{[v.shop?.legalName || v.shop?.name, bar ? `Automotive Repair Dealer registration ${bar}` : '', v.status !== 'answered' && v.expiresAt ? `This link works until ${dayAt(v.expiresAt, s.shop.timeZone)}` : ''].filter(Boolean).join(' · ')}</p>
      </div>
    </Page>
  )
}

// ── Inspection ───────────────────────────────────────────────────────────────

const CONDITION: Record<string, { dot: string; word: string }> = {
  red: { dot: 'sf-dot-red', word: 'Needs attention now' },
  yellow: { dot: 'sf-dot-yellow', word: 'Soon' },
  green: { dot: 'sf-dot-green', word: 'Good' },
}

export async function InspectionPage({ token }: { token: string }) {
  const s = await store()
  const got = await read(await getInspection(storefrontDb(), await callerRequest('/inspection'), token))
  if (!got.ok) return <LinkProblem store={s} message={got.message} />
  const v = got.view
  const items: Any[] = v.items ?? []
  const count = (c: string) => items.filter(i => i.condition === c).length
  const sections = [...new Set(items.map(i => String(i.section ?? '')))]
  const measure = (m: unknown) => (Array.isArray(m) ? m.map((x: Any) => [x.position, x.value].filter(v => v !== undefined && v !== null && v !== '').join(' ')).filter(Boolean).join(', ') : '')

  return (
    <Page title="Your inspection" lead={[v.vehicle, v.repairOrder].filter(Boolean).join(' · ')} narrow>
      <div className="sf-panel px-5 py-5 lg:px-7">
        <p className="text-[17px]">Digital inspection ready{v.completedAt ? `, finished ${dayAt(v.completedAt, s.shop.timeZone)}` : ''}:</p>
        <p className="mt-1 flex items-center gap-3 text-[17px]"><span className="sf-dot sf-dot-red" />{count('red')} need attention now</p>
        <p className="flex items-center gap-3 text-[17px]"><span className="sf-dot sf-dot-yellow" />{count('yellow')} soon</p>
        <p className="flex items-center gap-3 text-[17px]"><span className="sf-dot sf-dot-green" />{count('green')} good</p>

        {sections.map(section => (
          <section key={section} className="mt-5">
            {section ? <h2 className="sf-label sf-rule-top pt-2 text-[19px]">{section}</h2> : null}
            <ul className="sf-rows-soft">
              {items.filter(i => String(i.section ?? '') === section).map((item, i) => {
                const c = CONDITION[item.condition]
                return (
                  <li key={i} className="py-2.5 text-[16px]">
                    <p className="flex items-baseline gap-3">
                      {c ? <span className={`sf-dot ${c.dot} translate-y-[1px]`} /> : null}
                      <span className="min-w-0 flex-1 break-words">{item.label}</span>
                      <span className="shrink-0 text-right">{c?.word ?? words(item.condition)}</span>
                    </p>
                    {measure(item.measurements) ? <p className="sf-num pl-[23px] text-[15px]">{measure(item.measurements)}</p> : null}
                    {item.notes ? <p className="max-w-[60ch] break-words pl-[23px] text-[15px]">{item.notes}</p> : null}
                    {item.media ? <p className="sf-dim pl-[23px] text-[15px]">{item.media} {item.media === 1 ? 'photo' : 'photos'} on file. Ask your service advisor to show you.</p> : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-5 text-[16px]">
        Questions about a finding? Call {v.shop?.name ?? s.shop.name}{v.shop?.phone ? <> on <span className="sf-num">{phone(v.shop.phone)}</span></> : null}. If work is recommended, we send an estimate you approve job by job.
      </p>
    </Page>
  )
}

// ── Invoice ──────────────────────────────────────────────────────────────────

export async function InvoicePage({ token, returned }: { token: string; returned: string }) {
  const s = await store()
  const got = await read(await getInvoice(storefrontDb(), await callerRequest('/pay'), token))
  if (!got.ok) return <LinkProblem store={s} message={got.message} />
  const v = got.view
  const owed = BigInt(v.totals.balanceMinor)
  return (
    <Page title={`Invoice ${v.invoiceNumber}`} lead={[v.vehicle, v.roNumber ? `Repair order ${v.roNumber}` : '', v.invoiceDate ? `Invoiced ${dayOfDate(v.invoiceDate)}` : ''].filter(Boolean).join(' · ')} narrow>
      <div className="sf-panel px-5 py-5 lg:px-7">
        <p className="sf-dim text-[15px]">{v.shop?.legalName || v.shop?.name}</p>
        <ul className="sf-rows-soft mt-2">
          {(v.lines as Any[]).map((l, i) => (
            <li key={i} className="flex items-start justify-between gap-4 py-2 text-[16px]"><span className="min-w-0 break-words">{l.description}</span><span className="sf-num shrink-0">{money(l.extendedMinor)}</span></li>
          ))}
        </ul>
        <dl className="mt-2 text-[16px]">
          <div className="flex justify-between gap-4 py-1"><dt>Sales tax</dt><dd className="sf-num">{money(v.totals.taxMinor)}</dd></div>
          <div className="flex justify-between gap-4 py-1"><dt className="sf-label">Total</dt><dd className="sf-num">{money(v.totals.totalMinor)}</dd></div>
          {BigInt(v.totals.paidMinor) > 0n ? <div className="flex justify-between gap-4 py-1"><dt>Paid</dt><dd className="sf-num">{money(v.totals.paidMinor)}</dd></div> : null}
          {BigInt(v.totals.creditedMinor) > 0n ? <div className="flex justify-between gap-4 py-1"><dt>Credited</dt><dd className="sf-num">{money(v.totals.creditedMinor)}</dd></div> : null}
          <div className="sf-rule-top mt-2 flex items-baseline justify-between gap-4 pt-3"><dt className="sf-label text-[20px]">Balance due</dt><dd className="sf-num text-[26px]">{money(v.totals.balanceMinor)}</dd></div>
        </dl>
        <div className="mt-5">
          {owed <= 0n ? (
            <p role="status" className="sf-note text-[17px]">{returned === 'paid' ? 'Thank you. Your payment went through and this invoice is paid.' : 'This invoice is paid. Thank you.'}</p>
          ) : v.canPayByCard ? (
            <PayByCard token={token} balance={money(v.totals.balanceMinor)} returned={returned} inProgress={v.paymentInProgress} />
          ) : (
            <p className="sf-note text-[17px]">To pay this invoice, call {v.shop?.name}{v.shop?.phone ? <> on <span className="sf-num">{phone(v.shop.phone)}</span></> : null}, or pay at the counter.</p>
          )}
        </div>
      </div>
    </Page>
  )
}

// ── My vehicles and repairs ──────────────────────────────────────────────────

const vehicleName = (v: Any | null | undefined) => [v?.year, v?.make, v?.model].filter(Boolean).join(' ') || 'Vehicle'

export async function PortalPage({ token, repairOrderId, vehicleId }: { token: string; repairOrderId?: string; vehicleId?: string }) {
  const s = await store()
  const got = await read(await getPortal(storefrontDb(), await callerRequest("/portal"), token, { repairOrderId, vehicleId }))
  if (!got.ok) return <LinkProblem store={s} message={got.message} />
  const v = got.view
  const base = `/portal/${token}`
  const tz = s.shop.timeZone

  if (repairOrderId) {
    const ro = v.repairOrder
    return (
      <Page title={`Repair order ${ro.number}`} lead={[vehicleName(ro.vehicle), ro.shop, `Opened ${dayAt(ro.openedAt, tz)}`].filter(Boolean).join(' · ')} narrow>
        <p className="mb-4"><Link href={base} className="text-[16px] hover:underline">All my vehicles and repairs</Link></p>
        <div className="sf-panel px-5 py-5 lg:px-7">
          <p className="text-[18px]">{repairStatus(ro.status)}</p>
          <h2 className="sf-label sf-rule-top mt-4 pt-2 text-[19px]">Jobs</h2>
          {ro.jobs.length ? (
            <ul className="sf-rows-soft">
              {(ro.jobs as Any[]).map(job => (
                <li key={job.id} className="flex flex-wrap items-baseline gap-x-5 py-2.5 text-[16px]">
                  <span className="min-w-0 flex-1 break-words">{job.title}</span>
                  <span className="sf-num">{money(job.totalMinor)}</span>
                  <span className={`w-full sm:w-52 sm:text-right ${job.status === 'offered' ? 'sf-accent' : ''}`}>{jobStatus(job.status)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-2 text-[16px]">No jobs on this repair order yet.</p>}
          {ro.invoices.length ? (
            <>
              <h2 className="sf-label sf-rule-top mt-4 pt-2 text-[19px]">Invoices</h2>
              <ul className="sf-rows-soft">
                {(ro.invoices as Any[]).map(inv => (
                  <li key={inv.id} className="flex flex-wrap items-baseline gap-x-5 py-2.5 text-[16px]">
                    <span className="sf-num min-w-0 flex-1">{inv.invoiceNumber}</span>
                    <span className="sf-num">{money(inv.totalMinor)}</span>
                    <span className="w-full sm:w-52 sm:text-right">{BigInt(inv.balanceMinor) > 0n ? <>Balance <span className="sf-num">{money(inv.balanceMinor)}</span></> : 'Paid'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[15px]">To pay a balance, use the invoice link we sent, or pay at the counter.</p>
            </>
          ) : null}
        </div>
      </Page>
    )
  }

  if (vehicleId) {
    return (
      <Page title={vehicleName(v.vehicle)} lead={`${v.count} ${v.count === 1 ? 'repair order' : 'repair orders'} while you have owned it.`} narrow>
        <p className="mb-4"><Link href={base} className="text-[16px] hover:underline">All my vehicles and repairs</Link></p>
        <div className="sf-panel px-5 py-5 lg:px-7">
          <h2 className="sf-label text-[19px]">Repair orders</h2>
          <RepairList base={base} rows={v.repairOrders} tz={tz} />
          {v.odometer.length ? (
            <>
              <h2 className="sf-label sf-rule-top mt-4 pt-2 text-[19px]">Odometer</h2>
              <ul className="sf-rows-soft">
                {(v.odometer as Any[]).map((r, i) => (
                  <li key={i} className="flex justify-between gap-4 py-2 text-[16px]"><span>{dayAt(r.at, tz)}</span><span className="sf-num">{Number(r.value).toLocaleString('en-US')} {r.unit}</span></li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <p className="mt-5"><Link href={`/book?vehicle=${encodeURIComponent(vehicleName(v.vehicle))}`} className="sf-btn">Book a repair for this vehicle</Link></p>
      </Page>
    )
  }

  return (
    <Page title="My vehicles and repairs" lead={v.customer?.displayName ? `${v.customer.displayName}, this is your service history with us.` : undefined} narrow>
      <div className="sf-panel px-5 py-5 lg:px-7">
        <h2 className="sf-label text-[19px]">Vehicles</h2>
        {v.vehicles.length ? (
          <ul className="sf-rows-soft">
            {(v.vehicles as Any[]).map(veh => (
              <li key={veh.id}><Link href={`${base}/vehicles/${veh.id}`} className="flex min-h-12 items-center justify-between gap-4 text-[17px] no-underline hover:underline"><span>{vehicleName(veh)}</span><span aria-hidden="true">›</span></Link></li>
            ))}
          </ul>
        ) : <p className="py-2 text-[16px]">No vehicles on file yet.</p>}
        <h2 className="sf-label sf-rule-top mt-4 pt-2 text-[19px]">Repair orders</h2>
        <RepairList base={base} rows={v.repairOrders} tz={tz} showVehicle />
      </div>
      <p className="mt-5"><Link href="/book" className="sf-btn">Book a repair</Link></p>
    </Page>
  )
}

function RepairList({ base, rows, tz, showVehicle = false }: { base: string; rows: Any[]; tz: string; showVehicle?: boolean }) {
  if (!rows.length) return <p className="py-2 text-[16px]">No repair orders yet.</p>
  return (
    <ul className="sf-rows-soft">
      {rows.map(r => (
        <li key={r.id}>
          <Link href={`${base}/repair-orders/${r.id}`} className="flex min-h-12 flex-wrap items-baseline gap-x-5 py-2 text-[16px] no-underline hover:bg-white/5">
            <span className="sf-num">{r.number}</span>
            <span className="min-w-0 flex-1">{[showVehicle ? vehicleName(r.vehicle) : '', dayAt(r.openedAt, tz)].filter(Boolean).join(' · ')}</span>
            <span>{words(r.status)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** "days31to60Minor" → "31 to 60 days"; "days90plus" → "Over 90 days". */
function agingLabel(key: string) {
  const k = key.replace(/Minor$/, '')
  const range = /(\d+)\D+(\d+)/.exec(k)
  if (range) return `${range[1]} to ${range[2]} days`
  const over = /(\d+)/.exec(k)
  if (over) return `Over ${over[1]} days`
  return words(k.replace(/([a-z])([A-Z])/g, '$1 $2'))
}

// ── Fleet account ────────────────────────────────────────────────────────────

export async function FleetAccountPage({ token, returned }: { token: string; returned: string }) {
  const s = await store()
  const got = await read(await getFleet(storefrontDb(), await callerRequest('/fleet'), token))
  if (!got.ok) return <LinkProblem store={s} message={got.message} />
  const v = got.view
  const waiting: FleetWaiting[] = (v.waitingForApproval ?? []).map((w: Any) => ({ ...w, jobs: w.jobs.map((j: Any) => ({ ...j, totalMinor: String(j.totalMinor) })) }))
  const aging = v.aging && typeof v.aging === 'object' ? Object.entries(v.aging as Record<string, unknown>).filter(([, amount]) => /^-?\d+$/.test(String(amount))) : []

  return (
    <Page title={v.account.name} lead={`Fleet account. Signed in as ${v.you.name}${v.you.canApprove ? `, approver up to ${money(v.you.approvalLimitMinor)} a job` : ''}.`}>
      {returned === 'paid' ? <p role="status" className="sf-note mb-5 text-[17px]">Thank you. Your card payment is being confirmed and the balance below updates once it settles.</p> : null}
      {returned === 'cancelled' ? <p role="status" className="sf-note mb-5 text-[17px]">Nothing was charged. You can pay when you are ready.</p> : null}
      {v.account.onHold ? <p role="alert" className="sf-note mb-5 text-[17px]">This account is on hold{v.account.holdReason ? `: ${v.account.holdReason}` : ''}. New work waits until it is cleared. Call {s.shop.phone ? <span className="sf-num">{s.shop.phone}</span> : 'the shop'}.</p> : null}

      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div>
          <h2 className="sf-display text-[26px]">Waiting for approval</h2>
          {waiting.length ? (
            <div className="sf-rows">{waiting.map(item => <FleetApprove key={item.estimateVersionId} token={token} item={item} canApprove={!!v.you.canApprove} poRequired={!!v.account.poRequired} />)}</div>
          ) : <p className="sf-rule-top mt-2 pt-3 text-[17px]">Nothing is waiting for approval.</p>}

          <h2 className="sf-display mt-8 text-[26px]">Invoices</h2>
          {v.invoices.length ? (
            <ul className="sf-rows mt-2">
              {(v.invoices as Any[]).map(inv => (
                <li key={inv.id} className="flex flex-wrap items-baseline gap-x-5 py-2.5 text-[16px]">
                  <span className="sf-num">{inv.invoiceNumber}</span>
                  <span className="min-w-0 flex-1">{[dayOfDate(inv.invoiceDate), inv.poNumber ? `PO ${inv.poNumber}` : '', inv.dueDate && BigInt(inv.balanceMinor) > 0n ? `due ${dayOfDate(inv.dueDate)}` : ''].filter(Boolean).join(' · ')}</span>
                  <span className="sf-num">{money(inv.totalMinor)}</span>
                  <span className="w-full text-right sm:w-40">
                    {BigInt(inv.balanceMinor) <= 0n ? 'Paid' : v.canPayByCard ? <FleetPay token={token} invoiceId={inv.id} balance={money(inv.balanceMinor)} /> : <>Balance <span className="sf-num">{money(inv.balanceMinor)}</span></>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="sf-rule-top mt-2 pt-3 text-[17px]">No invoices yet.</p>}
        </div>

        <div>
          <h2 className="sf-display text-[26px]">Account</h2>
          <dl className="sf-rows mt-2 text-[16px]">
            <Row label="Open balance"><span className="sf-num">{money(v.account.openBalanceMinor)}</span></Row>
            <Row label="Credit limit"><span className="sf-num">{money(v.account.creditLimitMinor)}</span></Row>
            <Row label="Terms">Net {v.account.termsDays} days</Row>
            <Row label="Purchase order">{v.account.poRequired ? 'Required on every job' : 'Optional'}</Row>
            {aging.map(([bucket, amount]) => <Row key={bucket} label={agingLabel(bucket)}><span className="sf-num">{money(String(amount))}</span></Row>)}
          </dl>

          <h2 className="sf-display mt-8 text-[26px]">Units</h2>
          {v.units.length ? (
            <ul className="sf-rows mt-2">
              {(v.units as Any[]).map(u => (
                <li key={u.unitNumber} className="flex flex-wrap items-baseline gap-x-4 py-2.5 text-[16px]">
                  <span className="sf-num w-16">{u.unitNumber}</span>
                  <span className="min-w-0 flex-1">{u.vehicle}</span>
                  <span className="sf-dim">{[u.driverName, u.costCenter].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : <p className="sf-rule-top mt-2 pt-3 text-[17px]">No units on the account yet.</p>}

          <h2 className="sf-display mt-8 text-[26px]">Statements</h2>
          {v.statements.length ? (
            <ul className="sf-rows mt-2">
              {(v.statements as Any[]).map(st => (
                <li key={st.id} className="flex flex-wrap items-baseline gap-x-4 py-2.5 text-[16px]">
                  <span className="min-w-0 flex-1">{dayOfDate(st.periodStart)} to {dayOfDate(st.periodEnd)}</span>
                  <span className="sf-num">{money(st.closingMinor)}</span>
                  <a href={`/api/public/fleet/${token}/statements/${st.id}`} className="sf-accent inline-flex min-h-11 items-center no-underline hover:underline">Download</a>
                </li>
              ))}
            </ul>
          ) : <p className="sf-rule-top mt-2 pt-3 text-[17px]">No statements yet.</p>}
        </div>
      </div>
    </Page>
  )
}
