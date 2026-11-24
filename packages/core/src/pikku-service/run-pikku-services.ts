import { PikkuServiceError } from './pikku-service-error.js'
import type { ServiceRegistry } from './service-registry.js'
import type {
  PikkuServiceEnv,
  PikkuServiceTarget,
} from './pikku-service.types.js'

/** A service's `onServerStart`, named for the lifecycle that runs it. */
export interface PikkuServiceStartHook {
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
export const runPikkuServices = async (
  registry: ServiceRegistry,
  options: {
    target: PikkuServiceTarget
    services: Record<string, any>
    env?: PikkuServiceEnv
    /** Keys held before any service runs. Defaults to the keys already on `services`. */
    baseline?: readonly string[]
  }
): Promise<{ order: string[]; start: PikkuServiceStartHook[] }> => {
  const { services, target } = options
  const env = options.env ?? {}
  const resolved = registry.resolve(target, {
    baseline: options.baseline ?? Object.keys(services),
  })
  for (const service of resolved) {
    try {
      Object.assign(services, await service.factory(services, env))
    } catch (error) {
      throw new PikkuServiceError(
        'factory-failed',
        `Service '${service.name}' failed to build: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      )
    }
  }
  const start: PikkuServiceStartHook[] = []
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
