import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const wireMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'wire', name: 'wire', phase: 'before' })
    const result = await next()
    logger.info({ type: 'wire', name: 'wire', phase: 'after' })
    return result
  }
)
