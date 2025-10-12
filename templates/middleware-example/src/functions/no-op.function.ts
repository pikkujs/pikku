import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { functionMiddleware } from '../middleware/function.js'

export const noOpFunction = pikkuSessionlessFunc({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'execute' })
    return { success: true }
  },
  middleware: [functionMiddleware],
})
