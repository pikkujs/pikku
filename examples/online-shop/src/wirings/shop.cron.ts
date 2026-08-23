import { wireScheduler } from '#pikku/scheduler'
import { pikkuVoidFunc } from '#pikku/function'
import { pikkuMiddleware } from '#pikku/middleware'
import { dailySalesReport } from '../functions/reports/daily-sales-report.function.js'
import { cleanupAbandonedBaskets } from '../functions/reports/cleanup-abandoned-baskets.function.js'

// @snippet start cronMiddleware
// Middleware wraps every run of the tasks it is wired to — here, to record how
// long each run took.
const timingMiddleware = pikkuMiddleware(async ({ logger }, _data, next) => {
  const start = Date.now()
  await next()
  logger.info({ event: 'scheduler_timing', ms: Date.now() - start })
})

// @snippet start cronWirings
// @snippet start wireScheduler
wireScheduler({
  name: 'dailySalesReport',
  schedule: '0 6 * * *', // 06:00 UTC every day
  func: dailySalesReport,
  middleware: [timingMiddleware],
})
// @snippet end cronMiddleware

wireScheduler({
  name: 'cleanupAbandonedBaskets',
  schedule: '0 3 * * *', // 03:00 UTC every day
  func: cleanupAbandonedBaskets,
})
// @snippet end wireScheduler
// @snippet end cronWirings

// @snippet start cronSkip
// A scheduled task can skip its own execution by calling wire.scheduledTask.skip().
export const conditionalReport = pikkuVoidFunc({
  // Exposed so an operator can run it on demand. A scheduled task that skips
  // itself under some condition is exactly the one you want to be able to
  // trigger by hand, to find out whether it skipped for the right reason.
  expose: true,
  func: async ({ kysely, logger }, _, { scheduledTask }) => {
    const count = await kysely
      .selectFrom('order')
      .where('status', '=', 'pending')
      .select(kysely.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()

    if (count.n === 0) {
      scheduledTask?.skip('No pending orders — nothing to report')
      return
    }

    logger.info({ event: 'report_run', pendingOrders: count.n })
  },
})

wireScheduler({
  name: 'conditionalReport',
  schedule: '0 7 * * *',
  func: conditionalReport,
})
// @snippet end cronSkip
