/**
 * Runtime tiers: where a package, or a deployed unit, is allowed to run.
 *
 * Each tier is a superset of the one before it:
 *
 * - `edge`: Web APIs only. No `node:*`, no `process`, no `Buffer`.
 * - `serverless`: the built-ins the provider supplies (`nodejs_compat`, Lambda).
 * - `server`: a full Node container. Anything goes.
 *
 * A package declares its tier in `package.json`:
 *
 *     "pikku": { "runtime": "edge", "exports": { "./dev": "server" } }
 *
 * `server` is the default. Nothing is edge or serverless until it says so.
 */

export const RUNTIME_TIERS = ['edge', 'serverless', 'server'] as const

export type RuntimeTier = (typeof RUNTIME_TIERS)[number]

export const DEFAULT_RUNTIME_TIER: RuntimeTier = 'server'

export interface RuntimeDeclaration {
  /** The tier of the package as a whole. */
  runtime: RuntimeTier
  /**
   * Per-subpath overrides, keyed like `package.json` `exports` (`./dev`,
   * `./services/*`). A package that is mostly edge-capable can mark its few
   * Node-only subpaths `server` instead of dropping the whole package.
   */
  exports?: Record<string, RuntimeTier>
}

export class RuntimeDeclarationError extends Error {
  constructor(
    readonly source: string,
    readonly problems: string[]
  ) {
    super(
      `Invalid "pikku" runtime declaration in ${source}:\n` +
        problems.map((p) => `  - ${p}`).join('\n')
    )
    this.name = 'RuntimeDeclarationError'
  }
}

export const isRuntimeTier = (value: unknown): value is RuntimeTier =>
  typeof value === 'string' &&
  (RUNTIME_TIERS as readonly string[]).includes(value)

/** Higher is more capable (and less portable). */
export const tierRank = (tier: RuntimeTier): number =>
  RUNTIME_TIERS.indexOf(tier)

/** Whether code of tier `code` may run in a unit that targets `target`. */
export const tierFitsWithin = (code: RuntimeTier, target: RuntimeTier) =>
  tierRank(code) <= tierRank(target)

/** The weakest guarantee among `tiers`: the most demanding one. `edge` when empty. */
export const weakestTier = (tiers: Iterable<RuntimeTier>): RuntimeTier => {
  let weakest: RuntimeTier = 'edge'
  for (const tier of tiers) {
    if (tierRank(tier) > tierRank(weakest)) weakest = tier
  }
  return weakest
}

export interface ParsedRuntimeDeclaration {
  /** Undefined when the package.json has no `pikku.runtime`. */
  declaration?: RuntimeDeclaration
  problems: string[]
}

/**
 * Read `pikku.runtime` / `pikku.exports` out of a parsed package.json without
 * throwing. Other keys under `pikku` are not ours and are ignored.
 */
export function parseRuntimeDeclaration(
  packageJson: unknown
): ParsedRuntimeDeclaration {
  const pikku = (packageJson as { pikku?: unknown } | null | undefined)?.pikku
  if (pikku === undefined) return { problems: [] }
  if (pikku === null || typeof pikku !== 'object' || Array.isArray(pikku)) {
    return { problems: ['"pikku" must be an object'] }
  }

  const { runtime, exports } = pikku as {
    runtime?: unknown
    exports?: unknown
  }
  const problems: string[] = []
  const options = RUNTIME_TIERS.join(' | ')

  if (runtime === undefined) {
    if (exports !== undefined) {
      problems.push(
        `"pikku.exports" needs "pikku.runtime" beside it to say what the rest of the package is (${options})`
      )
    }
    return { problems }
  }
  if (!isRuntimeTier(runtime)) {
    problems.push(
      `"pikku.runtime" is ${JSON.stringify(runtime)}; expected ${options}`
    )
  }

  let overrides: Record<string, RuntimeTier> | undefined
  if (exports !== undefined) {
    if (
      exports === null ||
      typeof exports !== 'object' ||
      Array.isArray(exports)
    ) {
      problems.push('"pikku.exports" must be an object of subpath to tier')
    } else {
      overrides = {}
      for (const [subpath, tier] of Object.entries(exports)) {
        if (subpath !== '.' && !subpath.startsWith('./')) {
          problems.push(
            `"pikku.exports" key ${JSON.stringify(subpath)} must be "." or start with "./"`
          )
        } else if (!isRuntimeTier(tier)) {
          problems.push(
            `"pikku.exports[${JSON.stringify(subpath)}]" is ${JSON.stringify(tier)}; expected ${options}`
          )
        } else {
          overrides[subpath] = tier
        }
      }
    }
  }

  if (problems.length > 0) return { problems }
  return {
    declaration: {
      runtime: runtime as RuntimeTier,
      ...(overrides && Object.keys(overrides).length > 0
        ? { exports: overrides }
        : {}),
    },
    problems,
  }
}

