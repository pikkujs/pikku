import { pikkuSessionlessFunc } from '#pikku/function'
import {
  diffSurface,
  snapshotSurface,
  type ReleaseDiffResult,
  type ReleaseSnapshotResult,
} from './release.js'

export type SemverInput = {
  against?: string
  emit?: boolean
  out?: string
  failOn?: string
}

export type SemverResult = ReleaseSnapshotResult | ReleaseDiffResult

/** Deprecated alias for `pikku release diff` / `pikku release snapshot`. */
export const pikkuSemver = pikkuSessionlessFunc<SemverInput, SemverResult>({
  func: async ({ config, logger }, input) => {
    if (input?.emit === true) {
      logger.warn('`pikku semver --emit` is now `pikku release snapshot`.')
      return snapshotSurface(config, { out: input.out })
    }
    logger.warn('`pikku semver` is now `pikku release diff`.')
    if (!input?.against) {
      throw new Error(
        "Nothing to compare against. Pass `--against <path|url>` — a `.pikku` directory, a snapshot file, or a snapshot URL — or `--emit` to produce this build's snapshot."
      )
    }
    return diffSurface(config, input)
  },
})
