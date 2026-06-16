import { PROVIDER_REGISTRY, pluginDisplayName } from '@pikku/better-auth'
import type { AuthDefinition } from '@pikku/inspector'

export interface AuthMetaProvider {
  id: string
  displayName: string
  secretId: string
}

export interface AuthMetaPlugin {
  id: string
  displayName: string
}

/**
 * The contents of `auth-meta.gen.json` — the static description of a project's
 * Better Auth configuration the console SSO page reads (via getAuthProviders) to
 * show which social providers and plugins are enabled. Replaces the previous
 * runtime `setAuthRegistry`/`getAuthRegistry` mechanism with a generated file
 * following the `*-meta.gen.json` convention.
 */
export interface AuthMeta {
  basePath: string
  hasCredentials: boolean
  providers: AuthMetaProvider[]
  plugins: AuthMetaPlugin[]
}

/**
 * Builds the `auth-meta.gen.json` payload from the inspected auth definition.
 *
 * Only providers known to {@link PROVIDER_REGISTRY} are emitted (the same ones
 * the CLI wires a secret for); unknown keys (e.g. wired via the genericOAuth
 * plugin) are dropped since they have no secret metadata. Every plugin id from
 * the config is emitted, enriched with a display name.
 */
export const serializeAuthMeta = (
  definition: AuthDefinition,
  providers: string[]
): AuthMeta => ({
  basePath: definition.basePath,
  hasCredentials: definition.hasCredentials,
  providers: providers
    .filter((id) => id in PROVIDER_REGISTRY)
    .map((id) => {
      const def = (
        PROVIDER_REGISTRY as Record<
          string,
          (typeof PROVIDER_REGISTRY)[keyof typeof PROVIDER_REGISTRY]
        >
      )[id]!
      return { id, displayName: def.displayName, secretId: def.secretId }
    }),
  plugins: definition.plugins.map((id) => ({
    id,
    displayName: pluginDisplayName(id),
  })),
})
