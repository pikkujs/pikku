import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.pikku',
  '.pikku-runtime',
  'coverage',
  '.next',
  '.yarn',
])

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
])

const IMPORT_PATTERN =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

type WorkspacePackage = {
  name: string
  dir: string
  exports: unknown
}

/**
 * Every target a single `exports` value can resolve to, in the order Node tries
 * them. Conditions collapse to their targets because a subpath that only
 * resolves under one condition still has to resolve under that condition.
 */
function targetsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(targetsOf)
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(targetsOf)
  }
  return []
}

/**
 * Node picks the pattern with the longest literal prefix, then the longest
 * suffix — so `./pikku/*.js` wins over `./pikku/*` for a `.js` specifier.
 */
function patternRank(key: string): [number, number] {
  const star = key.indexOf('*')
  if (star === -1) return [key.length, 0]
  return [star, key.length - star - 1]
}

function matchSubpath(
  exportsField: unknown,
  subpath: string
): { targets: string[]; key: string } | null {
  if (!exportsField || typeof exportsField !== 'object') return null
  const entries = Object.entries(exportsField as Record<string, unknown>)
  if (!entries.some(([key]) => key.startsWith('.'))) return null

  const exact = entries.find(([key]) => key === subpath)
  if (exact) return { targets: targetsOf(exact[1]), key: exact[0] }

  const candidates = entries
    .filter(([key]) => key.includes('*'))
    .map(([key, value]) => {
      const star = key.indexOf('*')
      const prefix = key.slice(0, star)
      const suffix = key.slice(star + 1)
      if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) return null
      if (subpath.length < prefix.length + suffix.length) return null
      const wildcard = subpath.slice(
        prefix.length,
        subpath.length - suffix.length
      )
      return { key, value, wildcard }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => {
      const [ap, as] = patternRank(a.key)
      const [bp, bs] = patternRank(b.key)
      return bp - ap || bs - as
    })

  const best = candidates[0]
  if (!best) return null
  return {
    targets: targetsOf(best.value).map((t) => t.replaceAll('*', best.wildcard)),
    key: best.key,
  }
}

async function collectWorkspacePackages(
  root: string,
  maxDepth = 5
): Promise<Map<string, WorkspacePackage>> {
  const packages = new Map<string, WorkspacePackage>()

  const visit = async (dir: string, depth: number): Promise<void> => {
    const pkg = await readJsonSafe<{ name?: string; exports?: unknown }>(
      join(dir, 'package.json')
    )
    if (pkg?.name) {
      packages.set(pkg.name, { name: pkg.name, dir, exports: pkg.exports })
    }
    if (depth >= maxDepth) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      await visit(join(dir, entry.name), depth + 1)
    }
  }

  await visit(root, 0)
  return packages
}

async function* sourceFiles(dir: string, depth = 0): AsyncGenerator<string> {
  if (depth > 8) return
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      yield* sourceFiles(full, depth + 1)
      continue
    }
    if (!entry.isFile()) continue
    const dot = entry.name.lastIndexOf('.')
    if (dot === -1) continue
    if (entry.name.includes('.gen.')) continue
    if (!SOURCE_EXTENSIONS.has(entry.name.slice(dot))) continue
    yield full
  }
}

function splitSpecifier(
  specifier: string,
  packages: Map<string, WorkspacePackage>
): { pkg: WorkspacePackage; subpath: string } | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null
  const parts = specifier.split('/')
  const name = specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : parts[0]!
  const pkg = packages.get(name)
  if (!pkg) return null
  const rest = specifier.slice(name.length)
  if (rest === '') return null
  return { pkg, subpath: `.${rest}` }
}

/**
 * Every workspace-internal subpath import must resolve through the owning
 * package's own `exports`.
 *
 * `exports` does not probe extensions the way a bundler alias does, so a map
 * like `"./pikku/*": "./src/pikku/*"` resolves `pkg/pikku/client.gen` to a file
 * called `client.gen` that was never written — the real file is `client.gen.ts`.
 * Nothing catches it while a `resolve.alias` in the consumer's own vite config
 * covers the same specifier: the alias wins locally, and the broken map only
 * surfaces where that config is not in play (a sandbox scaffold config, a
 * different bundler, plain node, another app in the same repo).
 */
export async function runWorkspaceExportsChecks(
  root: string
): Promise<ValidateFinding[]> {
  const packages = await collectWorkspacePackages(root)
  if (packages.size === 0) return []

  const findings: ValidateFinding[] = []
  const seen = new Set<string>()

  for await (const file of sourceFiles(root)) {
    let source: string
    try {
      source = await readFile(file, 'utf8')
    } catch {
      continue
    }
    if (!source.includes('from') && !source.includes('import(')) continue

    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[2]
      if (!specifier) continue
      const split = splitSpecifier(specifier, packages)
      if (!split) continue
      const { pkg, subpath } = split
      if (!pkg.exports) continue

      const resolved = matchSubpath(pkg.exports, subpath)
      const targets = resolved?.targets ?? []
      if (targets.some((t) => existsSync(join(pkg.dir, t)))) continue

      const key = `${pkg.name}${subpath.slice(1)}`
      if (seen.has(key)) continue
      seen.add(key)

      findings.push({
        id: 'workspace-subpath-not-exported',
        severity: 'error',
        message: resolved
          ? `"${specifier}" matches "${resolved.key}" in ${pkg.name}'s exports, but every target it maps to is missing: ${targets.join(', ')}.`
          : `"${specifier}" is not covered by any subpath in ${pkg.name}'s exports.`,
        path: relative(root, file) || file,
        fixHint: [
          `Make ${pkg.name} resolvable on its own — exports does not add file extensions,`,
          `so a target must name a file that exists (e.g. "./src/pikku/*.ts", or a`,
          `fallback array ["./src/pikku/*.ts", "./src/pikku/*.d.ts"]).`,
          `A resolve.alias in one consumer hides this everywhere else.`,
        ].join('\n'),
      })
    }
  }

  return findings
}
