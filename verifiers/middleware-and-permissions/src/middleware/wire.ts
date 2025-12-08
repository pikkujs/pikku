import { pikkuMiddlewareFactory } from '#pikku'

export const wireMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'wire', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'wire', name, phase: 'after' })
      return result
    }
)
