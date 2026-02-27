import {
  pikkuMiddlewareFactory,
  addMiddleware,
} from '../.pikku/pikku-types.gen.js'

/**
 * Addon package middleware that logs when addon functions are called
 */
export const addonMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'addon-function', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'addon-function', name, phase: 'after' })
      return result
    }
)

/**
 * Tag middleware for addon functions
 */
export const tagMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'addon-tag', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'addon-tag', name, phase: 'after' })
      return result
    }
)

/**
 * Register 'addon' tag middleware
 * This will apply to all functions with the 'addon' tag
 */
export const addonTagMiddleware = () =>
  addMiddleware('addon', [tagMiddleware('addon')])
