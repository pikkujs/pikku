import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const globalMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'tag', name: 'api', phase: 'before' })
    const result = await next()
    logger.info({ type: 'tag', name: 'api', phase: 'after' })
    return result
  }
)
