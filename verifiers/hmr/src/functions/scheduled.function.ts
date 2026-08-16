import { pikkuSessionlessFunc } from '#pikku/function'

export const myScheduledTask = pikkuSessionlessFunc<void, void>({
  auth: false,
  func: async ({ logger }) => {
    logger.info(`Scheduled task ran at ${Date.now()}`)
  },
})
