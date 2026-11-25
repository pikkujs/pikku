import { ProviderError } from './provider-error.js'
import type { ProviderRegistry } from './provider-registry.js'
import type {
  ProviderEnv,
  ProviderProfile,
  ProviderTarget,
} from './provider.types.js'

/** A service's `onServerStart`, named for the lifecycle that runs it. */
export interface ProviderStartHook {
  name: string
  run: (services: any) => void | Promise<void>
}

/**
 * Builds every service the registry has for `target`, in dependency order, onto
 * `services`. Each factory gets `services` as built so far and sets the keys it
 * returns, replacing a baseline key when it provides one. Teardown is each
 * service's own `stop()`, run by `stopSingletonServices` in reverse order.
 *
 * @returns The order services ran in, and their `onServerStart` hooks in that order.
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
): Promise<{ order: string[]; start: ProviderStartHook[] }> => {
  const { services, target } = options
  const env = options.env ?? {}
  const resolved = registry.resolve(target, {
    baseline: options.baseline ?? Object.keys(services),
    profile: options.profile,
  })
  for (const service of resolved) {
    try {
      Object.assign(services, await service.factory(services, env))
    } catch (error) {
      throw new ProviderError(
        'factory-failed',
        `Provider '${service.name}' failed to build: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      )
    }
  }
  const start: ProviderStartHook[] = []
  for (const service of resolved) {
    const { onServerStart } = service
    if (onServerStart) {
      start.push({
        name: service.name,
        run: (s) => onServerStart.call(undefined, s),
      })
    }
  }
  return { order: resolved.map((service) => service.name), start }
}
