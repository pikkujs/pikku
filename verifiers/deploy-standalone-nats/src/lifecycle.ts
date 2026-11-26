import { pikkuServerLifecycle } from '#pikku/setup'

export const serverLifecycle = pikkuServerLifecycle({
  async beforeStart({ natsLifecycle, logger }) {
    await natsLifecycle!.registerQueues(logger)
  },
})
