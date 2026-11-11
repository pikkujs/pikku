import type { QueueInspection } from '@pikku/core/queue'
import { pikkuState } from '@pikku/core/state'
import { pikkuFunc } from '#pikku/addon/function'

/**
 * Live counts and recent jobs per queue, keyed by queue name.
 *
 * Every queue worker this app wires unless `queueNames` narrows it. Empty when
 * the app wires no queue service, or one that cannot inspect its backlog
 * (`inspect` is optional on `QueueService`). The in-memory queue `pikku dev`
 * runs keeps its job records in process, so locally the history resets with
 * the server.
 */
export const getQueueHistory = pikkuFunc<
  { queueNames?: string[]; limit?: number },
  Record<string, QueueInspection>
>({
  title: 'Get Queue History',
  description:
    'Returns each queue with its live job counts (waiting, active, delayed, completed, failed) and recent jobs, newest first. Empty when the queue service cannot be inspected.',
  expose: true,
  scopes: ['admin:queues:read'],
  func: async ({ queueService }, input) => {
    if (!queueService?.inspect) {
      return {}
    }
    const queueNames =
      input?.queueNames ?? Object.keys(pikkuState(null, 'queue', 'meta'))
    const history: Record<string, QueueInspection> = {}
    for (const queueName of queueNames) {
      history[queueName] = await queueService.inspect(queueName, {
        limit: input?.limit,
      })
    }
    return history
  },
})
