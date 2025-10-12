import { pikkuMiddleware } from '../.pikku/pikku-types.gen.js'

export const functionMiddleware = pikkuMiddleware(
  async ({ middlewareChecker }, _interaction, next) => {
    middlewareChecker.log({
      type: 'function',
      name: 'function',
      phase: 'before',
    })
    const result = await next()
    middlewareChecker.log({
      type: 'function',
      name: 'function',
      phase: 'after',
    })
    return result
  }
)
