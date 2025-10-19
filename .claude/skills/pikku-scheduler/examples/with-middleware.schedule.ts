import {
  wireScheduler,
  addSchedulerMiddleware,
  pikkuMiddleware,
} from './pikku-types.gen.js'
import { runMaintenance } from './functions/maintenance.function.js'
import { InvalidMiddlewareInteractionError } from '@pikku/core/errors'

/**
 * Scheduler metrics middleware
 * IMPORTANT: Guard for interaction.scheduledTask
 */
const withSchedulerMetrics = pikkuMiddleware(
  async ({ logger }, interaction, next) => {
    // ✅ CRITICAL: Verify this is a scheduler interaction
    if (!interaction.scheduledTask) {
      throw new InvalidMiddlewareInteractionError(
        'withSchedulerMetrics middleware can only be used with scheduler interactions'
      )
    }

    const start = Date.now()
    try {
      await next()

      logger.info('scheduler.run', {
        task: interaction.scheduledTask,
        ms: Date.now() - start,
        ok: true,
      })
    } catch (err) {
      logger.error('scheduler.error', {
        task: interaction.scheduledTask,
        ms: Date.now() - start,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }
)

/**
 * Retry middleware with logging
 * Scheduler-specific
 */
const withRetry = pikkuMiddleware(async ({ logger }, interaction, next) => {
  // ✅ CRITICAL: Verify this is a scheduler interaction
  if (!interaction.scheduledTask) {
    throw new InvalidMiddlewareInteractionError(
      'withRetry middleware can only be used with scheduler interactions'
    )
  }

  let attempts = 0
  for (;;) {
    try {
      return await next()
    } catch (e) {
      if (++attempts >= 3) {
        logger.error('scheduler.retry.exhausted', {
          attempts,
          error: e instanceof Error ? e.message : String(e),
        })
        throw e
      }

      logger.warn('scheduler.retry', {
        attempt: attempts,
        maxAttempts: 3,
        delayMs: 500 * attempts,
      })

      await new Promise((r) => setTimeout(r, 500 * attempts))
    }
  }
})

/**
 * Global middleware for all schedules
 */
addSchedulerMiddleware([withSchedulerMetrics, withRetry])

/**
 * Schedule with per-schedule middleware (stacks with global)
 */
wireScheduler({
  cron: '0 3 * * *',
  func: runMaintenance,
  middleware: [withSchedulerMetrics], // Additional per-schedule middleware
})
