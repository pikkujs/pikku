import type { CorePikkuChannelMiddleware } from './channel.types.js'
import type {
  CoreSingletonServices,
  CorePikkuMiddleware,
  PikkuRawWire,
  PikkuWire,
  MiddlewareMetadata,
} from '../../types/core.types.js'
import type { CoreChannel, ChannelMessageMeta } from './channel.types.js'
import { combineMiddleware, runMiddleware } from '../../middleware-runner.js'
import { runPikkuFunc } from '../../function/function-runner.js'
import {
  type PikkuSessionService,
  createMiddlewareSessionWireProps,
} from '../../services/user-session-service.js'
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
  userSession,
}: {
  channelConfig: CoreChannel<unknown, any>
  meta: ChannelMessageMeta
  lifecycleConfig: any
  lifecycleType: 'connect' | 'disconnect'
  services: CoreSingletonServices
  channel: any
  data?: unknown
  channelMiddlewareMeta?: MiddlewareMetadata[]
  /**
   * Established while the socket was upgrading, so `onConnect` can tell who
   * just connected.
   */
  userSession?: PikkuSessionService<any>
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
      // knowledge: questions/channel-middleware-accepts-bare-factories-that-nothing-resolves.md
      wireChannelMiddleware:
        channelConfig.channelMiddleware as CorePikkuChannelMiddleware[],
    }
  )

  let wire: PikkuRawWire = {
    channel,
    ...(userSession ? createMiddlewareSessionWireProps(userSession) : {}),
  }
  if (allChannelMiddleware.length > 0) {
    wire = wrapChannelWithMiddleware(wire, services, allChannelMiddleware)
  }

  const runLifecycle = async () => {
    return await runPikkuFunc('channel', channelConfig.name, meta.pikkuFuncId, {
      singletonServices: services,
      data: () => data,
      wire,
      sessionService: userSession,
      tags: meta.tags ?? [],
      packageName: meta.packageName ?? null,
    })
  }

  if (allMiddleware.length > 0) {
    return await runMiddleware(
      services,
      wire as unknown as PikkuWire,
      allMiddleware,
      runLifecycle
    )
  } else {
    return await runLifecycle()
  }
}
