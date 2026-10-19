import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadUserModule } from './load-user-project.js'

/**
 * Merges the generated platform services over the local ones, before the
 * app's `createSingletonServices` sees them. The file holds the contributors
 * the project opted in to with `wireAddon`; it is spread last, so a
 * contributor that replaces a baseline service wins.
 */
export const mergeDevPlatformServices = async <T extends Record<string, any>>(
  localServices: T,
  rootDir: string,
  devContributorsFile: string,
  env: Record<string, string | undefined> = process.env
): Promise<T & Record<string, any>> => {
  if (env.NODE_ENV === 'production') return localServices
  const tsPath = resolve(rootDir, devContributorsFile)
  const path = [tsPath, tsPath.replace(/\.ts$/, '.js')].find((candidate) =>
    existsSync(candidate)
  )
  if (!path) return localServices
  const { createPlatformServices } = await loadUserModule(path)
  return Object.assign(
    {},
    localServices,
    await createPlatformServices(env, localServices)
  ) as T & Record<string, any>
}
