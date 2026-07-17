import { readFile } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { glob } from 'tinyglobby'
import { ErrorCode } from '@pikku/inspector'

// Bounded globs (no unbounded `**`) covering the real @pikku/core copies each
// package manager keeps: hoisted root, bun (.bun), pnpm (.pnpm), and one level
// of npm/yarn nesting (both plain and scoped dependents).
const PATTERNS = [
  '@pikku/core/package.json',
  '.bun/@pikku+core@*/node_modules/@pikku/core/package.json',
  '.pnpm/@pikku+core@*/node_modules/@pikku/core/package.json',
  '*/node_modules/@pikku/core/package.json',
  '@*/*/node_modules/@pikku/core/package.json',
]

/**
 * Minimal semver range check for the shapes @pikku/cli publishes in its own
 * peerDependencies (exact, ^, ~, >=/>/<=/< comparators, space-joined ANDs,
 * || unions). Returns null when the range is not understood so the caller
 * skips the check instead of false-blocking a build. No prerelease handling —
 * a prerelease compares as its base version.
 */
export function coreSatisfiesRange(
  version: string,
  range: string
): boolean | null {
  const parse = (v: string): [number, number, number] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! - b[i]!
    return 0
  }
  const ver = parse(version)
  if (!ver) return null
  const comparator = (c: string): boolean | null => {
    const m = /^(\^|~|>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+)$/.exec(c.trim())
    if (!m) return null
    const op = m[1] ?? '='
    const bound = parse(m[2]!)!
    if (op === '>=') return cmp(ver, bound) >= 0
    if (op === '>') return cmp(ver, bound) > 0
    if (op === '<=') return cmp(ver, bound) <= 0
    if (op === '<') return cmp(ver, bound) < 0
    if (op === '=') return cmp(ver, bound) === 0
    if (cmp(ver, bound) < 0) return false
    // upper bound: ^ bumps the leftmost non-zero part; ~ bumps the minor
    let upper: [number, number, number]
    if (op === '~') upper = [bound[0], bound[1] + 1, 0]
    else if (bound[0] > 0) upper = [bound[0] + 1, 0, 0]
    else if (bound[1] > 0) upper = [0, bound[1] + 1, 0]
    else upper = [0, 0, bound[2] + 1]
    return cmp(ver, upper) < 0
  }
  for (const clause of range.split('||')) {
    const comparators = clause.trim().split(/\s+/).filter(Boolean)
    if (comparators.length === 0) continue
    const results = comparators.map(comparator)
    if (results.includes(null)) return null
    if (results.every(Boolean)) return true
  }
  return false
}

// The CLI's own package.json — version + declared @pikku/core peer range.
// Dual path like get-cli-version.ts: ../../ from src/, ../../../ from dist/src/.
async function getCliManifest(): Promise<{
  version: string
  corePeerRange: string
} | null> {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const rel of ['../..', '../../..']) {
    const raw = await readFile(
      path.join(here, rel, 'package.json'),
      'utf-8'
    ).catch(() => '')
    if (!raw) continue
    try {
      const pkg = JSON.parse(raw)
      if (pkg.name !== '@pikku/cli') continue
      const corePeerRange = pkg.peerDependencies?.['@pikku/core']
      if (typeof pkg.version === 'string' && typeof corePeerRange === 'string')
        return { version: pkg.version, corePeerRange }
    } catch {
      // Unparseable manifest — try the other layout.
    }
  }
  return null
}

/**
 * Fail the build when the installed @pikku/core cannot work with this CLI.
 *
 * Two distinct failure classes, checked in order:
 *
 * 1. SPLIT (PKU717): more than one @pikku/core version installed. Two module
 *    instances means two separate pikkuState registries at runtime — wirings
 *    (workflows, RPCs, queue workers, middleware) register into whichever copy
 *    the wiring files import, while the runner may read the other, so they
 *    silently fail to resolve (the classic symptom being `WorkflowNotFoundError`
 *    for a workflow that is plainly registered). Distinct versions are the
 *    reliable signal: package managers dedupe identical versions to one physical
 *    copy, so >1 version guarantees a split.
 *
 * 2. SKEW (PKU718): exactly one @pikku/core, but its version violates the CLI's
 *    own @pikku/core peer range. Some package managers (bun, yarn) install past
 *    an unsatisfied peer range instead of failing, and the resulting pair breaks
 *    codegen/runtime with cryptic missing-export errors. Fail here with the
 *    exact versions instead.
 */
