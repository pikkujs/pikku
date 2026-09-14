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

  /** Which declaration put each resolution there, for the collision message. */
  const claimedBy: Record<string, string> = {}

  for (const name of names) {
    const override = overrides?.[name]
    const resolved =
      (typeof override === 'string' ? override : override?.name) ?? name

    const mode =
      (typeof override === 'object' ? override.mode : undefined) ??
      declared?.[name]?.type
    const resolution: CredentialResolution =
      mode === 'singleton' ? { mode: 'singleton' } : { mode: 'wire' }

    const existing = resolutions[resolved]
    if (existing && existing.mode !== resolution.mode) {
      throw new Error(
        `Credentials '${claimedBy[resolved]}' and '${name}' both resolve to '${resolved}' ` +
          `but disagree on how it is read: '${existing.mode}' and '${resolution.mode}'. ` +
          `Only one mode can win, so the loser would silently read the other's ` +
          `value — a per-user credential served from the deployment's own account, ` +
          `or the reverse. Give them separate names, or wire both to the same mode.`
      )
    }

    resolutions[resolved] = resolution
    claimedBy[resolved] = name
  }

  return resolutions
}
