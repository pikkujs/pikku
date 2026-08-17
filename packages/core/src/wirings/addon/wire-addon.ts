import { pikkuState } from '../../pikku-state.js'
import { getTagGroups } from '../../utils.js'
import type { CorePikkuMiddleware } from '../../middleware/middleware.types.js'
export type WireAddonConfig = {
  name: string
  package: string
  rpcEndpoint?: string
  auth?: boolean
  mcp?: boolean
  tags?: string[]
  /** Required of every function in the addon, on top of the function's own. */
  scopes?: string[]
  secretOverrides?: Record<string, string>
  variableOverrides?: Record<string, string>
  credentialOverrides?: Record<string, string>
  /**
   * Secrets this instance may read on top of the ones it declared, named as the
   * addon reads them — the scope check runs before `secretOverrides` renames
   * them, so an overridden secret is named here by its addon-side key. Listing
   * one in `secretOverrides` grants it too.
   *
   * For an addon whose secret names come off its input rather than its own
   * source, this is how the host lends names the addon could not declare.
   */
  secretGrants?: string[]
  /** Credentials this instance may read on top of the ones it declared. */
  credentialGrants?: string[]
  /**
   * Hands this instance the whole `SecretService` instead of one scoped to the
   * secrets it declared. The value is the reason, recorded in the deploy
   * manifest — an addon that names secrets at runtime cannot be scoped, and
   * only the consuming app, never the addon, can grant it.
   */
  globalSecrets?: string
  /**
   * Hands this instance the whole `CredentialService` instead of one narrowed
   * to the credentials it declared. The value is the reason, recorded in the
   * deploy manifest, and only the consuming app can grant it.
   */
  globalCredentials?: string
}

export const wireAddon = (config: WireAddonConfig): void => {
  pikkuState(null, 'addons', 'packages').set(config.name, {
    package: config.package,
    rpcEndpoint: config.rpcEndpoint,
    auth: config.auth,
    tags: config.tags,
    ...(config.scopes ? { scopes: config.scopes } : {}),
    ...(config.secretOverrides
      ? { secretOverrides: config.secretOverrides }
      : {}),
    ...(config.variableOverrides
      ? { variableOverrides: config.variableOverrides }
      : {}),
    ...(config.credentialOverrides
      ? { credentialOverrides: config.credentialOverrides }
      : {}),
    ...(config.secretGrants ? { secretGrants: config.secretGrants } : {}),
    ...(config.credentialGrants
      ? { credentialGrants: config.credentialGrants }
      : {}),
    ...(config.globalSecrets ? { globalSecrets: config.globalSecrets } : {}),
    ...(config.globalCredentials
      ? { globalCredentials: config.globalCredentials }
      : {}),
  })
}

/**
 * The addon configs a running function is governed by: the named instance when
 * the caller resolved one, every instance of the package otherwise.
 *
 * knowledge: decisions/security/addon-scopes-are-resolved-where-the-function-runs.md
 */
const governingAddonConfigs = (
  packageName: string | null,
  namespace?: string
) => {
  if (!packageName) {
    return []
  }

  const addons = pikkuState(null, 'addons', 'packages')
  if (!addons) {
    return []
  }

  if (namespace) {
    const config = addons.get(namespace)
    if (config?.package === packageName) {
      return [config]
    }
  }

  return [...addons.values()].filter(
    (config) => config?.package === packageName
  )
}

const unionOf = (
  packageName: string | null,
  namespace: string | undefined,
  field: 'scopes' | 'tags'
): string[] => {
  const values = new Set<string>()
  for (const config of governingAddonConfigs(packageName, namespace)) {
    for (const value of config[field] ?? []) {
      values.add(value)
    }
  }
  return [...values]
}

/**
 * knowledge: decisions/security/addon-scopes-are-resolved-where-the-function-runs.md
 */
export const resolveAddonScopes = (
  packageName: string | null,
  namespace?: string
): string[] => unionOf(packageName, namespace, 'scopes')

/**
 * knowledge: decisions/security/addon-auth-and-tags-only-tighten.md
 */
export const resolveAddonTags = (
  packageName: string | null,
  namespace?: string
): string[] => unionOf(packageName, namespace, 'tags')

/**
 * True when any governing instance requires a session. `auth: false` is not
 * honoured here — on a direct wiring it would weaken the wiring's own gate.
 *
 * knowledge: decisions/security/addon-auth-and-tags-only-tighten.md
 */
export const resolveAddonAuth = (
  packageName: string | null,
  namespace?: string
): boolean =>
  governingAddonConfigs(packageName, namespace).some(
    (config) => config.auth === true
  )

/**
 * The package a namespaced function id belongs to, and the name that package
 * publishes it under.
 *
 * A wiring that points at an addon function through `ref('ns:fn')` records
 * `ns:fn` as its own function id — the same id every other wire type records —
 * but the addon publishes its metadata under the bare `fn`, in its own package
 * state. Without this the wire finds the function it registered and no metadata
 * to run it by.
 *
 * The wiring itself stays the consuming app's, so `packageName` is the package
 * the *wire* runs in, not the target's: it is null for a `ref()` the app wired,
 * and only narrows the lookup when a wire really does run inside the addon.
 */
export const resolveAddonFunctionTarget = (
  funcName: string,
  packageName: string | null
): { packageName: string; localName: string } | null => {
  const separator = funcName.indexOf(':')
  if (separator === -1) {
    return null
  }
  const namespace = funcName.slice(0, separator)
  const config = pikkuState(null, 'addons', 'packages').get(namespace)
  if (!config) {
    return null
  }
  if (packageName && config.package !== packageName) {
    return null
  }
  return {
    packageName: config.package,
    localName: funcName.slice(separator + 1),
  }
}

/**
 * Addon tags name middleware the *consuming app* registered, so they resolve
 * against the root tag groups rather than the addon package's own.
 *
 * knowledge: decisions/security/addon-auth-and-tags-only-tighten.md
 */
export const resolveAddonTagMiddleware = (
  packageName: string | null,
  namespace?: string
): CorePikkuMiddleware[] => {
  const tags = resolveAddonTags(packageName, namespace)
  if (tags.length === 0) {
    return []
  }

  const tagGroups = pikkuState(null, 'middleware', 'tagGroup')
  return tags.flatMap(
    (tag) => getTagGroups(tagGroups, tag).flat() as CorePikkuMiddleware[]
  )
}
