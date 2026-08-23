import { wireQueueWorker } from '#pikku/queue/pikku-queue-types.gen.js'
import { pikkuFunc, pikkuSessionlessFunc } from '#pikku/function'
import { sendOrderConfirmation } from '../functions/notifications/send-order-confirmation.function.js'
import { writeAuditEvent } from '../functions/notifications/write-audit-event.function.js'
import { randomUUID } from 'node:crypto'

// @snippet start queueWirings
// @snippet start wireQueue
wireQueueWorker({
  name: 'send-order-confirmation',
  func: sendOrderConfirmation,
})

wireQueueWorker({
  name: 'audit-event',
  func: writeAuditEvent,
})
// @snippet end wireQueue
// @snippet end queueWirings

// @snippet start queueConfig
// Configure concurrency, retries, and job retention per worker.
wireQueueWorker({
  name: 'send-order-confirmation',
  func: sendOrderConfirmation,
  config: {
    // Process 5 emails in parallel
    batchSize: 5,
    // Keep last 100 completed jobs for debugging
    removeOnComplete: 100,
  },
})
// @snippet end queueConfig

// @snippet start queueJobControl
// The wire object every queue worker is handed: discard the job, or report
// progress back to whoever is watching it.
export const processExport = pikkuSessionlessFunc({
  func: async (
    { kysely, logger },
    { exportId }: { exportId: string },
    { queue }
  ) => {
    const rows = await kysely.selectFrom('order').selectAll().execute()

    if (rows.length === 0) {
      // No work — remove from the queue, no retry
      queue?.discard('No orders to export')
      return
    }

    for (let i = 0; i < rows.length; i++) {
      // Report 0-100 progress
      await queue?.updateProgress(Math.round((i / rows.length) * 100))
    }

    logger.info({ exportId, count: rows.length })
  },
})
// @snippet end queueJobControl

wireQueueWorker({
  name: 'process-export',
  func: processExport,
})

/**
 * The export queue's missing producer.
 *
 * `processExport` is a fully written worker — it pages through orders, reports
 * progress and discards itself when there is nothing to do — wired to a queue
 * that nothing ever pushed to. A worker with no producer is a job that has
 * never run.
 */
export const startExport = pikkuFunc({
  expose: true,
  description: 'Queue an export of every order.',
  func: async ({ queueService }, _data: null, { session }) => {
    const exportId = randomUUID()
    await queueService?.add('process-export', { exportId })
    return { exportId, requestedBy: session.userId }
  },
})
