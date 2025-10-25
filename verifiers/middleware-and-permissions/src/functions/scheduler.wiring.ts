import {
  wireScheduler,
  addMiddleware,
  addPermission,
  pikkuPermission,
} from '../../.pikku/pikku-types.gen.js'
import { tagMiddleware } from '../middleware/tag.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for scheduler
export const schedulerTagMiddleware = () =>
  addMiddleware('scheduler', [tagMiddleware('scheduler')])

// Tag permissions for scheduler
export const schedulerTagPermissions = () =>
  addPermission('scheduler', {
    schedulerPermission: pikkuPermission(async ({ logger }, _data, session) => {
      logger.info({
        type: 'tag-permission',
        name: 'scheduler',
        sessionExists: !!session,
      })
      // Return false to ensure all permissions run
      return false
    }),
  })

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireScheduler({
  name: 'testScheduledTask',
  schedule: '*/1 * * * *', // Every minute
  tags: ['session', 'scheduler'],
  middleware: [wireMiddleware('scheduler')],
  func: noOpFunction,
})
