import { pikkuMiddlewareFactory } from '#pikku'

export const functionMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'function', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'function', name, phase: 'after' })
      return result
    }
)
