import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from '../../.pikku/pikku-types.gen.js'

export const logRequest = pikkuMiddleware(
  async ({ logger }, _data, _userSession) => {
    logger.info('Request logged')
  }
)

export const trackAnalytics = pikkuMiddleware(
  async ({ analytics }, _data, _userSession) => {
    await analytics.track('request_received', {})
  }
)

export const rateLimiter = pikkuMiddlewareFactory(
  (limit: number) =>
    async ({ storage }, _data, _userSession) => {
      // Use storage to track rate limits
      await storage.save('rate_limit', limit)
    }
)
