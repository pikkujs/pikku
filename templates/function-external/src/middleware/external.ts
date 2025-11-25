import {
  pikkuMiddlewareFactory,
  addMiddleware,
} from '../../.pikku/pikku-types.gen.js'

/**
 * External package middleware that logs when external functions are called
 */
export const externalMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'external-function', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'external-function', name, phase: 'after' })
      return result
    }
)

/**
 * Tag middleware for external functions
 */
export const tagMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'external-tag', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'external-tag', name, phase: 'after' })
      return result
    }
)

/**
 * Register 'external' tag middleware
 * This will apply to all functions with the 'external' tag
 */
export const externalTagMiddleware = () =>
  addMiddleware('external', [tagMiddleware('external')])
