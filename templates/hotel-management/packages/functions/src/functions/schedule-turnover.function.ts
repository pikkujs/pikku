import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

export const ScheduleTurnoverInput = z.object({
  roomId: z.string(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
})

/**
 * Queued rather than done inline at check-out.
 *
 * Check-out should not wait on housekeeping being told: the guest is standing
 * at the desk. Sessionless because the queue worker runs it, and a worker has
 * no user — which is also why it carries no scopes, since an anonymous caller
 * holds none and would satisfy none.
 */
// @snippet start queueWorkerFunction
export const scheduleTurnover = pikkuSessionlessFunc({
  // Exposed so the operations screen can raise one on demand. Otherwise this
  // runs only when something else queues it, and nobody can force it when it
  // matters or prove it still works.
  expose: true,
  description: 'Raise a turnover task for a room and mark it dirty.',
  input: ScheduleTurnoverInput,
  func: async ({ kysely, logger }, { roomId, priority }) => {
    await kysely
      .insertInto('housekeepingTask')
      .values({
        taskId: randomUUID(),
        roomId,
        kind: 'turnover',
        status: 'open',
        notes: priority === 'urgent' ? 'Arrival waiting' : null,
      })
      .execute()

    await kysely
      .updateTable('room')
      .set({ housekeepingStatus: 'dirty' })
      .where('roomId', '=', roomId)
      .execute()

    logger.info({ event: 'turnover_scheduled', roomId, priority })
  },
})
// @snippet end queueWorkerFunction
