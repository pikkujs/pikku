import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { addonMiddleware } from '../middleware.js'
import { addonPermission } from '../permission.js'

export const hello = pikkuSessionlessFunc<
  { name: string; greeting?: string },
  { message: string; timestamp: number; noopCalls: number }
>({
  description: 'Sends a friendly greeting message',
  func: async ({ logger, noop }, data) => {
    const greeting = data.greeting || 'Hello'
    const message = `${greeting}, ${data.name}!`

    logger.info(`Addon: ${message}`)

    const noopResult = noop.execute()

    return {
      message,
      timestamp: Date.now(),
      noopCalls: noopResult.callCount,
    }
  },
  middleware: [addonMiddleware('hello')],
  permissions: {
    functionLevel: addonPermission,
  },
  tags: ['addon'],
  node: {
    displayName: 'Say Hello',
    category: 'Communication',
    type: 'action',
  },
})
