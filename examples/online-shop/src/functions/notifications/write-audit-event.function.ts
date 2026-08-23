import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { pikkuSessionlessFunc } from '#pikku/function'

export const AuditEventInput = z.object({
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  actorId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

// @snippet start writeAuditEvent
export const writeAuditEvent = pikkuSessionlessFunc({
  expose: false,
  description: 'Queue consumer: persist an audit log entry.',
  input: AuditEventInput,
  func: async (
    { kysely },
    { entityType, entityId, action, actorId, payload }
  ) => {
    await kysely
      .insertInto('auditLog')
      .values({
        auditId: randomUUID(),
        entityType,
        entityId,
        action,
        actorId: actorId ?? null,
        payload: payload ? JSON.stringify(payload) : null,
        createdAt: new Date().toISOString(),
      })
      .execute()
  },
})
// @snippet end writeAuditEvent
