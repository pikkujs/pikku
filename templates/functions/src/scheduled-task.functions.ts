import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * @summary Periodic logging task
 * @description Scheduled task that runs every minute and logs the current timestamp to demonstrate scheduled execution
 */
export const myScheduledTask = pikkuSessionlessFunc<void, void>(
  async ({ logger }) => {
    logger.info(
      `This is a scheduled task that runs every minute, running now at ${new Date().getTime()}`
    )
  }
)
