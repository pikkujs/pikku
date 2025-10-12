import { addMiddleware, pikkuVoidFunc } from '../../.pikku/pikku-types.gen.js'
import { functionMiddleware } from '../middleware/function.js'

// Tag middleware
export const functionTagMiddleware = () =>
  addMiddleware('function', [functionMiddleware])

export const noOpFunction = pikkuVoidFunc({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'execute' })
  },
  middleware: [functionMiddleware],
  tags: ['function'],
  auth: false, // No authentication required for this example
})
