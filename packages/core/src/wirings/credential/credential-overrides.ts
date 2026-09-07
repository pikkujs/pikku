import type { CredentialResolution } from '../../services/credential-wire-service.js'

/**
 * How one credential is wired into a deployment. A bare string renames it, as
 * it always has. The object form also decides where its value is read from,
 * which is what lets one addon serve a per-user product and a single team
 * account without the addon author choosing for both.
 */
export type CredentialOverride =
  | string
  | {
      /** The key this deployment holds the value under. */
      name?: string
      /** `wire` is per user, `singleton` is one value for the deployment. */
      mode?: 'singleton' | 'wire'
      /** Reads the value from this secret instead. Static, so it is never refreshed for you. */
      secret?: string
    }

export type CredentialOverrides = Record<string, CredentialOverride>

/** The rename half, in the `Record<string, string>` shape the alias path wants. */
export const credentialOverrideAliases = (
  overrides: CredentialOverrides | undefined
): Record<string, string> => {
  const aliases: Record<string, string> = {}
  for (const [name, override] of Object.entries(overrides ?? {})) {
    const target = typeof override === 'string' ? override : override.name
    if (target) {
      aliases[name] = target
    }
  }
  return aliases
}

/**
 * Where each credential the package declared is read from, keyed by the
 * resolved name so the wire service can look it up without re-aliasing.
 *
 * A credential with no override keeps the type its author declared, which is
 * what makes an addon that reads one way work under either wiring.
 */
export const buildCredentialResolutions = (
  declared: Record<string, { type?: string }> | null | undefined,
  overrides: CredentialOverrides | undefined
): Record<string, CredentialResolution> => {
  const resolutions: Record<string, CredentialResolution> = {}
  const names = new Set([
    ...Object.keys(declared ?? {}),
    ...Object.keys(overrides ?? {}),
  ])

  for (const name of names) {
    const override = overrides?.[name]
    const resolved =
      (typeof override === 'string' ? override : override?.name) ?? name

    if (typeof override === 'object' && override.secret) {
      resolutions[resolved] = { mode: 'secret', key: override.secret }
      continue
    }

    const mode =
      (typeof override === 'object' ? override.mode : undefined) ??
      declared?.[name]?.type
    resolutions[resolved] =
      mode === 'singleton' ? { mode: 'singleton' } : { mode: 'wire' }
  }

  return resolutions
}
