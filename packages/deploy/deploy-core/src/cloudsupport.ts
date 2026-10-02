/**
 * What the cloudsupport data (github.com/pikkujs/cloudsupport) says about a
 * package: which edge platforms and serverless runtimes it is vetted on, per
 * version range, with optional per-subpath overrides.
 *
 * It maps onto the runtime tiers: a package vetted on any edge platform is
 * `edge`, one vetted for serverless is `serverless`, anything else is `server`.
 * Edge support implies serverless support, so the tiers still nest.
 */
import semver from 'semver'

import type { RuntimeDeclaration, RuntimeTier } from './runtime-tier.js'

export interface CloudSupportBlock {
  /** `false`, or the edge platforms the package is verified on. */
  edge: false | string[]
  serverless: boolean
}

export interface CloudSupportEntry {
  /** A semver range matched against the installed version. */
  versions: string
  cloud: CloudSupportBlock
  /** Per-subpath overrides, keyed like `package.json` `exports`. */
  exports?: Record<string, { cloud: CloudSupportBlock }>
  runtime?: string[]
  reason?: string
}

export interface CloudSupportData {
  schemaVersion: number
  packages: Record<string, CloudSupportEntry[]>
}

export const tierOfCloud = (cloud: CloudSupportBlock): RuntimeTier =>
  Array.isArray(cloud.edge) && cloud.edge.length > 0
    ? 'edge'
    : cloud.serverless
      ? 'serverless'
      : 'server'

export const entryToDeclaration = (
  entry: CloudSupportEntry
): RuntimeDeclaration => ({
  runtime: tierOfCloud(entry.cloud),
  ...(entry.exports && Object.keys(entry.exports).length > 0
    ? {
        exports: Object.fromEntries(
          Object.entries(entry.exports).map(([subpath, { cloud }]) => [
            subpath,
            tierOfCloud(cloud),
          ])
        ),
      }
    : {}),
})

export interface CloudSupportMatch {
  declaration: RuntimeDeclaration
  /** For messages: where the tier came from. */
  source: string
}

/**
 * The declaration for `name` at `version`, or undefined when the data does not
 * cover it. A package whose version is unknown matches only a `*` entry.
 */
export function cloudSupportFor(
  data: CloudSupportData,
  name: string,
  version: string | undefined
): CloudSupportMatch | undefined {
  const entries = data.packages[name]
  if (!entries) return undefined
  const known = version !== undefined && semver.valid(version) !== null
  const entry = entries.find((e) =>
    known
      ? semver.satisfies(version!, e.versions, { includePrerelease: true })
      : e.versions === '*'
  )
  if (!entry) return undefined
  return {
    declaration: entryToDeclaration(entry),
    source: `cloudsupport ${name}@${entry.versions}`,
  }
}
