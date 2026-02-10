import { CoreServices, CorePikkuMiddleware } from '../../types/core.types.js'
import { CoreChannel, ChannelMessageMeta } from './channel.types.js'
import { combineMiddleware, runMiddleware } from '../../middleware-runner.js'
import { runPikkuFuncDirectly } from '../../function/function-runner.js'

/**
 * Runs a channel lifecycle function (onConnect or onDisconnect) with proper middleware handling.
 *
 * This function:
 * 1. Extracts inline middleware from the lifecycle config if present
 * 2. Combines metadata middleware with inline middleware using combineMiddleware()
 * 3. Runs the lifecycle function with middleware support
 *
 * @param channelConfig - The channel configuration
 * @param meta - Metadata for the lifecycle function (connect or disconnect)
 * @param lifecycleConfig - The onConnect or onDisconnect config (can be function or object with middleware)
 * @param lifecycleType - Type of lifecycle for cache key ('connect' or 'disconnect')
 * @param services - All services (singleton + session)
 * @param channel - The channel instance
 * @param data - Optional data to pass to the lifecycle function (for onConnect)
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
}: {
  channelConfig: CoreChannel<unknown, any>
  meta: ChannelMessageMeta
  lifecycleConfig: any
  lifecycleType: 'connect' | 'disconnect'
  services: CoreServices
  channel: any
  data?: unknown
}): Promise<unknown> => {
  // Extract middleware if lifecycle config is an object
  const lifecycleMiddleware =
    typeof lifecycleConfig === 'object' && 'middleware' in lifecycleConfig
      ? (lifecycleConfig.middleware as CorePikkuMiddleware[]) || []
      : []

  // Use combineMiddleware to properly resolve metadata + inline middleware
  const allMiddleware = combineMiddleware(
    'channel',
    `${channelConfig.name}:${lifecycleType}`,
    {
      wireInheritedMiddleware: meta.middleware,
      wireMiddleware: lifecycleMiddleware,
    }
  )

  // Run the lifecycle function
  const runLifecycle = async () => {
    return await runPikkuFuncDirectly(
      meta.pikkuFuncId,
      services,
      { channel },
      data
    )
  }

  // Run with middleware if any
  if (allMiddleware.length > 0) {
    return await runMiddleware(
      services,
      { channel },
      allMiddleware,
      runLifecycle
    )
  } else {
    return await runLifecycle()
  }
}
