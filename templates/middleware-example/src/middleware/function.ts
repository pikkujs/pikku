import { pikkuMiddlewareFactory } from '../../../functions/.pikku/pikku-types.gen.js'

export const functionMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _interaction, next) => {
      logger.info({ type: 'function', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'function', name, phase: 'after' })
      return result
    }
)
