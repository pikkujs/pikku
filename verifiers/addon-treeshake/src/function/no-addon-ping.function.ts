import { pikkuSessionlessFunc } from '#pikku'

/**
 * Touches nothing addon-related — the unit keeping only this must not
 * import the addon at all.
 */
export const noAddonPing = pikkuSessionlessFunc<void, { pong: boolean }>({
  func: async ({ logger }) => {
    logger.debug('ping')
    return { pong: true }
  },
})
