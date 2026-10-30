import type { PikkuScaffoldFeature } from '../../types/config.js'
import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

export type ResolvedScaffoldFeature = {
  /** Whether to generate this surface at all. */
  enabled: boolean
  /** An explicit output path, or undefined to derive one from `pikkuDir`. */
  path?: string
  /**
   * The feature's own options, present only when the config object set one.
   * Absent keys are not filled in: the default belongs to the generator that
   * reads the option, so `true` and `{}` mean the same as before.
   */
  options?: Record<string, boolean | number>
}

const SCAFFOLD_FEATURE_KEYS = ['path']

/**
 * The options a feature takes beyond `path`, by name and value type. A feature
 * missing from this table takes none, and an option set on the wrong feature is
 * refused like any other unknown key.
 */
export const SCAFFOLD_FEATURE_OPTIONS: Record<
  string,
  Record<string, 'boolean' | 'number'>
> = {
  analytics: { originLock: 'boolean' },
  cors: { port: 'number' },
}

/**
 * Reads one `scaffold.<feature>` value.
 *
 * It answers two things and no more: whether the surface is generated, and
 * where the file goes. Whether a call needs a session is the function's own
 * declaration, its wiring, its scopes and its addon — never this flag, which
 * would only stack a coarser gate in front of the one already enforced.
 *
 * A bare string is refused rather than read as a path: under `boolean | object`
 * no string is valid, and guessing one into `path` would turn a typo into a
 * generated file nobody asked for.
 *
 * An unrecognised key is refused for the same reason, and `auth` is refused by
 * name. It was a real key once, and one a config can still be carrying: a
 * config that sets it is asking for a gate that no longer exists there, so
 * ignoring it silently would leave the file saying something untrue about the
 * surface it configures.
 */
export const resolveScaffoldFeature = (
  feature: string,
  value: PikkuScaffoldFeature | undefined
): ResolvedScaffoldFeature => {
  if (value === undefined || value === false) {
    return { enabled: false }
  }

  if (value === true) {
    return { enabled: true }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PikkuCLIConfigError(
      `pikku.config.json: scaffold.${feature} must be true, false, or an object ` +
        `like { "path": "src/${feature}.gen.ts" } — received ${JSON.stringify(value)}. ` +
        `A bare string is never a shorthand for a path.`
    )
  }

  for (const key of Object.keys(value)) {
    if (key === 'auth') {
      throw new PikkuCLIConfigError(
        `pikku.config.json: scaffold.${feature} no longer takes "auth" — a scaffold ` +
          `flag says whether a surface is generated, not who may call it. ` +
          `Authentication is declared on the function, its wiring, its scopes and ` +
          `its addon, and enforced there on every call. Remove the key.`
      )
    }
    const optionType = SCAFFOLD_FEATURE_OPTIONS[feature]?.[key]
    if (optionType) {
      const received = (value as Record<string, unknown>)[key]
      if (typeof received !== optionType) {
        throw new PikkuCLIConfigError(
          `pikku.config.json: scaffold.${feature}.${key} must be a ${optionType} — ` +
            `received ${JSON.stringify(received)}.`
        )
      }
      continue
    }
    if (!SCAFFOLD_FEATURE_KEYS.includes(key)) {
      const own = Object.keys(SCAFFOLD_FEATURE_OPTIONS[feature] ?? {})
      throw new PikkuCLIConfigError(
        `pikku.config.json: scaffold.${feature} has no "${key}" option — the only ` +
          `${own.length ? 'keys are "path" (overrides where the generated file is written) and ' + own.map((o) => `"${o}"`).join(', ') : 'key is "path", which overrides where the generated file is written'}.`
      )
    }
  }

  const options: Record<string, boolean | number> = {}
  for (const key of Object.keys(SCAFFOLD_FEATURE_OPTIONS[feature] ?? {})) {
    const received = (value as Record<string, unknown>)[key]
    if (received !== undefined) options[key] = received as boolean | number
  }

  return {
    enabled: true,
    path: value.path,
    ...(Object.keys(options).length > 0 ? { options } : {}),
  }
}

/**
 * Whether `scaffold.analytics` generates the origin lock on `/analytics`.
 * On by default: the ingest is unauthenticated, so by default only this app's
 * own browser origins may post to it.
 */
export const analyticsOriginLockEnabled = (
  scaffold: { analytics?: PikkuScaffoldFeature } | undefined
): boolean => {
  const analytics = resolveScaffoldFeature('analytics', scaffold?.analytics)
  return analytics.enabled && analytics.options?.originLock !== false
}
