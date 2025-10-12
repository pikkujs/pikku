import { pikkuMiddleware } from '../../.pikku/pikku-types.gen.js'

export const functionMiddleware = pikkuMiddleware(
  async ({ logger }, _interaction, next) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'before' })
    const result = await next()
    logger.info({ type: 'function', name: 'noOp', phase: 'after' })
    return result
  }
)
