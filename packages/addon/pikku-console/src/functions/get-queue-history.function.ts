import type { QueueInspection } from '@pikku/core/queue'
import { pikkuFunc } from '#pikku/addon/function'

/**
 * Live counts and recent jobs per queue worker, keyed by queue name.
 *
 * Empty when the app wires no queue service, or one that cannot inspect its
 * backlog (`inspect` is optional on `QueueService`). The in-memory queue
 * `pikku dev` runs keeps its job records in process, so on the local copy the
 * history resets with the server.
 */
export const getQueueHistory = pikkuFunc<
  { limit?: number },
  Record<string, QueueInspection>
>({
  title: 'Get Queue History',
  description:
    'Returns each queue worker with its live job counts (waiting, active, delayed, completed, failed) and recent jobs, newest first. Empty when the queue service cannot be inspected.',
  expose: true,
  scopes: ['pikku:console:wirings:read'],
  func: async ({ queueService, metaService }, input) => {
    if (!queueService?.inspect) {
      return {}
    }
    const queueNames = Object.keys(await metaService.getQueueMeta())
    const history: Record<string, QueueInspection> = {}
    for (const queueName of queueNames) {
      history[queueName] = await queueService.inspect(queueName, {
        limit: input?.limit,
      })
    }
    return history
  },
})
