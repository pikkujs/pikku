import { pikkuSessionlessFunc } from '#pikku/function'

export const usesEvents = pikkuSessionlessFunc<void, void>({
  auth: false,
  func: async ({ events, maybe, logger }) => {
    logger.info(`${events.audited}:${maybe?.n ?? 'none'}`)
  },
})
