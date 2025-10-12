import {
  wireScheduler,
  addMiddleware,
  pikkuVoidFunc,
} from '../../.pikku/pikku-types.gen.js'
import { globalMiddleware } from '../middleware/global.js'
import { wireMiddleware } from '../middleware/wire.js'
import { functionMiddleware } from '../middleware/function.js'

// Tag middleware for scheduler
export const schedulerTagMiddleware = () =>
  addMiddleware('scheduler', [globalMiddleware])

const schedulerNoOpFunction = pikkuVoidFunc({
  func: async ({ logger }) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'execute' })
  },
  middleware: [functionMiddleware],
})

wireScheduler({
  name: 'testScheduledTask',
  schedule: '*/1 * * * *', // Every minute
  tags: ['scheduler'],
  middleware: [wireMiddleware],
  func: schedulerNoOpFunction,
})
