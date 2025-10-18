import { pikkuMiddleware } from '../../../functions/.pikku/pikku-types.gen.js'

export const httpGlobalMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'http', name: 'global', phase: 'before' })
    const result = await next()
    logger.info({ type: 'http', name: 'global', phase: 'after' })
    return result
  }
)

export const httpRouteMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'route', name: '/api/*', phase: 'before' })
    const result = await next()
    logger.info({ type: 'route', name: '/api/*', phase: 'after' })
    return result
  }
)
