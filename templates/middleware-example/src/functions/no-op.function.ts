import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { functionMiddleware } from '../middleware/function.js'

export const noOpFunction = pikkuSessionlessFunc({
  func: async ({ middlewareChecker }) => {
    middlewareChecker.log({ type: 'function', name: 'noOp', phase: 'execute' })
    return { success: true }
  },
  middleware: [functionMiddleware],
})
