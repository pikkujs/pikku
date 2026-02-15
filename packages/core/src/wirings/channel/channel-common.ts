import {
  CoreServices,
  CorePikkuMiddleware,
  MiddlewareMetadata,
} from '../../types/core.types.js'
import { CoreChannel, ChannelMessageMeta } from './channel.types.js'
import { combineMiddleware, runMiddleware } from '../../middleware-runner.js'
import { runPikkuFuncDirectly } from '../../function/function-runner.js'
import {
  combineChannelMiddleware,
  wrapChannelWithMiddleware,
} from './channel-middleware-runner.js'

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
  services: CoreServices
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

  let wire = { channel }
  if (allChannelMiddleware.length > 0) {
    wire = wrapChannelWithMiddleware(
      wire as any,
      services as any,
      allChannelMiddleware
    ) as any
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
