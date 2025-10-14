import { addMiddleware, pikkuVoidFunc } from '../../.pikku/pikku-types.gen.js'
import { functionMiddleware } from '../middleware/function.js'
import { tagMiddleware } from '../middleware/tag.js'

// Tag middleware
export const functionTagMiddleware = () =>
  addMiddleware('function', [tagMiddleware('function')])

export const noOpFunction = pikkuVoidFunc({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'execute' })
  },
  middleware: [functionMiddleware('noOp')],
  tags: ['function'],
  auth: false, // No authentication required for this example
})
