import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const routeMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'route', name: '/api/*', phase: 'before' })
    const result = await next()
    logger.info({ type: 'route', name: '/api/*', phase: 'after' })
    return result
  }
)
