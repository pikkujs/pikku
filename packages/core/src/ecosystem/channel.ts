export { addChannelMiddleware } from '../wirings/channel/channel-middleware-runner.js'
export type { Capabilities } from '../wirings/channel/channel-rpc.types.js'
export { ChannelStore } from '../wirings/channel/channel-store.js'
export type { Channel } from '../wirings/channel/channel-store.js'
export type {
  BinaryData,
  ChannelMessageMeta,
  ChannelMeta,
  ChannelsMeta,
  CoreChannel,
  CorePikkuChannelMiddleware,
  CorePikkuChannelMiddlewareFactory,
  PikkuChannelHandlerFactory,
} from '../wirings/channel/channel.types.js'
export type { EventHubService } from '../wirings/channel/eventhub-service.js'
export { EventHubStore } from '../wirings/channel/eventhub-store.js'
export { logChannels } from '../wirings/channel/log-channels.js'
export { PikkuAbstractChannelHandler } from '../wirings/channel/pikku-abstract-channel-handler.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { Logger } from '../services/logger.js'
