import type {
  CoreSingletonServices,
  CorePikkuMiddleware,
  PikkuWire,
  MiddlewareMetadata,
} from '../../types/core.types.js'
import type { CoreChannel, ChannelMessageMeta } from './channel.types.js'
import { combineMiddleware, runMiddleware } from '../../middleware-runner.js'
import { runPikkuFuncDirectly } from '../../function/function-runner.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from './channel-middleware-runner.js'

/**
 * Runs a channel lifecycle function (onConnect or onDisconnect) with proper middleware handling.
 *
 * This function:
 * 1. Extracts inline middleware from the lifecycle config if present
 * 2. Combines metadata middleware with inline middleware using combineMiddleware()
 * 3. Wraps the channel with channel middleware if present
 * 4. Runs the lifecycle function with middleware support
 *
 * @param channelConfig - The channel configuration
 * @param meta - Metadata for the lifecycle function (connect or disconnect)
 * @param lifecycleConfig - The onConnect or onDisconnect config (can be function or object with middleware)
 * @param lifecycleType - Type of lifecycle for cache key ('connect' or 'disconnect')
 * @param services - All services (singleton + session)
 * @param channel - The channel instance
 * @param data - Optional data to pass to the lifecycle function (for onConnect)
 * @param channelMiddlewareMeta - Optional channel middleware metadata for wrapping channel.send()
 * @returns Promise<unknown> - Result from the lifecycle function (if any)
 */
export const runChannelLifecycleWithMiddleware = async ({
  channelConfig,
  meta,
  lifecycleConfig,
  lifecycleType,
  services,
  channel,
  data,
  channelMiddlewareMeta,
}: {
  channelConfig: CoreChannel<unknown, any>
  meta: ChannelMessageMeta
  lifecycleConfig: any
  lifecycleType: 'connect' | 'disconnect'
  services: CoreSingletonServices
  channel: any
  data?: unknown
  channelMiddlewareMeta?: MiddlewareMetadata[]
}): Promise<unknown> => {
  const lifecycleMiddleware =
    typeof lifecycleConfig === 'object' && 'middleware' in lifecycleConfig
      ? (lifecycleConfig.middleware as CorePikkuMiddleware[]) || []
      : []

  const allMiddleware = combineMiddleware(
    'channel',
    `${channelConfig.name}:${lifecycleType}`,
    {
      wireInheritedMiddleware: meta.middleware,
      wireMiddleware: lifecycleMiddleware,
    }
  )

  const allChannelMiddleware = combineChannelMiddleware(
    'channel',
    `${channelConfig.name}:${lifecycleType}:cm`,
    {
      wireInheritedChannelMiddleware: channelMiddlewareMeta,
      wireChannelMiddleware: channelConfig.channelMiddleware as any,
    }
  )

  let wire: PikkuWire = { channel }
  if (allChannelMiddleware.length > 0) {
    wire = wrapChannelWithMiddleware(wire, services, allChannelMiddleware)
  }

  const runLifecycle = async () => {
    return await runPikkuFuncDirectly(meta.pikkuFuncId, services, wire, data)
  }

  if (allMiddleware.length > 0) {
    return await runMiddleware(services, wire, allMiddleware, runLifecycle)
  } else {
    return await runLifecycle()
  }
}
