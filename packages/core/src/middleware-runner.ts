import type { PikkuWiringTypes } from './types/core.types.js'
import type {
  CorePikkuMiddleware,
  CorePikkuMiddlewareGroup,
  MiddlewareMetadata,
  MiddlewarePriority,
} from './middleware/middleware.types.js'
import { pikkuState } from './pikku-state.js'
import { freezeDedupe, getTagGroups } from './utils.js'

const PRIORITY_ORDER: Record<MiddlewarePriority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
}

const getMiddlewarePriority = (fn: CorePikkuMiddleware<any, any>): number => {
  const priority = (
    fn as CorePikkuMiddleware<any, any> & { __priority?: MiddlewarePriority }
  ).__priority
  return PRIORITY_ORDER[priority ?? 'medium']
}

const sortByPriority = (
  middlewares: CorePikkuMiddleware<any, any>[]
): CorePikkuMiddleware<any, any>[] => {
  return middlewares.sort(
    (a, b) => getMiddlewarePriority(a) - getMiddlewarePriority(b)
  )
}

export const runMiddleware = async <
  Middleware extends CorePikkuMiddleware<any, any>,
>(
  services: Parameters<Middleware>[0],
  wire: Parameters<Middleware>[1],
  middlewares: readonly Middleware[],
  main?: () => Promise<unknown>
): Promise<unknown> => {
  const sorted = isSortedByPriority(middlewares)
    ? middlewares
    : ([...middlewares].sort(
        (a, b) => getMiddlewarePriority(a) - getMiddlewarePriority(b)
      ) as readonly Middleware[])
  let result: any
  const dispatch = async (index: number): Promise<any> => {
    if (sorted && index < sorted.length) {
      return await sorted[index]!(
        services as Parameters<Middleware>[0],
        wire,
        () => dispatch(index + 1)
      )
    } else if (main) {
      result = await main()
    }
  }
  await dispatch(0)
  return result
}

const isSortedByPriority = (
  middlewares: readonly CorePikkuMiddleware<any, any>[]
): boolean => {
  for (let i = 1; i < middlewares.length; i++) {
    if (
      getMiddlewarePriority(middlewares[i]) <
      getMiddlewarePriority(middlewares[i - 1])
    ) {
      return false
    }
  }
  return true
}

/**
 * Registers tag-scoped middleware for any wiring carrying the tag. Wrap in a
 * factory (`export const x = () => addTagMiddleware(...)`) for tree-shaking.
 */
export const addTagMiddleware = <PikkuMiddleware extends CorePikkuMiddleware>(
  tag: string,
  middleware: CorePikkuMiddlewareGroup,
  packageName: string | null = null
): CorePikkuMiddlewareGroup => {
  const tagGroups = pikkuState(packageName, 'middleware', 'tagGroup')
  const existing = tagGroups[tag] as CorePikkuMiddleware[] | undefined
  tagGroups[tag] = existing
    ? [...existing, ...(middleware as CorePikkuMiddleware[])]
    : middleware
  return middleware
}

/**
 * Registers wire-agnostic global middleware, which runs at the top of every
 * wiring's chain — before wire-, tag- and function-level entries.
 */
export const addGlobalMiddleware = <
  PikkuMiddleware extends CorePikkuMiddleware,
>(
  middleware: CorePikkuMiddlewareGroup,
  packageName: string | null = null
): CorePikkuMiddlewareGroup => {
  const state = pikkuState(
    packageName,
    'middleware',
    'global'
  ) as unknown as CorePikkuMiddlewareGroup
  ;(state as CorePikkuMiddleware[]).push(
    ...(middleware as CorePikkuMiddleware[])
  )
  return middleware
}

const getMiddlewareByName = (name: string): CorePikkuMiddleware | undefined => {
  const middlewareStore = pikkuState(null, 'misc', 'middleware')
  const middleware = middlewareStore[name]
  return middleware?.[0]
}

/**
 * Per-wire-type cap on the memoized middleware chains. The cache key is the
 * wire id, which for an RPC is the requested function name — and a name can
 * carry attacker-influenced version/alias suffixes that still resolve. Left
 * unbounded, a caller could grow the map without limit and exhaust memory. It
 * is a pure memoization, so evicting the oldest entry and recomputing on the
 * next miss is free of correctness cost. The cap sits well above any realistic
 * function count.
 */
const MIDDLEWARE_CACHE_MAX = 4096

const newCache = (): Map<string, readonly CorePikkuMiddleware[]> => new Map()

const middlewareCache: Record<
  PikkuWiringTypes,
  Map<string, readonly CorePikkuMiddleware[]>
