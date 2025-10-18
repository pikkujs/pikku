import {
  wireQueueWorker,
  addMiddleware,
} from '../../../functions/.pikku/pikku-types.gen.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addMiddleware('queue', [tagMiddleware('queue')])

wireQueueWorker({
  queueName: 'test-queue',
  tags: ['queue'],
  middleware: [wireMiddleware('queue')],
  func: noOpFunction,
})
