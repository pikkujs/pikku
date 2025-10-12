import { pikkuMiddleware } from '../.pikku/pikku-types.gen.js'

export const httpMiddleware = pikkuMiddleware(
  async ({ middlewareChecker }, _interaction, next) => {
    middlewareChecker.log({ type: 'http', name: 'http', phase: 'before' })
    const result = await next()
    middlewareChecker.log({ type: 'http', name: 'http', phase: 'after' })
    return result
  }
)
