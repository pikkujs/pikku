import {
  pikkuMiddleware,
  pikkuMiddlewareFactory,
} from '../../.pikku/pikku-types.gen.js'

export const logRequest = pikkuMiddleware(async ({ logger }) => {
  logger.info('Request logged')
})

export const trackAnalytics = pikkuMiddleware(async ({ analytics }) => {
  await analytics.track('request_received', {})
})

export const rateLimiter = pikkuMiddlewareFactory(
  (limit: number) =>
    async ({ storage }) => {
      // Use storage to track rate limits
      await storage.save('rate_limit', limit)
    }
)
