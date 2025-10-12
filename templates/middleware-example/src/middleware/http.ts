import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const httpMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'http', name: 'global', phase: 'before' })
    const result = await next()
    logger.info({ type: 'http', name: 'global', phase: 'after' })
    return result
  }
)
