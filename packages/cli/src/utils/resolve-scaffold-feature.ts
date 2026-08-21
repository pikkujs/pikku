import type { PikkuScaffoldFeature } from '../../types/config.js'
import { PikkuCLIConfigError } from './pikku-cli-config-error.js'

export type ResolvedScaffoldFeature = {
  /** Whether to generate this surface at all. */
  enabled: boolean
  /** An explicit output path, or undefined to derive one from `pikkuDir`. */
  path?: string
}

const SCAFFOLD_FEATURE_KEYS = ['path']

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
    if (!SCAFFOLD_FEATURE_KEYS.includes(key)) {
      throw new PikkuCLIConfigError(
        `pikku.config.json: scaffold.${feature} has no "${key}" option — the only ` +
          `key is "path", which overrides where the generated file is written.`
      )
    }
  }

  return {
    enabled: true,
    path: value.path,
  }
}
