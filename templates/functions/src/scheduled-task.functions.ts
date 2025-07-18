import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const myScheduledTask = pikkuSessionlessFunc<void, void>(
  async ({ logger }) => {
    logger.info(
      `This is a scheduled task that runs every minute, running now at ${new Date().getTime()}`
    )
  }
)
