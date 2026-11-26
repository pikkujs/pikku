import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ServiceServerHook } from '@pikku/core/lifecycle'
import { loadUserModule } from './load-user-project.js'

export interface DevPikkuServices<T extends Record<string, any>> {
  /** The local services with what the project's services provide over them. */
  services: T & Record<string, any>
  /** `onServerStart` hooks, in run order. */
  startHooks: ServiceServerHook[]
}

/**
 * Loads the generated dev runner (`pikku dev` and `pikku serve` share it) and
 * builds the project's services on top of the local ones, before the app's
 * `createSingletonServices` sees them as `existingServices`. The runner holds
 * the services the project declares with `pikkuService` and opted in to with
 * `wireAddon`; a service that provides a key the local services already have
 * replaces it. Teardown is each service's own `stop()`.
 *
 * `baseline` is what the generated runner was resolved against. It must all be
 * on `localServices`: a key listed but not injected would let a service that
 * needs it pass the build and fail here, so that is an error naming the key.
 *
 * With no file, or under NODE_ENV=production, the local services come back
 * untouched and there are no hooks.
 */
export const loadDevPikkuServices = async <T extends Record<string, any>>(
  localServices: T,
  rootDir: string,
  devServicesFile: string,
  baseline: readonly string[],
  env: Record<string, string | undefined> = process.env
): Promise<DevPikkuServices<T>> => {
  const none = { services: localServices, startHooks: [] }
  if (env.NODE_ENV === 'production') return none
  const tsPath = resolve(rootDir, devServicesFile)
  const path = [tsPath, tsPath.replace(/\.ts$/, '.js')].find((candidate) =>
    existsSync(candidate)
  )
  if (!path) return none
  const absent = baseline.filter((key) => !(key in localServices))
  if (absent.length > 0) {
    throw new Error(
      `pikku dev resolved the project's services against a baseline holding ${absent.map((key) => `'${key}'`).join(', ')}, but the local services it built do not have ${absent.length === 1 ? 'it' : 'them'}. Update devBaselineServices to match what pikku dev injects.`
    )
  }
  const { createPlatformServices, serverStartHooks } =
    await loadUserModule(path)
  return {
    services: (await createPlatformServices(env, localServices)) as T &
      Record<string, any>,
    startHooks: serverStartHooks ?? [],
  }
}
