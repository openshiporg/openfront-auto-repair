import { appendAuditEvents } from '../lib/audit'
import { TRANSACTION_OPTIONS } from '../lib/db'

/**
 * Audit trail for managed reference lists edited through the generated API (shops, bays, calendars,
 * memberships, settings). Governed lists don't need this: their commands audit inside the same
 * transaction. Keystone commits the item before afterOperation runs, so this append is a second
 * transaction; it carries the before/after snapshot and the session user.
 */
export function auditedHooks(entityType: string) {
  return {
    afterOperation: async ({ operation, item, originalItem, context }: any) => {
      const after = operation === 'delete' ? null : item
      const before = operation === 'create' ? null : originalItem
      const id = String((item ?? originalItem)?.id ?? '')
      if (!id) return
      const prisma = context.sudo().prisma
      await prisma.$transaction(
        (tx: any) => appendAuditEvents(tx, [{
          eventType: `${entityType}.${operation}d`.replace('deleted', 'deleted').replace('updated', 'updated'),
          entityType,
          entityId: id,
          actorUserId: context.session?.itemId ?? null,
          before,
          after,
          metadata: { via: 'admin_api' },
        }]),
        TRANSACTION_OPTIONS,
      )
    },
  }
}
