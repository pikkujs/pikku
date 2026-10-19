import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

export const WriteAuditEventInput = z.object({
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  actorId: z.string().optional(),
})

// @snippet start writeAuditEvent
/**
 * A structured audit row, written off the request path.
 *
 * Separate from `audit: true` on a function, which captures *table writes*
 * automatically. This is for the events that are not writes — a login, an
 * export, a permission refused — which leave no row behind and are exactly the
 * ones an investigation asks about.
 */
export const writeAuditEvent = pikkuSessionlessFunc({
  description: 'Record a structured audit event.',
  input: WriteAuditEventInput,
  func: async ({ kysely, logger }, { entityType, entityId, action, actorId }) => {
    await kysely
      .insertInto('auditEvent')
      .values({
        auditId: randomUUID(),
        entityType,
        entityId,
        action,
        actorId: actorId ?? null,
      })
      .execute()

    logger.info({ event: 'audit_written', entityType, action })
  },
})
// @snippet end writeAuditEvent
