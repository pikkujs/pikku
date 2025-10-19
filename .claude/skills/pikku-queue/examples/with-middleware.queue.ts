import { wireQueueWorker, pikkuMiddleware } from './pikku-types.gen.js'
import { sendEmail } from './functions/email-worker.function.js'

/**
 * Lightweight audit middleware for queue workers
 * Use middleware ONLY for lightweight concerns (audit/tracing)
 * Don't reimplement retries/metrics - the queue adapter already provides these
 */
const withJobAudit = pikkuMiddleware(async ({ logger }, interaction, next) => {
  const t0 = Date.now()
  try {
    await next()

    // ✅ CORRECT: Guard for queue interaction
    if (interaction.queue) {
      logger?.info?.('queue.audit', {
        queueName: interaction.queue.queueName,
        jobId: interaction.queue.jobId,
        ms: Date.now() - t0,
      })
    }
  } catch (e) {
    // ✅ CORRECT: Guard for queue interaction
    if (interaction.queue) {
      logger?.warn?.('queue.audit.fail', {
        queueName: interaction.queue.queueName,
        jobId: interaction.queue.jobId,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    throw e
  }
})

/**
 * Queue worker with middleware
 */
wireQueueWorker({
  queue: 'email',
  func: sendEmail,
  middleware: [withJobAudit],
})
