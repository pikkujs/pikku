import {
  wireQueueWorker,
  addMiddleware,
  addPermission,
  pikkuPermission,
} from '../../.pikku/pikku-types.gen.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'
import { tagMiddleware } from '../middleware/tag.js'

// Tag middleware for queue
export const queueTagMiddleware = () =>
  addMiddleware('queue', [tagMiddleware('queue')])

// Tag permissions for queue
export const queueTagPermissions = () =>
  addPermission('queue', {
    queuePermission: pikkuPermission(async ({ logger }, _data, session) => {
      logger.info({
        type: 'tag-permission',
        name: 'queue',
        sessionExists: !!session,
      })
      // Return false to ensure all permissions run
      return false
    }),
  })

wireQueueWorker({
  queueName: 'test-queue',
  tags: ['queue'],
  middleware: [wireMiddleware('queue')],
  func: noOpFunction,
})
