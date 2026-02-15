import type {
  CoreSingletonServices,
  MiddlewareMetadata,
  PikkuWire,
} from '../../types/core.types.js'
import type { CorePikkuChannelMiddleware } from './channel.types.js'
import { pikkuState } from '../../pikku-state.js'
import { freezeDedupe } from '../../utils.js'

export const addChannelMiddleware = (
  tag: string,
  middleware: CorePikkuChannelMiddleware[],
  packageName: string | null = null
): CorePikkuChannelMiddleware[] => {
  const tagGroups = pikkuState(packageName, 'channelMiddleware', 'tagGroup')
  tagGroups[tag] = middleware
  return middleware
}

const getChannelMiddlewareByName = (
  name: string
): CorePikkuChannelMiddleware | undefined => {
  const store = pikkuState(null, 'misc', 'channelMiddleware')
  const middleware = store[name]
  return middleware?.[0]
}

const channelMiddlewareCache: Record<
  string,
  readonly CorePikkuChannelMiddleware[]
> = {}

export const combineChannelMiddleware = (
  wireType: string,
  uid: string,
  {
    wireInheritedChannelMiddleware,
    wireChannelMiddleware,
    packageName = null,
  }: {
    wireInheritedChannelMiddleware?: MiddlewareMetadata[]
    wireChannelMiddleware?: CorePikkuChannelMiddleware[]
    packageName?: string | null
  } = {}
): readonly CorePikkuChannelMiddleware[] => {
  const cacheKey = `${wireType}:${uid}`
  if (channelMiddlewareCache[cacheKey]) {
    return channelMiddlewareCache[cacheKey]
  }

  const resolved: CorePikkuChannelMiddleware[] = []

  if (wireInheritedChannelMiddleware) {
    for (const meta of wireInheritedChannelMiddleware) {
      if (meta.type === 'tag') {
        const group = pikkuState(packageName, 'channelMiddleware', 'tagGroup')[
          meta.tag
        ]
        if (group) {
          resolved.push(...group)
        }
      } else if (meta.type === 'wire') {
        const middleware = getChannelMiddlewareByName(meta.name)
        if (middleware) {
          resolved.push(middleware)
        }
      }
    }
  }

  if (wireChannelMiddleware) {
    resolved.push(...wireChannelMiddleware)
  }

  channelMiddlewareCache[cacheKey] = freezeDedupe(
    resolved
  ) as readonly CorePikkuChannelMiddleware[]

  return channelMiddlewareCache[cacheKey]
}

export function wrapChannelWithMiddleware<Out>(
  wire: PikkuWire,
  services: CoreSingletonServices,
  middlewares: readonly CorePikkuChannelMiddleware[]
): PikkuWire {
  if (middlewares.length === 0 || !wire.channel) return wire

  const channel = wire.channel
  const originalSend = channel.send.bind(channel)

  const dispatch = async (index: number, event: Out): Promise<void> => {
    if (index >= middlewares.length) {
      await originalSend(event)
      return
    }

    const middleware = middlewares[index]!
    await middleware(services, event, async (result: any) => {
      if (result === null || result === undefined) return
      if (Array.isArray(result)) {
        for (const item of result) {
          await dispatch(index + 1, item)
        }
      } else {
        await dispatch(index + 1, result)
      }
    })
  }

  return {
    ...wire,
    channel: {
      ...channel,
      send: ((data: Out) => dispatch(0, data)) as typeof channel.send,
    },
  }
}
