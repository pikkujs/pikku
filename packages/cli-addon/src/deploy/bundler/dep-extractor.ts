/**
 * Extracts external dependency information from esbuild metafiles.
 *
 * Parses esbuild's metafile JSON to find all node_modules references,
 * then resolves their exact versions from the project's package.json
 * and/or yarn.lock to produce a minimal package.json.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Metafile } from 'esbuild'

/**
 * Extracts bare package names from esbuild metafile imports.
 *
 * When esbuild runs with `packages: 'external'`, external imports appear
 * in the metafile's outputs[].imports array with `external: true`.
 * This function collects all unique package names from those imports.
 */
export function extractExternalPackages(metafile: Metafile): Set<string> {
  const packages = new Set<string>()

  for (const output of Object.values(metafile.outputs)) {
    for (const imp of output.imports) {
      if (!imp.external) continue

      const pkgName = parsePackageName(imp.path)
      if (pkgName) {
        packages.add(pkgName)
      }
    }
  }

  return packages
}

/**
 * Parses a bare import specifier into a package name.
 *
 * Handles scoped packages (`@scope/pkg`) and deep imports (`pkg/sub/path`).
 * Returns null for relative imports or other non-package specifiers.
 */
export function parsePackageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return null
  }

  // Skip Node.js builtins (node:fs, crypto, etc.)
  if (specifier.startsWith('node:')) {
    return null
  }
  const builtins = new Set([
    'assert',
    'buffer',
    'child_process',
    'cluster',
    'console',
    'constants',
    'crypto',
    'dgram',
    'dns',
    'domain',
    'events',
    'fs',
    'http',
    'http2',
    'https',
    'inspector',
    'module',
    'net',
    'os',
    'path',
    'perf_hooks',
    'process',
    'punycode',
    'querystring',
    'readline',
    'repl',
    'stream',
    'string_decoder',
    'sys',
    'timers',
    'tls',
    'tty',
    'url',
    'util',
    'v8',
    'vm',
    'wasi',
    'worker_threads',
    'zlib',
    'async_hooks',
    'child_process',
    'cluster',
    'diagnostics_channel',
    'dns/promises',
    'fs/promises',
    'readline/promises',
    'stream/consumers',
    'stream/promises',
    'stream/web',
    'timers/promises',
    'util/types',
  ])
  if (builtins.has(specifier.split('/')[0])) {
    return null
  }

  // Scoped package: @scope/pkg or @scope/pkg/sub
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1]}`
  }

  // Regular package: pkg or pkg/sub/path
  return specifier.split('/')[0]
}

interface ProjectDeps {
  dependencies: Record<string, string>
  optionalDependencies: Record<string, string>
}

/**
 * Reads the project's package.json to build a version lookup map.
 */
async function readProjectDependencies(
  projectDir: string
): Promise<ProjectDeps> {
  const dependencies: Record<string, string> = {}
  const optionalDependencies: Record<string, string> = {}

  // Walk up the directory tree to find all package.json files
  // (handles monorepo setups where deps are in the root package.json)
  let dir = projectDir
  for (let i = 0; i < 10; i++) {
    try {
      const pkgJsonPath = join(dir, 'package.json')
      const content = await readFile(pkgJsonPath, 'utf-8')
      const pkg = JSON.parse(content) as {
        dependencies?: Record<string, string>
        optionalDependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      // Don't overwrite — closest package.json wins
      for (const [k, v] of Object.entries(pkg.dependencies ?? {})) {
        if (!(k in dependencies)) dependencies[k] = v
      }
      for (const [k, v] of Object.entries(pkg.optionalDependencies ?? {})) {
        if (!(k in optionalDependencies)) optionalDependencies[k] = v
      }
    } catch {
      // No package.json at this level
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }

  return { dependencies, optionalDependencies }
}

/**
 * Attempts to read a version from yarn.lock for a given package.
 *
 * Yarn classic and yarn berry have different lock file formats.
 * This function handles the yarn berry format (YAML-ish) used by Yarn 4+.
 */
async function readYarnLockVersions(
  projectDir: string
): Promise<Map<string, string>> {
  const versions = new Map<string, string>()

  try {
    const lockContent = await readFile(join(projectDir, 'yarn.lock'), 'utf-8')

    // Yarn berry format: lines like `  version: "1.2.3"`
    // preceded by a key line like `"pkg@npm:^1.0.0":`
    const lines = lockContent.split('\n')
    let currentPackages: string[] = []

    for (const line of lines) {
      // Key line: "pkg@npm:^1.0.0, pkg@npm:^1.2.0":
      // or: pkg@npm:^1.0.0:
      if (!line.startsWith(' ') && line.endsWith(':')) {
        currentPackages = parseYarnLockKeyLine(line)
      }

      // Version line: `  version: "1.2.3"` or `  version: 1.2.3`
      const versionMatch = line.match(/^\s+version:\s+"?([^"\s]+)"?/)
      if (versionMatch && currentPackages.length > 0) {
        const version = versionMatch[1]
        for (const pkg of currentPackages) {
          versions.set(pkg, version)
        }
        currentPackages = []
      }
    }
  } catch {
    // yarn.lock not found or unreadable — fall back to package.json versions
  }

  return versions
}

/**
 * Parses a yarn.lock key line into package names.
 *
 * Example inputs:
 *   `"esbuild@npm:^0.25.0":`  ->  ["esbuild"]
 *   `"@scope/pkg@npm:^1.0.0, @scope/pkg@npm:^1.2.0":`  ->  ["@scope/pkg"]
 */
function parseYarnLockKeyLine(line: string): string[] {
  const cleaned = line.replace(/:$/, '').replace(/"/g, '')
  const entries = cleaned.split(',').map((s) => s.trim())
  const names = new Set<string>()

  for (const entry of entries) {
    // Strip everything from @ that's part of version specifier
    // e.g., "esbuild@npm:^0.25.0" -> "esbuild"
    // e.g., "@scope/pkg@npm:^1.0.0" -> "@scope/pkg"
    const atIndex = entry.startsWith('@')
      ? entry.indexOf('@', 1)
      : entry.indexOf('@')

    if (atIndex > 0) {
      names.add(entry.substring(0, atIndex))
    }
  }

  return [...names]
}

/**
 * Resolves the exact version for a package, trying yarn.lock first,
 * then falling back to the version range from package.json.
 */
async function resolveInstalledPackageVersion(
  packageName: string,
  projectDir: string
): Promise<string | null> {
  let dir = projectDir
  while (true) {
    const pkgPath = join(dir, 'node_modules', packageName, 'package.json')
    try {
      const content = await readFile(pkgPath, 'utf-8')
      const pkg = JSON.parse(content) as { version?: string }
      if (pkg.version) return pkg.version
    } catch {
      // Keep walking up to workspace root
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

async function resolveVersion(
  packageName: string,
  projectDeps: ProjectDeps,
  yarnLockVersions: Map<string, string>,
  projectDir: string
): Promise<string | null> {
  // Prefer exact version from yarn.lock
  const locked = yarnLockVersions.get(packageName)
  if (locked) return locked

  // Fall back to package.json version (may be a range)
  const fromDeps = projectDeps.dependencies[packageName]
  if (fromDeps) return fromDeps

  const fromOptionalDeps = projectDeps.optionalDependencies[packageName]
  if (fromOptionalDeps) return fromOptionalDeps

  const installedVersion = await resolveInstalledPackageVersion(
    packageName,
    projectDir
  )
  if (installedVersion) return installedVersion

  return null
}

/**
 * Given an esbuild metafile, extracts all external packages and resolves
 * their versions from the project's dependency files.
 *
 * Returns a record of package name to exact version, suitable for
 * writing into a minimal package.json.
 */
export async function extractDependencies(
  metafile: Metafile,
  projectDir: string
): Promise<{
  exactDependencies: Record<string, string>
  exactOptionalDependencies: Record<string, string>
}> {
  const externalPackages = extractExternalPackages(metafile)

  if (externalPackages.size === 0) {
    return { exactDependencies: {}, exactOptionalDependencies: {} }
  }

  const [projectDeps, yarnLockVersions] = await Promise.all([
    readProjectDependencies(projectDir),
    readYarnLockVersions(projectDir),
  ])

  const exactDependencies: Record<string, string> = {}
  const exactOptionalDependencies: Record<string, string> = {}

  for (const pkg of [...externalPackages].sort()) {
    const version = await resolveVersion(
      pkg,
      projectDeps,
      yarnLockVersions,
      projectDir
    )
    if (!version) {
      // Some packages are optional-at-runtime (e.g. ws acceleration addons).
      // Keep deploy planning deterministic without forcing a hard failure.
      exactOptionalDependencies[pkg] = '*'
      continue
    }
    if (pkg in projectDeps.optionalDependencies) {
      exactOptionalDependencies[pkg] = version
    } else {
      exactDependencies[pkg] = version
    }
  }

  return { exactDependencies, exactOptionalDependencies }
}

/**
 * Generates a minimal package.json content object for a unit bundle.
 */
export function generateMinimalPackageJson(
  unitName: string,
  dependencies: Record<string, string>,
  optionalDependencies: Record<string, string>
): Record<string, unknown> {
  return {
    name: unitName,
    private: true,
    type: 'module',
    main: 'bundle.js',
    dependencies,
    optionalDependencies,
  }
}
