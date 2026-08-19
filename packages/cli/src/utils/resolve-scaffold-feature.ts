import type { PikkuScaffoldFeature } from '../../types/config.js'

export type ResolvedScaffoldFeature = {
  /** Whether to generate this surface at all. */
  enabled: boolean
  /** An explicit output path, or undefined to derive one from `pikkuDir`. */
  path?: string
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

  if (typeof value !== 'object') {
    throw new Error(
      `pikku.config.json: scaffold.${feature} must be true, false, or an object ` +
        `like { "path": "src/${feature}.gen.ts" } — received ${JSON.stringify(value)}. ` +
        `A bare string is never a shorthand for a path.`
    )
  }

  return {
    enabled: true,
    path: value.path,
  }
}
