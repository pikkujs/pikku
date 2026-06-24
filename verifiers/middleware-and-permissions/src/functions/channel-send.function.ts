import { pikkuVoidFunc } from '#pikku'
import { functionMiddleware } from '../middleware/function.js'
import { functionPermission } from '../permissions/function.js'

export const channelSendFunction = pikkuVoidFunc({
  func: async ({ logger }, _input, { channel }: any) => {
    logger.info({ type: 'function', name: 'channelSend', phase: 'execute' })
    if (channel) {
      await channel.send({ type: 'test-response' })
    }
  },
  middleware: [functionMiddleware('channelSend')],
  permissions: {
    functionLevel: functionPermission,
  },
  tags: ['function'],
  auth: false,
})
