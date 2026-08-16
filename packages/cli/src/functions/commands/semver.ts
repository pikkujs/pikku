import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { loadManifest } from '../../utils/contract-versions.js'
import { loadSurface, readSurface, type Surface } from '../../utils/surface.js'
import {
  computeSurfaceDiff,
  type SurfaceChanges,
} from '../../utils/surface-diff.js'

/**
 * `pikku semver` — what does this build owe the clients of another one?
 *
 * The baseline is deliberately external: a deployed environment, not the
 * previous commit. Comparing against production is what makes the answer
 * actionable, and pointing `--against` somewhere else is how you ask the same
 * question about staging.
 */

export type SemverInput = {
  against?: string
  emit?: boolean
  out?: string
  failOn?: string
}

export type SemverResult =
  | { mode: 'emit'; surface: Surface; written: string | null }
  | ({ mode: 'compare'; written: string } & SurfaceChanges)

const FAIL_LEVELS = ['major', 'minor', 'patch'] as const
type FailLevel = (typeof FAIL_LEVELS)[number]

// Ordered by severity, so `--fail-on minor` also fails on major.
const SEVERITY: Record<FailLevel, number> = { patch: 0, minor: 1, major: 2 }

async function currentSurface(
  rootDir: string,
  outDir: string
): Promise<Surface> {
  const manifest = await loadManifest(join(rootDir, 'versions.pikku.json'))
  return readSurface(outDir, manifest)
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

export const pikkuSemver = pikkuSessionlessFunc<SemverInput, SemverResult>({
  func: async ({ config }, input) => {
    const outDir = resolve(config.rootDir, config.outDir)
    const out = input?.out ? resolve(config.rootDir, input.out) : null

    if (input?.emit === true) {
      const surface = await currentSurface(config.rootDir, outDir)
      if (out) writeJson(out, surface)
      return { mode: 'emit', surface, written: out }
    }

    const against = input?.against
    if (!against) {
      throw new Error(
        "Nothing to compare against. Pass `--against <path|url>` — a `.pikku` directory, a snapshot file, or a snapshot URL — or `--emit` to produce this build's snapshot."
      )
    }

    const [before, after] = await Promise.all([
      loadSurface(against),
      currentSurface(config.rootDir, outDir),
    ])

    const changes = computeSurfaceDiff(before, after, against)
    const changesPath = out ?? join(outDir, 'changes.gen.json')
    writeJson(changesPath, changes)

    const failOn = input?.failOn as FailLevel | undefined
    if (failOn) {
      if (!FAIL_LEVELS.includes(failOn)) {
        throw new Error(
          `--fail-on must be one of ${FAIL_LEVELS.join(', ')}, got '${failOn}'.`
        )
      }
      if (SEVERITY[changes.verdict] >= SEVERITY[failOn]) {
        throw new Error(
          `Release is ${changes.verdict} against ${against}, at or above --fail-on ${failOn}. See ${changesPath}.`
        )
      }
    }

    return { mode: 'compare', written: changesPath, ...changes }
  },
})
