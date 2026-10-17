import { pikkuServerLifecycle } from '#pikku/setup'

// @snippet start serverLifecycle
export const shopLifecycle = pikkuServerLifecycle({
  afterStart: ({ logger }) => {
    logger.info('online shop is accepting requests')
  },
  beforeStop: ({ logger }) => {
    logger.info('online shop is draining before services stop')
  },
})
// @snippet end serverLifecycle
