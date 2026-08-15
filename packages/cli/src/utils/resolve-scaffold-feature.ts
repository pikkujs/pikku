import type { PikkuScaffoldFeature } from '../../types/config.js'

export type ResolvedScaffoldFeature = {
  /** Whether to generate this surface at all. */
  enabled: boolean
  /** Whether the generated surface requires a session. */
  auth: boolean
  /** An explicit output path, or undefined to derive one from `pikkuDir`. */
  path?: string
}

const LEGACY_VALUES = new Set(['auth', 'no-auth'])

/**
 * Reads one `scaffold.<feature>` value.
 *
 * `true` means enabled **and authenticated**. A surface only becomes public by
 * writing `{ auth: false }`, so omitting the field can never open anything —
 * the failure mode of a forgotten flag is a locked door, not an open one.
 *
 * knowledge: decisions/security/scaffold-features-are-authenticated-unless-opted-out.md
 */
export const resolveScaffoldFeature = (
  feature: string,
  value: PikkuScaffoldFeature | undefined
): ResolvedScaffoldFeature => {
  if (value === undefined || value === false) {
    return { enabled: false, auth: true }
  }

  if (typeof value === 'string') {
    throw new Error(legacyValueMessage(feature, value))
  }

  if (value === true) {
    return { enabled: true, auth: true }
  }

  if (typeof value !== 'object') {
    throw new Error(
      `pikku.config.json: scaffold.${feature} must be true, false, or an object ` +
        `like { "auth": false } — received ${JSON.stringify(value)}.`
    )
  }

  return {
    enabled: true,
    auth: value.auth !== false,
    path: value.path,
  }
}

/**
 * A legacy `'auth'`/`'no-auth'` is refused by name rather than coerced. The
 * value it would coerce to is exactly the one that caused the incident this
 * change came out of, and under the new shape a bare string is a plausible
 * path — so guessing would be wrong twice over.
 */
const legacyValueMessage = (feature: string, value: string): string => {
  const migrated =
    value === 'no-auth'
      ? '{ "auth": false }'
      : LEGACY_VALUES.has(value)
        ? 'true'
        : null

  if (!migrated) {
    return (
      `pikku.config.json: scaffold.${feature} must be true, false, or an object ` +
      `like { "auth": false } — received the string ${JSON.stringify(value)}.`
    )
  }

  return (
    `pikku.config.json: scaffold.${feature} is ${JSON.stringify(value)}, which is no longer a ` +
    `mode. Authentication is declared on the function or on the addon, and the ` +
    `scaffold flag only says whether the surface exists.\n` +
    `  Replace it with: "${feature}": ${migrated}\n` +
    `  \`true\` enables the surface with a session required; ` +
    `\`{ "auth": false }\` makes it public.`
  )
}
