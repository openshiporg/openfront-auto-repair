import type { Actor } from '../lib/actor'
import { auditCreate } from '../lib/cas'
import type { UnitOfWork } from '../lib/unitOfWork'

/*
 * Wording the shop copies and one campaign to start from. Nothing here is sent: staff copy a template, or export a campaign's
 * list, and use their own phone or email. Each is added once.
 */

const TEMPLATES = [
  { code: 'ready_for_pickup', name: 'Car is ready', purpose: 'transactional', body: 'Hi {name}, your car is ready at Northgate Auto Care. We are open until 6 pm. Call us at (916) 555-0142 if you have questions.' },
  { code: 'estimate_waiting', name: 'Estimate waiting for approval', purpose: 'transactional', body: 'Hi {name}, we finished looking at your car and have an estimate for you. Call (916) 555-0142 and we will go over it, or reply here with questions.' },
  { code: 'declined_work_followup', name: 'Checking in on the work you put off', purpose: 'transactional', body: 'Hi {name}, this is Northgate Auto Care. When you were in, we found a few things that can wait. Want us to book a time to take care of them? Call (916) 555-0142.' },
  { code: 'oil_change_due', name: 'Oil change is due', purpose: 'marketing', body: 'Hi {name}, it has been a while since your last oil change at Northgate Auto Care. Book a time at (916) 555-0142. Reply STOP to stop these messages.' },
  { code: 'review_request', name: 'Ask for a review', purpose: 'marketing', body: 'Hi {name}, thank you for choosing Northgate Auto Care. If we took good care of you, a short review would mean a lot to our team. Reply STOP to stop these messages.' },
] as const

export async function seedCommunications(uow: UnitOfWork, actor: Actor) {
  const { tx } = uow
  let templates = 0
  for (const t of TEMPLATES) {
    if (await tx.messageTemplate.findUnique({ where: { code: t.code }, select: { id: true } })) continue
    const row = await tx.messageTemplate.create({ data: { code: t.code, name: t.name, purpose: t.purpose, body: t.body } })
    auditCreate(uow, actor, 'MessageTemplate', row.id, 'template.created', { code: t.code, seed: true }, { metadata: { seed: true } })
    templates += 1
  }
  let campaigns = 0
  const shop = await tx.shop.findUnique({ where: { id: 'seed_shop_nga' }, select: { id: true } })
  if (shop && !(await tx.campaign.count({ where: { shopId: shop.id, name: 'Oil change reminders' } }))) {
    const body = TEMPLATES.find(t => t.code === 'oil_change_due')!.body
    const row = await tx.campaign.create({ data: { shopId: shop.id, name: 'Oil change reminders', kind: 'reminders', messageText: body, status: 'active', audienceRule: {} } })
    auditCreate(uow, actor, 'Campaign', row.id, 'campaign.created', { kind: 'reminders', seed: true }, { metadata: { seed: true } })
    campaigns += 1
  }
  return { messageTemplates: templates, campaigns }
}
