import {
  wireQueueWorker,
  addTagMiddleware,
  addTagPermission,
  pikkuPermission,
} from '#pikku'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

const queuePermission = pikkuPermission(
  async ({ logger }, _data, { session }) => {
    logger.info({
      type: 'tag-permission',
      name: 'queue',
      sessionExists: !!session,
    })
    return false
  }
)

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addTagMiddleware('queue', [tagMiddleware('queue')])

// Tag permissions for queue
export const queueTagPermissions = () =>
  addTagPermission('queue', {
    queuePermission,
  })

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireQueueWorker({
  name: 'test-queue',
  tags: ['session', 'queue'],
  middleware: [wireMiddleware('queue')],
  func: noOpFunction,
})
