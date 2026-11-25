import { frozenView } from './frozen-view.js'
import { ProviderError } from './provider-error.js'
import type { ProviderRegistry } from './provider-registry.js'
import { scopedEnv } from './scoped-env.js'
import type { ProviderStopEntry } from './stop-order.js'
import type {
  ProviderCollectionEntry,
  ProviderEnv,
  ProviderProfile,
  ProviderTarget,
  ResolvedProvider,
} from './provider.types.js'

/** A service's `onServerStart`, named for the lifecycle that runs it. */
export interface ProviderStartHook {
  name: string
  run: (services: any) => void | Promise<void>
}

export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const hasKey = (value: object, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key)

/**
 * Builds one provider: hands its factory a frozen view of its declared needs
 * (and a scoped `env` for an addon's), then checks what it returned against
 * what the inspector read it to provide.
 */
const call = async (
  provider: ResolvedProvider,
  services: Record<string, any>,
  env: ProviderEnv
): Promise<unknown> => {
  const view = frozenView(
    services,
    [...new Set([...provider.needs, ...provider.optional])],
    provider.name
  )
  const providerEnv = provider.addon
    ? scopedEnv(env, provider.addon, provider.name)
    : env
  try {
    return await provider.factory(view, providerEnv)
  } catch (error) {
    if (error instanceof ProviderError) throw error
    throw new ProviderError(
      'factory-failed',
      `Provider '${provider.name}' failed to build: ${describeError(error)}`,
      { cause: error }
    )
  }
}

/**
 * Checks what a provider returned against what the inspector read it to
 * provide, and returns the keys it provides. A key outside `provides` is
 * `undeclared-return`; a required key it left out is `missing-return`.
 */
export const checkProvided = (
  provider: ResolvedProvider,
  returned: unknown
): Record<string, unknown> => {
  const provided: Record<string, unknown> = {}
  const result = (
    returned !== null && typeof returned === 'object' ? returned : {}
  ) as Record<string, unknown>
  const listed = provider.provides.join(', ') || 'none'
  for (const key of Object.keys(result)) {
    if (!provider.provides.includes(key)) {
      throw new ProviderError(
        'undeclared-return',
        `Provider '${provider.name}' returned '${key}', which its return type does not declare. It provides: ${listed}.`
      )
    }
  }
  for (const key of provider.provides) {
    if (hasKey(result, key) && result[key] !== undefined) {
      provided[key] = result[key]
    } else if (!provider.optionalProvides.includes(key)) {
      throw new ProviderError(
        'missing-return',
        `Provider '${provider.name}' did not return '${key}', which its return type requires.`
      )
    }
  }
  return provided
}

const build = async (
  provider: ResolvedProvider,
  services: Record<string, any>,
  env: ProviderEnv
): Promise<Record<string, unknown>> =>
  checkProvided(provider, await call(provider, services, env))

/**
 * The keys to stop, first to last: what the providers provided, latest
 * provider first, each object once however many keys hold it.
 */
const stopOrderOf = (
  resolved: readonly ResolvedProvider[],
  services: Record<string, any>
): ProviderStopEntry[] => {
  const seen = new Set<unknown>()
  const order: ProviderStopEntry[] = []
  for (const provider of [...resolved].reverse()) {
    if (provider.addTo) {
      order.push({ collection: provider.addTo, label: provider.name })
      continue
    }
    for (const key of [...provider.provides].reverse()) {
      const value = services[key]
      if (value === undefined || seen.has(value)) continue
      if (value !== null && typeof value === 'object') seen.add(value)
      order.push(key)
    }
  }
  return order
}

const byLabel = (
  a: ProviderCollectionEntry<unknown>,
  b: ProviderCollectionEntry<unknown>
) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)

/** The collection's value: its entries sorted by label, frozen, entries too. */
const collectionValue = (
  entries: readonly ProviderCollectionEntry<unknown>[]
): readonly ProviderCollectionEntry<unknown>[] =>
  Object.freeze(
    [...entries].sort(byLabel).map((entry) => Object.freeze({ ...entry }))
  )

/**
 * Builds every service the registry has for `target`, in dependency order, onto
 * `services`. Each factory gets a frozen view holding only the keys it declares
 * it needs, and only the keys it declares it provides are set on `services`,
 * replacing a baseline key when it provides one. A provider that reads
 * another key, or returns one it does not declare, fails with a `ProviderError`.
 * An addon's providers read a `env` scoped to the names the addon declares.
 *
 * @returns The order services ran in, their `onServerStart` hooks in that
 * order, and `stopOrder`: the keys to stop, latest provider first. Teardown is
 * each service's own `stop()`, run by `stopSingletonServices`.
 */
export const runProviders = async (
  registry: ProviderRegistry,
  options: {
    target: ProviderTarget
    /** The deploy runtime, which picks a `deploy:<profile>` variant. */
    profile?: ProviderProfile
    services: Record<string, any>
    env?: ProviderEnv
    /** Keys held before any service runs. Defaults to the keys already on `services`. */
    baseline?: readonly string[]
  }
): Promise<{
  order: string[]
  start: ProviderStartHook[]
  stopOrder: ProviderStopEntry[]
}> => {
  const { services, target } = options
  const env = options.env ?? {}
  const resolved = registry.resolve(target, {
    baseline: options.baseline ?? Object.keys(services),
    profile: options.profile,
  })
  const collections = new Map<string, ProviderCollectionEntry<unknown>[]>()
  for (const name of registry.collectionNames) {
    const held = services[name]
    collections.set(name, Array.isArray(held) ? [...held] : [])
    services[name] = collectionValue(collections.get(name)!)
  }
  for (const provider of resolved) {
    if (!provider.addTo) {
      Object.assign(services, await build(provider, services, env))
      continue
    }
    const item = await call(provider, services, env)
    if (item === undefined || item === null) {
      throw new ProviderError(
        'missing-return',
        `Provider '${provider.name}' returned no item for collection '${provider.addTo}'.`
      )
    }
    const entries = collections.get(provider.addTo)!
    if (entries.some((entry) => entry.label === provider.name)) {
      throw new ProviderError(
        'duplicate-name',
        `Collection '${provider.addTo}' already has an item labelled '${provider.name}'.`
      )
    }
    entries.push({ label: provider.name, item })
    services[provider.addTo] = collectionValue(entries)
  }
  const start: ProviderStartHook[] = []
  for (const provider of resolved) {
    const { onServerStart } = provider
    if (onServerStart) {
      start.push({
        name: provider.name,
        run: (s) => onServerStart.call(undefined, s),
      })
    }
  }
  return {
    order: resolved.map((provider) => provider.name),
    start,
    stopOrder: stopOrderOf(resolved, services),
  }
}
