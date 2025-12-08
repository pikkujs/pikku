import {
  wireQueueWorker,
  addMiddleware,
  addPermission,
  pikkuPermission,
} from '#pikku'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addMiddleware('queue', [tagMiddleware('queue')])

// Tag permissions for queue
export const queueTagPermissions = () =>
  addPermission('queue', {
    queuePermission: pikkuPermission(
      async ({ logger }, _data, { initialSession }) => {
        logger.info({
          type: 'tag-permission',
          name: 'queue',
          sessionExists: !!initialSession,
        })
        // Return false to ensure all permissions run
        return false
      }
    ),
  })

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireQueueWorker({
  queueName: 'test-queue',
  tags: ['session', 'queue'],
  middleware: [wireMiddleware('queue')],
  func: noOpFunction,
})