/** As {@link parseRuntimeDeclaration}, but throws {@link RuntimeDeclarationError}. */
export function readRuntimeDeclaration(
  packageJson: unknown,
  source: string
): RuntimeDeclaration | undefined {
  const { declaration, problems } = parseRuntimeDeclaration(packageJson)
  if (problems.length > 0) throw new RuntimeDeclarationError(source, problems)
  return declaration
}

/** Whether an `exports`-style pattern (`./a/*`) matches a subpath. */
function matchSubpath(pattern: string, subpath: string): number {
  if (pattern === subpath) return Infinity
  const star = pattern.indexOf('*')
  if (star === -1) return -1
  const prefix = pattern.slice(0, star)
  const suffix = pattern.slice(star + 1)
  if (
    subpath.length >= prefix.length + suffix.length &&
    subpath.startsWith(prefix) &&
    subpath.endsWith(suffix)
  ) {
    return prefix.length
  }
  return -1
}

export interface PackageTier {
  tier: RuntimeTier
  /** False when the package says nothing and the default applied. */
  declared: boolean
  /** Which part of the declaration decided it. */
  via: 'subpath' | 'package' | 'default'
  /** The override key that matched, when `via` is `subpath`. */
  matchedSubpath?: string
}

/**
 * The tier of one package, optionally narrowed to an export subpath. The most
 * specific matching override wins: an exact key beats a longer-prefix pattern
 * beats a shorter one beats the package-wide tier.
 */
export function resolvePackageTier(
  declaration: RuntimeDeclaration | undefined,
  subpath?: string
): PackageTier {
  if (!declaration) {
    return { tier: DEFAULT_RUNTIME_TIER, declared: false, via: 'default' }
  }
  if (subpath && declaration.exports) {
    let best: { key: string; score: number } | undefined
    for (const key of Object.keys(declaration.exports)) {
      const score = matchSubpath(key, subpath)
      if (score >= 0 && (!best || score > best.score)) best = { key, score }
    }
    if (best) {
      return {
        tier: declaration.exports[best.key]!,
        declared: true,
        via: 'subpath',
        matchedSubpath: best.key,
      }
    }
  }
  return { tier: declaration.runtime, declared: true, via: 'package' }
}

export interface UnitTier {
  tier: RuntimeTier
  /** The packages that set it: every one at the weakest tier found. */
  limitedBy: string[]
}

/**
 * The tier of a unit is the weakest tier among the packages it imports: one
 * serverless package makes the whole unit serverless. Packages that declare
 * nothing are left out; they are judged by the imports the bundle shows, not by
 * a default that would otherwise condemn every third-party package.
 */
export function resolveUnitTier(
  packages: Array<{ name: string; tier: RuntimeTier; declared: boolean }>
): UnitTier {
  const declared = packages.filter((p) => p.declared)
  const tier = weakestTier(declared.map((p) => p.tier))
  return {
    tier,
    limitedBy: [
      ...new Set(declared.filter((p) => p.tier === tier).map((p) => p.name)),
    ].sort(),
  }
}

type ExportTarget =
  string | null | { [condition: string]: ExportTarget } | ExportTarget[]

function collectTargets(target: ExportTarget, out: string[]): void {
  if (typeof target === 'string') out.push(target)
  else if (Array.isArray(target)) for (const t of target) collectTargets(t, out)
  else if (target && typeof target === 'object') {
    for (const t of Object.values(target)) collectTargets(t, out)
  }
}

/**
 * The export subpath (`./dev`) whose target is `relativeFile` (`dist/dev.js`),
 * or undefined when the file is internal to the package or no export reaches it.
 * A bundle's metafile names files, not subpaths, so this is how a per-subpath
 * override finds the file it covers.
 */
export function subpathForFile(
  exportsField: unknown,
  relativeFile: string
): string | undefined {
  const file = relativeFile.replace(/\\/g, '/').replace(/^\.\//, '')
  if (typeof exportsField === 'string') {
    return exportsField.replace(/^\.\//, '') === file ? '.' : undefined
  }
  if (!exportsField || typeof exportsField !== 'object') return undefined
  const entries = Object.entries(exportsField as Record<string, ExportTarget>)
  // A conditions-only object (`{ import, default }`) is the "." export.
  if (entries.length > 0 && entries.every(([k]) => !k.startsWith('.'))) {
    return subpathForFile({ '.': exportsField }, relativeFile)
  }
  for (const [subpath, target] of entries) {
    const targets: string[] = []
    collectTargets(target, targets)
    for (const t of targets) {
      const clean = t.replace(/^\.\//, '')
      if (!clean.includes('*')) {
        if (clean === file) return subpath
        continue
      }
      const [pre, post] = clean.split('*') as [string, string]
      if (
        file.length >= pre.length + post.length &&
        file.startsWith(pre) &&
        file.endsWith(post)
      ) {
        const matched = file.slice(pre.length, file.length - post.length)
        return subpath.replace('*', matched)
      }
    }
  }
  return undefined
}
