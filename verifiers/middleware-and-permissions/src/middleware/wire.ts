import { pikkuMiddlewareFactory } from '../../.pikku/pikku-types.gen.js'

export const wireMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, next) => {
      logger.info({ type: 'wire', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'wire', name, phase: 'after' })
      return result
    }
)
