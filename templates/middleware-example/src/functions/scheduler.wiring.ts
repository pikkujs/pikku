import { wireScheduler, addMiddleware } from '../../.pikku/pikku-types.gen.js'
import { tagMiddleware } from '../middleware/tag.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for scheduler
export const schedulerTagMiddleware = () =>
  addMiddleware('scheduler', [tagMiddleware('scheduler')])

wireScheduler({
  name: 'testScheduledTask',
  schedule: '*/1 * * * *', // Every minute
  tags: ['scheduler'],
  middleware: [wireMiddleware('scheduler')],
  func: noOpFunction,
})
