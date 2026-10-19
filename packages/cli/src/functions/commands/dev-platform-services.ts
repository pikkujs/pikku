import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadUserModule } from './load-user-project.js'

/**
 * Merges the generated platform services over the local ones, before the
 * app's `createSingletonServices` sees them.
 *
 * Two files can exist: the one `dev.contributors` and package.json contributors
 * produce, and the one for the contributors the project opted in to with
 * `wireAddon`. The second is spread last, so a contributor that replaces a
 * baseline or earlier service wins.
 */
export const mergeDevPlatformServices = async <T extends Record<string, any>>(
  localServices: T,
  rootDir: string,
  devPlatformServicesFile: string,
  env: Record<string, string | undefined> = process.env,
  devContributorsFile?: string
): Promise<T & Record<string, any>> => {
  if (env.NODE_ENV === 'production') return localServices
  let services: Record<string, any> = localServices
  for (const file of [devPlatformServicesFile, devContributorsFile]) {
    if (!file) continue
    const tsPath = resolve(rootDir, file)
    const path = [tsPath, tsPath.replace(/\.ts$/, '.js')].find((candidate) =>
      existsSync(candidate)
    )
    if (!path) continue
    const { createPlatformServices } = await loadUserModule(path)
    services = Object.assign(
      {},
      services,
      await createPlatformServices(env, services)
    )
  }
  return services as T & Record<string, any>
}
