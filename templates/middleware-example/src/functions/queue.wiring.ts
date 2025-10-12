import { wireQueueWorker, addMiddleware } from '../../.pikku/pikku-types.gen.js'
import { globalMiddleware } from '../middleware/global.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addMiddleware('queue', [globalMiddleware])

wireQueueWorker({
  queueName: 'test-queue',
  tags: ['queue'],
  middleware: [wireMiddleware],
  func: noOpFunction,
})
