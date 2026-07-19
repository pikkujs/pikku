import { wireScheduler, addTagMiddleware } from '#pikku'
import { tagMiddleware } from '../middleware/tag.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for scheduler
export const schedulerTagMiddleware = () =>
  addTagMiddleware('scheduler', [tagMiddleware('scheduler')])

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireScheduler({
  name: 'testScheduledTask',
  schedule: '*/1 * * * *', // Every minute
  tags: ['session', 'scheduler'],
  middleware: [wireMiddleware('scheduler')],
  func: noOpFunction,
})
