import { readFile, lstat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** One installed `@pikku/*` package as it actually resolves on disk. */
export interface PikkuPackageVersion {
  name: string
  version: string
  /**
   * Resolved through a symlink — a yarn workspace or a `yarn link`ed checkout
   * rather than a published tarball. The framework is read-only during a build
   * run, so a linked package is code that may already have been modified, and a
   * finding describing it is describing something other than a release.
   */
  linked: boolean
}

export interface ReportEnvironment {
  packages: PikkuPackageVersion[]
  /**
   * The resolved `@pikku/*` versions are not all the same. Pinning the CLI does
   * not pin its `@pikku/*` dependencies, so a mixed tree is a common cause of
   * behaviour that looks like a framework bug.
   */
  versionSkew: boolean
  /** Any package is `linked` — see {@link PikkuPackageVersion.linked}. */
  linkedFramework: boolean
  node: string
  packageManager: string | null
  platform: string
}

/**
 * Walk up from `startDir` for the first `node_modules/@pikku` that holds
 * packages. A monorepo hoists to the root, an app installs locally, and either
 * way the nearest populated scope is the one that was loaded.
 *
 * Populated means holding something `readPikkuPackages` would read, so the
 * hidden entries it skips cannot qualify a scope either: a stray `.DS_Store` in
 * an empty nested scope would otherwise end the walk there and report a tree
 * with no packages in it.
 */
export async function findPikkuScope(startDir: string): Promise<string | null> {
  let dir = startDir
  while (true) {
    const candidate = join(dir, 'node_modules', '@pikku')
    if (existsSync(candidate)) {
      const entries = await readdir(candidate).catch(() => [])
      if (entries.some((entry) => !entry.startsWith('.'))) return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Versions read off the installed tree rather than out of `package.json`. A
 * range like `^0.12.35` says nothing about what ran, and the version that ran
 * is the only one worth reporting.
 */
export async function readPikkuPackages(
  scopeDir: string
): Promise<PikkuPackageVersion[]> {
  const entries = await readdir(scopeDir).catch(() => [])
  const packages: PikkuPackageVersion[] = []
  for (const entry of entries.sort()) {
    if (entry.startsWith('.')) continue
    const packageDir = join(scopeDir, entry)
    const manifest = join(packageDir, 'package.json')
    const raw = await readFile(manifest, 'utf8').catch(() => null)
    if (!raw) continue
    let version: unknown
    try {
      version = (JSON.parse(raw) as { version?: unknown }).version
    } catch {
      continue
    }
    if (typeof version !== 'string') continue
    const stats = await lstat(packageDir).catch(() => null)
    packages.push({
      name: `@pikku/${entry}`,
      version,
      linked: stats?.isSymbolicLink() ?? false,
    })
  }
  return packages
}

const LOCKFILES: [string, string][] = [
  ['yarn.lock', 'yarn'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
]

/**
 * `packageManager` in the nearest manifest is authoritative when it is set;
 * otherwise the lockfile is the only evidence of what installed the tree.
 */
export async function detectPackageManager(
  startDir: string
): Promise<string | null> {
  let dir = startDir
  while (true) {
    const manifest = join(dir, 'package.json')
    if (existsSync(manifest)) {
      const raw = await readFile(manifest, 'utf8').catch(() => null)
      if (raw) {
        try {
          const declared = (JSON.parse(raw) as { packageManager?: unknown })
            .packageManager
          if (typeof declared === 'string' && declared.length > 0) {
            return declared
          }
        } catch {
          // An unparseable manifest tells us nothing; keep walking up.
        }
      }
    }
    for (const [lockfile, manager] of LOCKFILES) {
      if (existsSync(join(dir, lockfile))) return manager
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Everything about the run a finding needs and no agent should be asked for.
 * All of it is a directory read — no network, no prompting.
 */
export async function collectReportEnvironment(
  startDir: string = process.cwd()
): Promise<ReportEnvironment> {
  const scope = await findPikkuScope(startDir)
  const packages = scope ? await readPikkuPackages(scope) : []
  const versions = new Set(packages.map((p) => p.version))
  return {
    packages,
    versionSkew: versions.size > 1,
    linkedFramework: packages.some((p) => p.linked),
    node: process.version,
    packageManager: await detectPackageManager(startDir),
    platform: `${process.platform}-${process.arch}`,
  }
}
