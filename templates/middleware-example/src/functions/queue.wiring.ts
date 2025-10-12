// Ensure queue metadata is loaded before calling wireQueueWorker
import '../../.pikku/queue/pikku-queue-workers-wirings-meta.gen.js'

import { wireQueueWorker, addMiddleware } from '../../.pikku/pikku-types.gen.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addMiddleware('queue', [tagMiddleware('queue')])

wireQueueWorker({
  queueName: 'test-queue',
  tags: ['queue'],
  middleware: [wireMiddleware],
  func: noOpFunction,
})
