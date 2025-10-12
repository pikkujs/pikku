import { pikkuMiddleware } from '../.pikku/pikku-types.gen.js'

export const wireMiddleware = pikkuMiddleware(
  async ({ middlewareChecker }, _interaction, next) => {
    middlewareChecker.log({ type: 'wire', name: 'wire', phase: 'before' })
    const result = await next()
    middlewareChecker.log({ type: 'wire', name: 'wire', phase: 'after' })
    return result
  }
)
