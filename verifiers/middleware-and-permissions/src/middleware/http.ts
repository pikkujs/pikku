import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const httpGlobalMiddleware = pikkuMiddleware(
  async ({ logger }, next) => {
    logger.info({ type: 'http', name: 'global', phase: 'before' })
    const result = await next()
    logger.info({ type: 'http', name: 'global', phase: 'after' })
    return result
  }
)

export const httpRouteMiddleware = pikkuMiddleware(async ({ logger }, next) => {
  logger.info({ type: 'route', name: '/api/*', phase: 'before' })
  const result = await next()
  logger.info({ type: 'route', name: '/api/*', phase: 'after' })
  return result
})

// Example using new object syntax with metadata
export const httpRouteMiddlewareWithMetadata = pikkuMiddleware({
  name: 'HTTP Route Middleware',
  description: 'Logs and processes requests for /api/* routes',
  func: async ({ logger }, next) => {
    logger.info({
      type: 'route-with-metadata',
      name: '/api/*',
      phase: 'before',
    })
    const result = await next()
    logger.info({ type: 'route-with-metadata', name: '/api/*', phase: 'after' })
    return result
  },
})
