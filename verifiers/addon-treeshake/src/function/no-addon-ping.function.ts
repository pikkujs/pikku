import { pikkuSessionlessFunc } from '#pikku'

export const noAddonPing = pikkuSessionlessFunc<void, { pong: boolean }>({
  func: async ({ logger }) => {
    logger.debug('ping')
    return { pong: true }
  },
})
