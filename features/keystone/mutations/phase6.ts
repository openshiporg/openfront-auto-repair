import { actorFromSession, requireHuman, requirePermission, type Actor } from '../lib/actor'
import { command } from '../lib/command'
import {
  addExemptionCertificate, addFleetApprover, addFleetContact, createFleetLink, exportAllStatements, exportStatement, generateStatement, placeCreditHold, refreshAllStandings, refreshStanding,
  releaseCreditHold, removeFleetApprover, revokeExemptionCertificate, saveFleetUnit, updateAccountTerms, type TermsInput,
} from '../lib/fleet'

type Ctx = { session: any; prisma: any }

const run = async <T>(context: Ctx, actor: Actor, name: string, idempotencyKey: string, params: unknown, work: Parameters<typeof command<T>>[2]): Promise<{ replay: boolean } & T> => {
  const result = await command<T>(context.prisma, { name, actor, idempotencyKey, params }, work)
  return { replay: result.replay, ...(result.value as T & object) }
}

const MANAGE = ['canManageCustomers'] as const
const MONEY = ['canReadFinancials', 'canFinalizeInvoices'] as const

export async function saveAccountTerms(_root: unknown, args: { input: TermsInput; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'change an account')
  return run(context, actor, 'account.terms', args.idempotencyKey, args.input, uow => updateAccountTerms(uow, actor, args.input ?? ({} as TermsInput)))
}

export async function refreshAccountStanding(_root: unknown, args: { businessAccountId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE, ...MONEY)
  requireHuman(actor, 'recheck credit')
  return run<Record<string, unknown>>(context, actor, 'account.standing', args.idempotencyKey, args, uow => (args.businessAccountId ? refreshStanding(uow, actor, args.businessAccountId).then(s => ({ status: s.status, changed: s.changed })) : refreshAllStandings(uow, actor)))
}

export async function holdAccountCredit(_root: unknown, args: { businessAccountId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canApproveCredit')
  requireHuman(actor, 'hold an account')
  return run(context, actor, 'account.credit_hold', args.idempotencyKey, args, uow => placeCreditHold(uow, actor, args))
}

export async function releaseAccountHold(_root: unknown, args: { businessAccountId: string; reason: string; approvalRequestId?: string | null; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, 'canApproveCredit')
  requireHuman(actor, 'release a credit hold')
  return run(context, actor, 'account.credit_release', args.idempotencyKey, args, uow => releaseCreditHold(uow, actor, args))
}

export async function addAccountContact(_root: unknown, args: { input: Parameters<typeof addFleetContact>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'add a contact')
  return run(context, actor, 'account.contact', args.idempotencyKey, args.input, uow => addFleetContact(uow, actor, args.input))
}

export async function addAccountApprover(_root: unknown, args: { input: Parameters<typeof addFleetApprover>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'add an approver')
  return run(context, actor, 'account.approver', args.idempotencyKey, args.input, uow => addFleetApprover(uow, actor, args.input))
}

export async function removeAccountApprover(_root: unknown, args: { approverId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'remove an approver')
  return run(context, actor, 'account.approver_remove', args.idempotencyKey, args, uow => removeFleetApprover(uow, actor, args))
}

export async function addAccountCertificate(_root: unknown, args: { input: Parameters<typeof addExemptionCertificate>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'record a tax certificate')
  return run(context, actor, 'account.certificate', args.idempotencyKey, args.input, uow => addExemptionCertificate(uow, actor, args.input))
}

export async function revokeAccountCertificate(_root: unknown, args: { certificateId: string; reason: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'revoke a tax certificate')
  return run(context, actor, 'account.certificate_revoke', args.idempotencyKey, args, uow => revokeExemptionCertificate(uow, actor, args))
}

export async function saveAccountUnit(_root: unknown, args: { input: Parameters<typeof saveFleetUnit>[2]; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'save a unit')
  return run(context, actor, 'account.unit', args.idempotencyKey, args.input, uow => saveFleetUnit(uow, actor, args.input))
}

export async function createAccountLink(_root: unknown, args: { contactId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MANAGE)
  requireHuman(actor, 'make an account link')
  return run(context, actor, 'account.link', args.idempotencyKey, args, uow => createFleetLink(uow, actor, args))
}

export async function makeAccountStatement(_root: unknown, args: { businessAccountId: string; periodStart: string; periodEnd: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MONEY)
  requireHuman(actor, 'make a statement')
  return run(context, actor, 'statement.generate', args.idempotencyKey, args, uow => generateStatement(uow, actor, args))
}

export async function exportAccountStatement(_root: unknown, args: { statementId: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MONEY)
  requireHuman(actor, 'export a statement')
  return run(context, actor, 'statement.export', args.idempotencyKey, args, uow => exportStatement(uow, actor, args))
}

export async function exportAllAccountStatements(_root: unknown, args: { periodStart: string; periodEnd: string; idempotencyKey: string }, context: Ctx) {
  const actor = actorFromSession(context.session)
  requirePermission(actor, ...MONEY)
  requireHuman(actor, 'export statements')
  return run(context, actor, 'statement.export_all', args.idempotencyKey, args, uow => exportAllStatements(uow, actor, args))
}
