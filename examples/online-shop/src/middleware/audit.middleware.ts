import { addTagMiddleware, pikkuMiddlewareFactory } from '#pikku/middleware'

// @snippet start middlewareFactory
export const auditMiddleware = pikkuMiddlewareFactory(
  (action: string) =>
    async ({ logger }, _data, next) => {
      const start = Date.now()
      const result = await next()
      logger.info({ event: 'audit', action, ms: Date.now() - start })
      return result
    }
)
// @snippet end middlewareFactory

// @snippet start tagMiddleware
addTagMiddleware('checkout', [auditMiddleware('checkout')])
// @snippet end tagMiddleware
