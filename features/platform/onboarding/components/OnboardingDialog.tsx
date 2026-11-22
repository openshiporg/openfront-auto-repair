'use client'

import React, { useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { GraphQLClient } from 'graphql-request'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { completeOnboarding, startOnboarding } from '../actions/onboarding'
import { SETUP_SECTIONS } from '../config/sections'

type Step = 'review' | 'running' | 'done'
type Mode = 'own' | 'example'

const OWN_MUTATION = 'mutation StartOwnShop($input: JSON!, $idempotencyKey: String!) { startOwnShop(input: $input, idempotencyKey: $idempotencyKey) }'
const BLANK = { name: '', code: '', addressLine1: '', city: '', region: '', postalCode: '', phone: '', email: '', opens: '08:00', closes: '17:30', saturday: false, laborRate: '', taxRate: '' }
const field = 'h-11 w-full rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm'
const codeFrom = (name: string) => name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 5).padEnd(2, 'X')

const errorText = (e: any) => e?.response?.errors?.map((x: any) => x.message).join('\n') || e?.message || 'Setup did not finish.'

const OnboardingDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<Step>('review')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<Record<string, number> | null>(null)
  const [mode, setMode] = useState<Mode>('own')
  const [form, setForm] = useState(BLANK)
  const set = (patch: Partial<typeof BLANK>) => setForm(f => ({ ...f, ...patch }))
  // One key per dialog: a retry after a dropped connection replays instead of running twice.
  const key = useRef(`setup-${crypto.randomUUID()}`)
  const running = useRef(false)

  if (!isOpen) return null

  const run = async () => {
    if (running.current) return
    running.current = true
    setError(null)
    setStep('running')
    try {
      const started = await startOnboarding()
      if (!started.success) throw new Error(started.error || 'Could not record setup progress')
      const client = new GraphQLClient(`${window.location.origin}/api/graphql`, { headers: { 'Content-Type': 'application/json' } })
      if (mode === 'own') {
        const result: any = await client.request(OWN_MUTATION, { input: { ...form, code: form.code || codeFrom(form.name) }, idempotencyKey: `${key.current}:own` })
        setCreated(result?.startOwnShop?.created ?? {})
      } else for (const section of SETUP_SECTIONS) {
        const result: any = await client.request(section.mutation, { idempotencyKey: `${key.current}:${section.id}` })
        const payload = result?.[section.field]
        if (!payload?.created) throw new Error(`${section.title} did not return a result`)
        setCreated(prev => ({ ...(prev ?? {}), ...payload.created }))
      }
      const completed = await completeOnboarding()
      if (!completed.success) throw new Error(completed.error || 'Could not complete setup')
      setStep('done')
    } catch (e) {
      setError(errorText(e))
      setStep('review')
    } finally {
      running.current = false
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-4 py-4 sm:px-6">
          <DialogTitle>Set up your shop</DialogTitle>
          <DialogDescription>{mode === 'own'
            ? 'Your shop, your hours and your rate. Customers, staff and prices come next: you add them as you go.'
            : 'Loads Northgate Auto Group: two shops in California with bays, hours, roles, staff, a job catalog and customers with repair history, so you can try every screen. Records you already have are kept; loading again changes nothing.'}</DialogDescription>
          {step === 'review' ? (
            <div role="radiogroup" aria-label="How to start" className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
              {([['own', 'Start with my shop'], ['example', 'Load the example group']] as const).map(([m, text]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setError(null) }}
                  className={`min-h-11 rounded-md px-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 ${mode === m ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{text}</button>
              ))}
            </div>
          ) : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {mode === 'own' && step !== 'done' ? (
            <form id="own-shop" className="grid grid-cols-1 gap-3 sm:grid-cols-6" onSubmit={e => { e.preventDefault(); run() }}>
              <label className="space-y-1 text-sm sm:col-span-4"><span className="font-medium">Shop name</span><input required className={field} value={form.name} onChange={e => set({ name: e.target.value })} autoComplete="organization" /></label>
              <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Short code</span><input className={`${field} uppercase`} maxLength={5} placeholder={form.name ? codeFrom(form.name) : 'MAIN'} value={form.code} onChange={e => set({ code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} aria-describedby="code-help" /></label>
              <p id="code-help" className="-mt-2 text-xs text-muted-foreground sm:col-span-6">Starts every repair order and invoice number, like RO-{form.code || (form.name ? codeFrom(form.name) : 'MAIN')}-2026-000001.</p>
              <label className="space-y-1 text-sm sm:col-span-6"><span className="font-medium">Street address</span><input required className={field} value={form.addressLine1} onChange={e => set({ addressLine1: e.target.value })} autoComplete="address-line1" /></label>
              <label className="space-y-1 text-sm sm:col-span-3"><span className="font-medium">City</span><input required className={field} value={form.city} onChange={e => set({ city: e.target.value })} autoComplete="address-level2" /></label>
              <label className="space-y-1 text-sm sm:col-span-1"><span className="font-medium">State</span><input required className={`${field} uppercase`} maxLength={2} value={form.region} onChange={e => set({ region: e.target.value.toUpperCase() })} autoComplete="address-level1" /></label>
              <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">ZIP</span><input required className={field} inputMode="numeric" value={form.postalCode} onChange={e => set({ postalCode: e.target.value })} autoComplete="postal-code" /></label>
              <label className="space-y-1 text-sm sm:col-span-3"><span className="font-medium">Phone</span><input required type="tel" className={field} value={form.phone} onChange={e => set({ phone: e.target.value })} autoComplete="tel" /></label>
              <label className="space-y-1 text-sm sm:col-span-3"><span className="font-medium">Email <span className="font-normal text-muted-foreground">(optional)</span></span><input type="email" className={field} value={form.email} onChange={e => set({ email: e.target.value })} autoComplete="email" /></label>
              <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Opens</span><input required type="time" className={field} value={form.opens} onChange={e => set({ opens: e.target.value })} /></label>
              <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Closes</span><input required type="time" className={field} value={form.closes} onChange={e => set({ closes: e.target.value })} /></label>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm sm:col-span-2"><input type="checkbox" className="size-5" checked={form.saturday} onChange={e => set({ saturday: e.target.checked })} />Open Saturdays</label>
              <label className="space-y-1 text-sm sm:col-span-3"><span className="font-medium">Labor rate ($ per hour)</span><input required inputMode="decimal" className={field} placeholder="165" value={form.laborRate} onChange={e => set({ laborRate: e.target.value })} /></label>
              <label className="space-y-1 text-sm sm:col-span-3"><span className="font-medium">Sales tax on parts (%)</span><input required inputMode="decimal" className={field} placeholder="8.75" value={form.taxRate} onChange={e => set({ taxRate: e.target.value })} /></label>
              <p className="text-xs text-muted-foreground sm:col-span-6">Also set up for you: the staff roles, approval rules, your state's repair rules where we have them, and a starter job catalog. You can change all of it later.</p>
            </form>
          ) : null}
          {mode === 'example' ? <>
          {SETUP_SECTIONS.map(section => (
            <div key={section.id} className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</p>
              <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {section.items.map(item => (
                  <li key={item} className="flex min-w-0 items-center gap-2">
                    {step === 'done' ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : step === 'running' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />}
                    <span className="truncate">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          </> : null}
          {step === 'done' && created ? (
            <p className="text-sm text-muted-foreground">
              Created {Object.entries(created).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`).join(', ') || 'nothing new (already set up)'}.
            </p>
          ) : null}
          {step === 'done' ? (
            <div className="flex flex-wrap gap-4 text-sm">
              {mode === 'own' ? <Link href="/dashboard/platform/website" className="font-medium underline underline-offset-4" onClick={onClose}>Next: add your prices</Link> : null}
              {mode === 'own' ? <Link href="/dashboard/platform/customers" className="font-medium underline underline-offset-4" onClick={onClose}>Add a customer</Link> : null}
              <Link href="/dashboard/platform/shops" className="font-medium underline underline-offset-4" onClick={onClose}>Shops</Link>
              <Link href="/dashboard/platform/website" className="font-medium underline underline-offset-4" onClick={onClose}>Price list &amp; website</Link>
              <Link href="/dashboard/platform/approvals" className="font-medium underline underline-offset-4" onClick={onClose}>Approvals</Link>
              <Link href="/dashboard/AuditEvents" className="font-medium underline underline-offset-4" onClick={onClose}>Audit log</Link>
            </div>
          ) : null}
        </div>
        {error ? <p className="break-words border-t px-4 py-3 text-sm text-red-600 sm:px-6">{error}{mode === 'example' ? ' Saved records are reused when you retry.' : ''}</p> : null}
        <div className="flex shrink-0 gap-2 border-t p-4">
          {step === 'done' ? (
            <DialogClose asChild><Button className="flex-1">Close</Button></DialogClose>
          ) : (
            <>
              <DialogClose asChild><Button variant="ghost" disabled={step === 'running'} className="flex-1">Cancel</Button></DialogClose>
              {step === 'running' ? <Button disabled className="flex-1"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading</Button> : mode === 'own'
                ? <Button type="submit" form="own-shop" className="flex-1">{error ? 'Try again' : 'Create my shop'}</Button>
                : <Button variant="secondary" onClick={run} className="flex-1">{error ? 'Retry' : 'Load the example group'}</Button>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default OnboardingDialog
