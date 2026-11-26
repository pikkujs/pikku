import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { isAbsolute, join, resolve } from 'node:path'
import { resolveEsmOnlyEntry } from '../../utils/resolve-esm-entry.js'
import { loadUserModule } from './load-user-project.js'

const resolveModule = (specifier: string, rootDir: string) => {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    const path = resolve(rootDir, specifier)
    return existsSync(path) ? path : undefined
  }
  const require = createRequire(join(rootDir, 'package.json'))
  try {
    return require.resolve(specifier)
  } catch {
    const entry = resolveEsmOnlyEntry(require, specifier)
    return entry && existsSync(entry) ? entry : undefined
  }
}

/**
 * Runs the platform services module the host named with `--platform-services`
 * over the local services, before the app's `createSingletonServices` sees them
 * as `existingServices`. What its `createPlatformServices` returns replaces
 * them.
 */
export const loadPlatformServicesOption = async <T extends Record<string, any>>(
  specifier: string | undefined,
  services: T,
  options: {
    rootDir: string
    env: Record<string, string | undefined>
    requiredServices: readonly string[]
  }
): Promise<T> => {
  if (!specifier) return services
  const path = resolveModule(specifier, options.rootDir)
  if (!path) {
    throw new Error(
      `--platform-services '${specifier}' was not found from ${options.rootDir}.`
    )
  }
  const { createPlatformServices } = await loadUserModule(path)
  if (typeof createPlatformServices !== 'function') {
    throw new Error(
      `--platform-services '${specifier}' does not export createPlatformServices.`
    )
  }
  const hosted: Record<string, unknown> = {
    ...(await createPlatformServices(
      options.env,
      { ...services },
      { requiredServices: [...options.requiredServices] }
    )),
  }
  return { ...services, ...hosted }
}
