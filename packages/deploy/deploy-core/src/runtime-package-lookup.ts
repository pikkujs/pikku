import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

import { cloudSupportFor, type CloudSupportData } from './cloudsupport.js'
import { CLOUDSUPPORT } from './cloudsupport.data.js'
import {
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
  /** Where the declaration came from, for messages. */
  declaredIn?: string
}

/**
 * Find the package that owns a file by walking up to the nearest `package.json`
 * with a name, and resolve its tier (honouring per-subpath overrides).
 *
 * Walking up rather than parsing `node_modules/<name>` is deliberate: a
 * workspace package is symlinked, so esbuild reports its real path with no
 * `node_modules` in it.
 *
 * The tier comes from the cloudsupport data, by name and installed version. A
 * package the data does not cover is undeclared and gets the default tier.
 */
export function createPackageLookup(
  /** Absolute directory input keys are relative to (esbuild's absWorkingDir). */
  baseDir: string,
  readJson: (path: string) => unknown = (p) =>
    JSON.parse(readFileSync(p, 'utf-8')),
  support: CloudSupportData = CLOUDSUPPORT
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
        const vetted = cloudSupportFor(
          support,
          pkg.name,
          typeof pkg.version === 'string' ? pkg.version : undefined
        )
        record = {
          dir,
          name: pkg.name,
          exports: pkg.exports,
          declaration: vetted?.declaration,
          declaredIn: vetted?.source,
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
    const rel = relative(record.dir, abs).split(sep).join('/')
    const subpath = subpathForFile(record.exports, rel)
    return {
      name: record.name,
      tier: resolvePackageTier(record.declaration, subpath),
      declaredIn: record.declaredIn,
    }
  }
}
