import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, posix, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ContributorPlatform,
  EntryGenerationContext,
  PlatformServiceContributor,
} from '@pikku/deploy'
import {
  collectContributorImports,
  collectContributorLines,
  dedupeContributors,
} from '@pikku/deploy'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

const SERVICES_TYPE = 'Record<string, any>'

export interface DevPlatformServicesTarget {
  file: string
  packageMappings?: Record<string, string>
}

export const devContributorPlatform = (
  requiredServices: Iterable<string>
): ContributorPlatform => {
  const serviceNames = [...requiredServices]
  return {
    serviceNames,
    needsQueue: serviceNames.includes('queueService'),
    needsWorkflow: serviceNames.includes('workflowService'),
    needsAgent: serviceNames.includes('agentRunner'),
  }
}

const devContext = (unitDir: string): EntryGenerationContext =>
  ({
    unit: { name: 'dev', role: 'function', services: [] },
    unitDir,
    servicesType: SERVICES_TYPE,
  }) as unknown as EntryGenerationContext

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

const localSpecifier = (
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

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\2/g

export const rewriteImportSpecifiers = (
  line: string,
  target: DevPlatformServicesTarget
): string =>
  line.replace(
    SPECIFIER,
    (_match, prefix: string, quote: string, specifier: string) =>
      `${prefix}${quote}${localSpecifier(specifier, target)}${quote}`
  )

export const serializeDevPlatformServices = (
  contributors: readonly PlatformServiceContributor[],
  platform: ContributorPlatform,
  target?: DevPlatformServicesTarget
): string => {
  const unique = dedupeContributors(contributors)
  const ctx = devContext(target ? dirname(target.file) : '')
  const local = (lines: string[]) =>
    target ? lines.map((line) => rewriteImportSpecifiers(line, target)) : lines
  const imports = local(collectContributorImports(unique, platform, ctx))
  const lines = local(
    collectContributorLines(unique, { ctx, platform, isGateway: false })
  )
  return [
    ...imports,
    ...(imports.length > 0 ? [''] : []),
    `export const createPlatformServices = async (env: Record<string, string | undefined>): Promise<${SERVICES_TYPE}> => {`,
    `  const services: ${SERVICES_TYPE} = {}`,
    ...lines,
    `  return services`,
    `}`,
    ``,
  ].join('\n')
}
