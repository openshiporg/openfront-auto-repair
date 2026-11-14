'use server'

import { contactHash, normalizeContact } from '@/features/keystone/lib/customers'
import { storefrontDb } from '../lib/data'
import { phone as showPhone } from '../lib/format'
import { caller, limited } from '../lib/guard'

/*
 * "Check my repair": the repair order number from the work order plus a phone number on the
 * customer's file. Both must match, and a wrong pair gets the same answer as an unknown number.
 * It shows where the repair stands and the estimate. It does not approve anything: approving is
 * signed on the link the shop sends to the customer's own phone or email.
 */

export type RepairView = {
  roNumber: string
  vehicle: string
  status: string
  shopName: string
  shopPhone: string
  inspection: { red: number; yellow: number; green: number } | null
  estimate: { reference: string; totalMinor: string; jobs: { number: number; title: string; totalMinor: string; status: string }[] } | null
  /** Where the approval link was sent, masked ("•••-•••-0142"), when an answer is still wanted. */
  approvalSentTo: string | null
  balanceMinor: string | null
}

export type LookupState = { ok: boolean; message: string; repair?: RepairView }

const MISS = 'We could not find a repair with that number and phone. Check the work order, or call the shop.'

export async function checkRepair(_previous: LookupState, form: FormData): Promise<LookupState> {
  const { ip } = await caller()
  if (limited('check-repair', ip, 8)) return { ok: false, message: 'Too many tries. Wait a minute and try again.' }
  const roNumber = String(form.get('roNumber') ?? '').trim().toUpperCase().slice(0, 40)
  if (!roNumber) return { ok: false, message: 'Enter the repair order number from your work order.' }
  let hash = ''
  try {
    hash = contactHash('mobile', normalizeContact('mobile', form.get('phone')))
  } catch {
    return { ok: false, message: 'Enter the phone number the shop has for you: 10 digits.' }
  }

  const db = storefrontDb()
  // The number as printed, with or without the leading "RO-".
  const ro = await db.repairOrder.findFirst({
    where: { status: { not: 'draft' }, OR: [{ roNumber }, { roNumber: roNumber.startsWith('RO-') ? roNumber : `RO-${roNumber}` }] },
    select: {
      id: true, roNumber: true, status: true, customerId: true,
      shop: { select: { name: true, phone: true } }, vehicle: { select: { year: true, make: true, model: true } },
    },
  })
  if (!ro?.customerId) return { ok: false, message: MISS }
  const contact = await db.customerContact.findFirst({ where: { customerId: ro.customerId, valueHash: hash, status: 'active' }, select: { id: true } })
  if (!contact) return { ok: false, message: MISS }

  const inspection = await db.inspection.findFirst({
    where: { repairOrderId: ro.id, completedAt: { not: null } }, orderBy: { completedAt: 'desc' }, select: { results: { select: { condition: true } } },
  })
  const count = (c: string) => inspection?.results.filter(r => r.condition === c).length ?? 0

  const estimate = await db.estimateVersion.findFirst({ where: { repairOrderId: ro.id, status: 'sent' }, orderBy: { versionNumber: 'desc' }, select: { id: true, reference: true, totalMinor: true, includedJobIds: true } })
  const jobIds = Array.isArray(estimate?.includedJobIds) ? (estimate!.includedJobIds as string[]) : []
  const jobs = jobIds.length ? await db.job.findMany({ where: { id: { in: jobIds }, repairOrderId: ro.id }, orderBy: { number: 'asc' }, select: { number: true, title: true, totalMinor: true, status: true } }) : []
  const waiting = estimate ? await db.authorizationRequest.findFirst({ where: { estimateVersionId: estimate.id, status: { in: ['created', 'delivered', 'viewed'] }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, select: { contactLabel: true } }) : null
  const invoices = await db.invoice.findMany({ where: { repairOrderId: ro.id, status: { notIn: ['draft', 'void', 'voided'] } }, select: { balanceMinor: true } })
  const balance = invoices.reduce((n, i) => n + i.balanceMinor, 0n)

  return {
    ok: true, message: '',
    repair: {
      roNumber: ro.roNumber, vehicle: [ro.vehicle?.year, ro.vehicle?.make, ro.vehicle?.model].filter(Boolean).join(' '), status: ro.status,
      shopName: ro.shop?.name ?? '', shopPhone: showPhone(ro.shop?.phone),
      inspection: inspection ? { red: count('red'), yellow: count('yellow'), green: count('green') } : null,
      estimate: estimate ? { reference: estimate.reference, totalMinor: estimate.totalMinor.toString(), jobs: jobs.map(j => ({ number: j.number, title: j.title, totalMinor: j.totalMinor.toString(), status: j.status })) } : null,
      approvalSentTo: waiting ? waiting.contactLabel || 'your phone' : null,
      balanceMinor: invoices.length && balance > 0n ? balance.toString() : null,
    },
  }
}
