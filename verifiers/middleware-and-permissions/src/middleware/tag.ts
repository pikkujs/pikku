import { pikkuMiddlewareFactory } from '../../.pikku/pikku-types.gen.js'

export const tagMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'tag', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'tag', name, phase: 'after' })
      return result
    }
)
