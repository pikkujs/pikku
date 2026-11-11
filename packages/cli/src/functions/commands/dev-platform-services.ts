import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ContributorServerHook } from '@pikku/core/lifecycle'
import { loadUserModule } from './load-user-project.js'

export interface DevPlatformServices<T extends Record<string, any>> {
  /** The local services with the contributors' over them. */
  services: T & Record<string, any>
  /** `onServerStart` hooks, in run order. */
  startHooks: ContributorServerHook[]
  /** `onServerStop` hooks, already in reverse run order. */
  stopHooks: ContributorServerHook[]
}

/**
 * Loads the generated platform-services file (`pikku dev` and `pikku serve`
 * share it): merges what its contributors provide over the local services,
 * before the app's `createSingletonServices` sees them, and returns the
 * contributors' server-lifecycle hooks. The file holds the contributors the
 * project opted in to with `wireAddon`; it is spread last, so a contributor
 * that replaces a baseline service wins.
 *
 * With no file, or under NODE_ENV=production, the local services come back
 * untouched and there are no hooks.
 */
export const loadDevPlatformServices = async <T extends Record<string, any>>(
  localServices: T,
  rootDir: string,
  devContributorsFile: string,
  env: Record<string, string | undefined> = process.env
): Promise<DevPlatformServices<T>> => {
  const none = { services: localServices, startHooks: [], stopHooks: [] }
  if (env.NODE_ENV === 'production') return none
  const tsPath = resolve(rootDir, devContributorsFile)
  const path = [tsPath, tsPath.replace(/\.ts$/, '.js')].find((candidate) =>
    existsSync(candidate)
  )
  if (!path) return none
  const { createPlatformServices, serverStartHooks, serverStopHooks } =
    await loadUserModule(path)
  return {
    services: Object.assign(
      {},
      localServices,
      await createPlatformServices(env, localServices)
    ) as T & Record<string, any>,
    startHooks: serverStartHooks ?? [],
    stopHooks: serverStopHooks ?? [],
  }
}

/** `loadDevPlatformServices` for a caller that only wants the merged services. */
export const mergeDevPlatformServices = async <T extends Record<string, any>>(
  localServices: T,
  rootDir: string,
  devContributorsFile: string,
  env: Record<string, string | undefined> = process.env
): Promise<T & Record<string, any>> =>
  (
    await loadDevPlatformServices(
      localServices,
      rootDir,
      devContributorsFile,
      env
    )
  ).services