export async function assertSingleCoreVersion(
  rootDir: string,
  logger: { warn: (message: string) => void }
): Promise<void> {
  const nodeModules = path.join(path.resolve(rootDir), 'node_modules')
  const found = await glob(PATTERNS, {
    cwd: nodeModules,
    absolute: true,
    onlyFiles: true,
  }).catch(() => [] as string[])

  // Dedupe by real path (symlinks/hoisting surface the same copy many times),
  // then map each physical copy to its version.
  const byRealPath = new Map<string, string>()
  for (const pkgJsonPath of found) {
    let real: string
    try {
      real = realpathSync(pkgJsonPath)
    } catch {
      real = pkgJsonPath
    }
    if (byRealPath.has(real)) continue
    const raw = await readFile(pkgJsonPath, 'utf-8').catch(() => '')
    if (!raw) continue
    try {
      const { version } = JSON.parse(raw)
      if (typeof version === 'string') byRealPath.set(real, version)
    } catch {
      // Unparseable package.json can't contribute a version — skip it.
    }
  }

  const versions = new Set(byRealPath.values())
  if (versions.size <= 1) {
    await assertCoreVersionInPeerRange([...versions][0], logger)
    return
  }

  const found_ = [...byRealPath.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([p, v]) => `  ${v}  ${path.dirname(p)}`)
    .join('\n')

  const message =
    `[${ErrorCode.DUPLICATE_CORE_VERSION}] Multiple @pikku/core versions installed: ${[...versions].sort().join(', ')}.\n` +
    `A split @pikku/core means two separate pikkuState registries at runtime — wirings\n` +
    `(workflows, RPCs, queue workers, middleware) register into one copy while the runner\n` +
    `reads another, so they silently fail to resolve (e.g. WorkflowNotFoundError, missing\n` +
    `RPCs). Every @pikku/* package must resolve to a single @pikku/core.\n\n` +
    `Found:\n${found_}\n\n` +
    `Fix: align all @pikku/* dependencies to the same release (bump them together), or pin\n` +
    `@pikku/core via your package manager's overrides/resolutions, then reinstall so a\n` +
    `single copy is deduped. Set PIKKU_ALLOW_DUPLICATE_CORE=1 to downgrade this to a warning.`

  if (process.env?.PIKKU_ALLOW_DUPLICATE_CORE) {
    logger.warn(message)
    return
  }
  throw new Error(message)
}

// SKEW (PKU718): a single installed core that violates the CLI's own peer range.
async function assertCoreVersionInPeerRange(
  coreVersion: string | undefined,
  logger: { warn: (message: string) => void }
): Promise<void> {
  if (!coreVersion) return // no core found — nothing to validate against
  const cli = await getCliManifest()
  if (!cli) return // manifest not found/parseable — never false-block a build
  const ok = coreSatisfiesRange(coreVersion, cli.corePeerRange)
  if (ok !== false) return // satisfied, or range not understood — skip

  const message =
    `[${ErrorCode.CORE_VERSION_SKEW}] @pikku/cli@${cli.version} requires @pikku/core@${cli.corePeerRange} ` +
    `(peerDependencies), but ${coreVersion} is installed.\n` +
    `Some package managers (bun, yarn) install past an unsatisfied peer range instead of\n` +
    `failing, and a cli/core version skew breaks codegen and runtime with cryptic\n` +
    `missing-export errors.\n\n` +
    `Fix: @pikku/cli and @pikku/core move together — bump both to the same release (update\n` +
    `any overrides/resolutions pins too), then reinstall. Set PIKKU_ALLOW_CORE_SKEW=1 to\n` +
    `downgrade this to a warning if you have verified the installed pair is compatible.`

  if (process.env?.PIKKU_ALLOW_CORE_SKEW) {
    logger.warn(message)
    return
  }
  throw new Error(message)
}
