import { wireMiddleware } from '../middleware/wire.js'
import {
  channelTagMiddleware,
  wireChannelMiddleware,
} from '../middleware/channel-middleware.js'
import { noOpFunction } from './no-op.function.js'
import { channelSendFunction } from './channel-send.function.js'
import {
  pikkuMiddleware,
  pikkuChannelConnectionFunc,
  pikkuChannelDisconnectionFunc,
  addChannelMiddleware,
  wireChannel,
} from '#pikku'

// Wire-level inline middleware (not exported, won't be in pikku-middleware.gen.ts)
const inlineWireMiddleware = pikkuMiddleware(async ({ logger }, _, next) => {
  logger.info({ type: 'wire', name: 'channel-inline', phase: 'before' })
  const result = await next()
  logger.info({ type: 'wire', name: 'channel-inline', phase: 'after' })
  return result
})

// Message-level middleware test
const messageMiddleware = pikkuMiddleware(
  async ({ logger }, { channel }, next) => {
    logger.info({
      type: 'message',
      name: 'message-middleware',
      phase: 'before',
    })
    const result = await next()
    logger.info({
      type: 'message',
      name: 'message-middleware',
      phase: 'after',
      channelExists: !!channel,
    })
    return result
  }
)

// Connection lifecycle functions
const onConnect = pikkuChannelConnectionFunc(async ({ logger }) => {
  logger.info({ type: 'lifecycle', name: 'onConnect', phase: 'execute' })
})

const onDisconnect = pikkuChannelDisconnectionFunc(async ({ logger }) => {
  logger.info({ type: 'lifecycle', name: 'onDisconnect', phase: 'execute' })
})

// Tag-based channel middleware (applies to channels with 'test' tag)
export const testChannelTagMiddleware = () =>
  addChannelMiddleware('test', [channelTagMiddleware('test-cm')])

// Test channel with different message routing scenarios
wireChannel({
  name: 'test-channel',
  route: '/test-channel',
  tags: ['test'],
  auth: false,
  middleware: [inlineWireMiddleware],
  channelMiddleware: [wireChannelMiddleware],
  onConnect,
  onDisconnect,
  onMessageWiring: {
    // Test 1: Simple function
    command: {
      simple: noOpFunction,

      // Test 2: Function with middleware config
      withMiddleware: {
        func: noOpFunction,
        middleware: [messageMiddleware],
      },

      // Test 3: Function with wire middleware
      withWireMiddleware: {
        func: noOpFunction,
        middleware: [wireMiddleware('channel-test')],
      },

      // Test 4: Function with both
      withBoth: {
        func: noOpFunction,
        middleware: [wireMiddleware('channel-test'), messageMiddleware],
      },

      // Test 5: Function that sends on channel (triggers channel middleware)
      withChannelSend: {
        func: channelSendFunction,
        middleware: [messageMiddleware],
      },
    },
  },
})
