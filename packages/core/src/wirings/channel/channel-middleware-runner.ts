import type {
  CoreSingletonServices,
  MiddlewareMetadata,
  PikkuRawWire,
} from '../../types/core.types.js'
import type { CorePikkuChannelMiddleware } from './channel.types.js'
import { pikkuState } from '../../pikku-state.js'
import { freezeDedupe, getTagGroups } from '../../utils.js'

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

export const clearChannelMiddlewareCache = () => {
  for (const key of Object.keys(channelMiddlewareCache)) {
    delete channelMiddlewareCache[key]
  }
}

/**
 * Combine the inherited (tag/named) channel middleware with any per-run
 * middleware for a wiring.
 *
 * Only the statically-resolved inherited middleware is deterministic per `uid`
 * and safe to cache. `wireChannelMiddleware` is a per-run set of closures (e.g.
 * an AI agent's per-invocation stream middleware holding that run's
 * thread/session state) and MUST NOT be cached — caching it lets a later run of
 * the same `uid` reuse an earlier run's closures, leaking that run's state (and
 * growing memory) across invocations. It is therefore appended fresh on every
 * call after the cached inherited slice.
 */
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
  let inherited = channelMiddlewareCache[cacheKey]
  if (!inherited) {
    const resolved: CorePikkuChannelMiddleware[] = []
    if (wireInheritedChannelMiddleware) {
      for (const meta of wireInheritedChannelMiddleware) {
        if (meta.type === 'tag') {
          const groups = getTagGroups(
            pikkuState(packageName, 'channelMiddleware', 'tagGroup'),
            meta.tag
          )
          for (const group of groups) {
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
    inherited = channelMiddlewareCache[cacheKey] = freezeDedupe(
      resolved
    ) as readonly CorePikkuChannelMiddleware[]
  }

  if (!wireChannelMiddleware?.length) {
    return inherited
  }

  return freezeDedupe([
    ...inherited,
    ...wireChannelMiddleware,
  ]) as readonly CorePikkuChannelMiddleware[]
}

export function wrapChannelWithMiddleware<Out>(
  wire: PikkuRawWire,
  services: CoreSingletonServices,
  middlewares: readonly CorePikkuChannelMiddleware[]
): PikkuRawWire {
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
      sendBinary: channel.sendBinary,
    },
  }
}
