import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface DevPlatformServicesTarget {
  file: string
  packageMappings?: Record<string, string>
}

/**
 * The local services `pikku dev` has built before it calls
 * `createPlatformServices`, handed over as `runtime`.
 */
export const devRuntimeServices = (options: { db: boolean }): string[] => [
  'logger',
  'variables',
  'secrets',
  'schema',
  ...(options.db ? ['kysely'] : []),
]

const realpath = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const exportTargets = (entry: unknown): string[] => {
  if (typeof entry === 'string') return [entry]
  if (!entry || typeof entry !== 'object') return []
  return Object.values(entry).flatMap(exportTargets)
}

const reachableFrom = (fromDir: string, name: string, packageDir: string) => {
  const real = realpath(packageDir)
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(candidate) && realpath(candidate) === real) return true
    if (dir === dirname(dir)) return false
  }
}

const packageExportSpecifier = (
  path: string,
  fromDir: string
): string | undefined => {
  for (let dir = dirname(path); dir !== dirname(dir); dir = dirname(dir)) {
    const packageJson = join(dir, 'package.json')
    if (!existsSync(packageJson)) continue
    const { name, exports } = JSON.parse(readFileSync(packageJson, 'utf-8'))
    if (!name || !exports || typeof exports !== 'object') return undefined
    if (!reachableFrom(fromDir, name, dir)) return undefined
    const target = posix.normalize(relative(dir, path).replace(/\\/g, '/'))
    for (const [subpath, entry] of Object.entries<unknown>(exports)) {
      if (subpath !== '.' && !subpath.startsWith('./')) continue
      if (subpath.includes('*')) continue
      if (exportTargets(entry).some((t) => posix.normalize(t) === target)) {
        return `${name}${subpath.slice(1)}`
      }
    }
    return undefined
  }
  return undefined
}

export const localSpecifier = (
  specifier: string,
  target: DevPlatformServicesTarget
): string => {
  const path = specifier.startsWith('file:')
    ? fileURLToPath(specifier)
    : isAbsolute(specifier)
      ? specifier
      : undefined
  if (!path) return specifier
  return (
    packageExportSpecifier(path, dirname(target.file)) ??
    getFileImportRelativePath(target.file, path, target.packageMappings ?? {})
  )
}