> = {
  http: newCache(),
  rpc: newCache(),
  channel: newCache(),
  queue: newCache(),
  scheduler: newCache(),
  trigger: newCache(),
  mcp: newCache(),
  agent: newCache(),
  cli: newCache(),
  workflow: newCache(),
  gateway: newCache(),
}

const cacheGet = (
  wireType: PikkuWiringTypes,
  uid: string
): readonly CorePikkuMiddleware[] | undefined => {
  const cache = middlewareCache[wireType]
  const hit = cache.get(uid)
  if (hit !== undefined) {
    // Refresh recency: delete + re-set moves the key to the end (LRU).
    cache.delete(uid)
    cache.set(uid, hit)
  }
  return hit
}

const cacheSet = (
  wireType: PikkuWiringTypes,
  uid: string,
  value: readonly CorePikkuMiddleware[]
): readonly CorePikkuMiddleware[] => {
  const cache = middlewareCache[wireType]
  cache.set(uid, value)
  if (cache.size > MIDDLEWARE_CACHE_MAX) {
    // Evict the least-recently-used entry (Map iteration is insertion order).
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return value
}

export const clearMiddlewareCache = () => {
  for (const key of Object.keys(middlewareCache) as PikkuWiringTypes[]) {
    middlewareCache[key] = newCache()
  }
}

/** The per-wire-type entry cap. Exposed so the boundedness invariant is testable. */
export const MIDDLEWARE_CACHE_MAX_ENTRIES = MIDDLEWARE_CACHE_MAX

/** Current number of cached chains for a wire type. Test/observability only. */
export const middlewareCacheSize = (wireType: PikkuWiringTypes): number =>
  middlewareCache[wireType].size

export const combineMiddleware = (
  wireType: PikkuWiringTypes,
  uid: string,
  {
    wireInheritedMiddleware,
    wireMiddleware,
    funcInheritedMiddleware,
    funcMiddleware,
    packageName = null,
  }: {
    wireInheritedMiddleware?: MiddlewareMetadata[]
    wireMiddleware?: CorePikkuMiddleware[]
    funcInheritedMiddleware?: MiddlewareMetadata[]
    funcMiddleware?: CorePikkuMiddleware[]
    packageName?: string | null
  } = {}
): readonly CorePikkuMiddleware[] => {
  const cached = cacheGet(wireType, uid)
  if (cached) {
    return cached
  }

  const resolved: CorePikkuMiddleware[] = []

  // Global middleware is application-wide, so the root namespace always
  // applies — an addon's function still runs inside the host application.
  // See `global-middleware-resolves-from-the-root-namespace-too.md`.
  for (const ns of packageName === null ? [null] : [null, packageName]) {
    const globals = pikkuState(
      ns,
      'middleware',
      'global'
    ) as unknown as CorePikkuMiddleware[]
    if (globals && globals.length > 0) {
      resolved.push(...globals)
    }
  }

  if (wireInheritedMiddleware) {
    for (const meta of wireInheritedMiddleware) {
      if (meta.type === 'http') {
        const group = pikkuState(packageName, 'middleware', 'httpGroup')[
          meta.route
        ]
        if (group) {
          // At runtime, all factories should be resolved to middleware
          resolved.push(...(group as CorePikkuMiddleware[]))
        }
      } else if (meta.type === 'tag') {
        const groups = getTagGroups(
          pikkuState(packageName, 'middleware', 'tagGroup'),
          meta.tag
        )
        for (const group of groups) {
          resolved.push(...(group as CorePikkuMiddleware[]))
        }
      } else if (meta.type === 'wire') {
        const middleware = getMiddlewareByName(meta.name)
        if (middleware) {
          resolved.push(middleware)
        }
      }
    }
  }

  if (wireMiddleware) {
    resolved.push(...wireMiddleware)
  }

  // Only tags here; wire middleware is resolved via wireInheritedMiddleware.
  if (funcInheritedMiddleware) {
    for (const meta of funcInheritedMiddleware) {
      if (meta.type === 'tag') {
        const groups = getTagGroups(
          pikkuState(packageName, 'middleware', 'tagGroup'),
          meta.tag
        )
        for (const group of groups) {
          resolved.push(...(group as CorePikkuMiddleware[]))
        }
      }
    }
  }

  if (funcMiddleware) {
    resolved.push(...funcMiddleware)
  }

  sortByPriority(resolved)
  return cacheSet(
    wireType,
    uid,
    freezeDedupe(resolved) as readonly CorePikkuMiddleware[]
  )
}
