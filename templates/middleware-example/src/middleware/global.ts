import { pikkuMiddleware } from '../.pikku/pikku-types.gen.js'

export const globalMiddleware = pikkuMiddleware(
  async ({ middlewareChecker }, _interaction, next) => {
    middlewareChecker.log({ type: 'global', name: 'global', phase: 'before' })
    const result = await next()
    middlewareChecker.log({ type: 'global', name: 'global', phase: 'after' })
    return result
  }
)
