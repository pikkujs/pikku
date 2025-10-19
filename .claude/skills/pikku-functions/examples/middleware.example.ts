import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from '#pikku/pikku-types.gen.js'

/**
 * Basic middleware using pikkuMiddleware
 * Wraps function execution with logging
 */
export const auditLog = pikkuMiddleware(
  async ({ userSession, logger }, interaction, next) => {
    const t0 = Date.now()
    try {
      await next()
    } finally {
      const userId = await userSession.get('userId').catch(() => undefined)
      logger?.info?.('audit', {
        route: interaction.route,
        userId,
        ms: Date.now() - t0,
      })
    }
  }
)

/**
 * Middleware factory - creates parameterized middleware
 * This is useful when you want to create similar middleware with different configs
 */
export const rateLimit = pikkuMiddlewareFactory(
  (config: { maxRequests: number; windowMs: number }) =>
    async ({ logger }, interaction, next) => {
      logger.info('Rate limit check', {
        route: interaction.route,
        max: config.maxRequests,
        window: config.windowMs,
      })

      // Rate limiting logic here
      // For this example, we'll just pass through
      await next()
    }
)
