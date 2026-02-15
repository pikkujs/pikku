import { pikkuChannelMiddleware, pikkuChannelMiddlewareFactory } from '#pikku'

export const channelTagMiddleware = pikkuChannelMiddlewareFactory(
  (name: string) =>
    async ({ logger }, event, next) => {
      logger.info({ type: 'channel-middleware', name, phase: 'before' })
      await next(event)
      logger.info({ type: 'channel-middleware', name, phase: 'after' })
    }
)

export const wireChannelMiddleware = pikkuChannelMiddleware(
  async ({ logger }, event, next) => {
    logger.info({
      type: 'channel-middleware',
      name: 'wire-cm',
      phase: 'before',
    })
    await next(event)
    logger.info({ type: 'channel-middleware', name: 'wire-cm', phase: 'after' })
  }
)
