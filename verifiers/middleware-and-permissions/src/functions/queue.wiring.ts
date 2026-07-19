import { wireQueueWorker, addTagMiddleware } from '#pikku'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addTagMiddleware('queue', [tagMiddleware('queue')])

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireQueueWorker({
  name: 'test-queue',
  tags: ['session', 'queue'],
  middleware: [wireMiddleware('queue')],
  func: noOpFunction,
})
