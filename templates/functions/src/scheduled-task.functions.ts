import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Scheduled task that runs every minute
 *
 * @summary Example of a cron-like scheduled task in Pikku
 * @description This function demonstrates how to create a scheduled task that runs at regular
 * intervals. It logs the current timestamp each time it executes. Scheduled tasks are useful
 * for periodic maintenance, data cleanup, report generation, and other time-based operations.
 */
export const myScheduledTask = pikkuSessionlessFunc<void, void>(
  async ({ logger }) => {
    logger.info(
      `This is a scheduled task that runs every minute, running now at ${new Date().getTime()}`
    )
  }
)
