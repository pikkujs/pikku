import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import {
  parseRuntimeDeclaration,
  resolvePackageTier,
  subpathForFile,
  type RuntimeDeclaration,
} from './runtime-tier.js'
import type { OwningPackage, PackageLookup } from './runtime-verify.js'

interface PackageRecord {
  dir: string
  name: string
  exports: unknown
  declaration?: RuntimeDeclaration
  problems: string[]
}

/**
 * Find the package that owns a file by walking up to the nearest `package.json`
 * with a name, and resolve its tier (honouring per-subpath overrides).
 *
 * Walking up rather than parsing `node_modules/<name>` is deliberate: a
 * workspace package is symlinked, so esbuild reports its real path with no
 * `node_modules` in it.
 *
 * An invalid declaration throws: a typo'd tier silently becoming the `server`
 * default is exactly the failure this exists to prevent.
 */
export function createPackageLookup(
  /** Absolute directory input keys are relative to (esbuild's absWorkingDir). */
  baseDir: string,
  readJson: (path: string) => unknown = (p) =>
    JSON.parse(readFileSync(p, 'utf-8'))
): PackageLookup {
  const byDir = new Map<string, PackageRecord | null>()

  const find = (startDir: string): PackageRecord | null => {
    const trail: string[] = []
    let dir = startDir
    let record: PackageRecord | null = null
    while (true) {
      if (byDir.has(dir)) {
        record = byDir.get(dir)!
        break
      }
      trail.push(dir)
      let pkg: Record<string, unknown> | undefined
      try {
        pkg = readJson(join(dir, 'package.json')) as Record<string, unknown>
      } catch {
        pkg = undefined
      }
      if (pkg && typeof pkg.name === 'string') {
        const { declaration, problems } = parseRuntimeDeclaration(pkg)
        record = {
          dir,
          name: pkg.name,
          exports: pkg.exports,
          declaration,
          problems,
        }
        byDir.set(dir, record)
        trail.pop()
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    for (const d of trail) byDir.set(d, record)
    return record
  }

  return (inputPath): OwningPackage | undefined => {
    const abs =
      inputPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(inputPath)
        ? inputPath
        : join(baseDir, inputPath)
    const record = find(dirname(abs))
    if (!record) return undefined
    if (record.problems.length > 0) {
      throw new Error(
        `Invalid "pikku" runtime declaration in ${join(record.dir, 'package.json')}:\n` +
          record.problems.map((p) => `  - ${p}`).join('\n')
      )
    }
    const rel = relative(record.dir, abs).split(sep).join('/')
    const subpath = subpathForFile(record.exports, rel)
    return {
      name: record.name,
      tier: resolvePackageTier(record.declaration, subpath),
      declaredIn: record.declaration
        ? join(record.dir, 'package.json')
        : undefined,
    }
  }
}
