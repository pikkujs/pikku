import { ProviderError } from './provider-error.js'
import type { ProviderAddonScope, ProviderEnv } from './provider.types.js'

/**
 * The environment an addon's provider reads: only the names the addon
 * declares (and the names its `wireAddon` grants), each read from the host name
 * behind it. Reading any other name throws `env-denied`; listing the keys shows
 * only the allowed names the host has set.
 */
export const scopedEnv = (
  env: ProviderEnv | Readonly<Record<string, unknown>>,
  scope: ProviderAddonScope,
  providerName: string
): ProviderEnv => {
  const allowed = new Set(scope.env)
  const view: Record<string, unknown> = Object.create(null)
  for (const name of allowed) {
    const value = env[scope.envRename?.[name] ?? name]
    if (value !== undefined) view[name] = value
  }
  return new Proxy(Object.freeze(view), {
    get(target, property, receiver) {
      if (typeof property === 'string' && !allowed.has(property)) {
        throw new ProviderError(
          'env-denied',
          `Addon provider '${providerName}' read env '${property}', which addon '${scope.namespace}' does not declare with defineVariable or defineSecret.`
        )
      }
      return Reflect.get(target, property, receiver)
    },
  }) as ProviderEnv
}
