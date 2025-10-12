import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const routeMiddleware = pikkuMiddleware(
  async ({ middlewareChecker }, _interaction, next) => {
    middlewareChecker.log({ type: 'http', name: 'route', phase: 'before' })
    const result = await next()
    middlewareChecker.log({ type: 'http', name: 'route', phase: 'after' })
    return result
  }
)
