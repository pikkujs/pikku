import {
  addTagMiddleware,
  pikkuMiddlewareFactory,
} from '#pikku/addon/middleware'

/**
 * Addon package middleware that logs when addon functions are called
 */
// @snippet start pikku-middleware-factory
export const addonMiddleware = pikkuMiddlewareFactory(
  (name: string) =>
    async ({ logger }, _data, next) => {
      logger.info({ type: 'addon-function', name, phase: 'before' })
      const result = await next()
      logger.info({ type: 'addon-function', name, phase: 'after' })
      return result
    }
)
// @snippet end pikku-middleware-factory

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
// @snippet start add-tag-middleware
export const addonTagMiddleware = () =>
  addTagMiddleware('addon', [tagMiddleware('addon')])
// @snippet end add-tag-middleware
