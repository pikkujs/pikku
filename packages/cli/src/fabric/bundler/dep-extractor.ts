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
  devDependencies: Record<string, string>
}

/**
 * Reads the project's package.json to build a version lookup map.
 */
async function readProjectDependencies(
  projectDir: string
): Promise<ProjectDeps> {
  const pkgJsonPath = join(projectDir, 'package.json')
  const content = await readFile(pkgJsonPath, 'utf-8')
  const pkg = JSON.parse(content) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  return {
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {},
  }
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
function resolveVersion(
  packageName: string,
  projectDeps: ProjectDeps,
  yarnLockVersions: Map<string, string>
): string {
  // Prefer exact version from yarn.lock
  const locked = yarnLockVersions.get(packageName)
  if (locked) return locked

  // Fall back to package.json version (may be a range)
  const fromDeps = projectDeps.dependencies[packageName]
  if (fromDeps) return fromDeps

  const fromDevDeps = projectDeps.devDependencies[packageName]
  if (fromDevDeps) return fromDevDeps

  // Last resort: use wildcard (will get latest on install)
  return '*'
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
): Promise<Record<string, string>> {
  const externalPackages = extractExternalPackages(metafile)

  if (externalPackages.size === 0) {
    return {}
  }

  const [projectDeps, yarnLockVersions] = await Promise.all([
    readProjectDependencies(projectDir),
    readYarnLockVersions(projectDir),
  ])

  const dependencies: Record<string, string> = {}

  for (const pkg of [...externalPackages].sort()) {
    dependencies[pkg] = resolveVersion(pkg, projectDeps, yarnLockVersions)
  }

  return dependencies
}

/**
 * Generates a minimal package.json content object for a worker bundle.
 */
export function generateMinimalPackageJson(
  workerName: string,
  dependencies: Record<string, string>
): Record<string, unknown> {
  return {
    name: workerName,
    private: true,
    type: 'module',
    main: 'bundle.js',
    dependencies,
  }
}
