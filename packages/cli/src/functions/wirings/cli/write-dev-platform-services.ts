import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { PlatformServiceContributor } from '@pikku/deploy'
import type { InspectorState } from '@pikku/inspector'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { loadUserModule } from '../../commands/load-user-project.js'
import { resolveFromProject } from '../../../utils/resolve-from-project.js'
import {
  devContributorPlatform,
  serializeDevPlatformServices,
} from './serialize-dev-platform-services.js'

type ContributorRef = NonNullable<
  NonNullable<Config['dev']>['contributors']
>[number]

const IMPORT_CONDITIONS = ['import', 'node', 'default']

const importTarget = (entry: unknown): string | undefined => {
  if (typeof entry === 'string') return entry
  if (!entry || typeof entry !== 'object') return undefined
  for (const condition of IMPORT_CONDITIONS) {
    const target = importTarget((entry as Record<string, unknown>)[condition])
    if (target) return target
  }
  return undefined
}

const exportedImport = (exports: unknown, subpath: string) => {
  if (typeof exports === 'string') return subpath === '.' ? exports : undefined
  if (!exports || typeof exports !== 'object') return undefined
  const keyed = Object.keys(exports).some((key) => key.startsWith('.'))
  if (!keyed) return subpath === '.' ? importTarget(exports) : undefined
  return importTarget((exports as Record<string, unknown>)[subpath])
}

export const resolveContributorModule = (
  rootDir: string,
  specifier: string
): string => {
  if (specifier.startsWith('.') || isAbsolute(specifier)) {
    return resolve(rootDir, specifier)
  }
  const parts = specifier.split('/')
  const name = parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
  const subpath = `.${specifier.slice(name.length)}`
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const packageDir = join(dir, 'node_modules', name)
    const packageJson = join(packageDir, 'package.json')
    if (existsSync(packageJson)) {
      const { exports } = JSON.parse(readFileSync(packageJson, 'utf-8'))
      const target = exportedImport(exports, subpath)
      if (target) return join(packageDir, target)
      break
    }
    if (dir === dirname(dir)) break
  }
  const resolved = resolveFromProject(rootDir, specifier)
  if (resolved) return resolved
  throw new Error(
    `dev.contributors: cannot resolve '${specifier}' from ${rootDir}`
  )
}

export const loadDevContributors = async (
  rootDir: string,
  refs: readonly ContributorRef[]
): Promise<PlatformServiceContributor[]> => {
  const contributors: PlatformServiceContributor[] = []
  for (const ref of refs) {
    const exportName = ref.export ?? 'default'
    const loaded = await loadUserModule(
      resolveContributorModule(rootDir, ref.module)
    )
    const contributor = loaded[exportName]
    if (
      !contributor ||
      typeof contributor.name !== 'string' ||
      typeof contributor.emit !== 'function'
    ) {
      throw new Error(
        `dev.contributors: '${exportName}' exported by ${ref.module} is not a PlatformServiceContributor ({ name, emit })`
      )
    }
    contributors.push(contributor)
  }
  return contributors
}

/**
 * Writes the dev platform-services file from `dev.contributors`, and removes a
 * stale one when none are configured so a project without them generates
 * exactly what it did before.
 */
export const writeDevPlatformServices = async (
  logger: CLILogger,
  config: Config,
  visitState: InspectorState
): Promise<void> => {
  const refs = config.dev?.contributors ?? []
  if (refs.length === 0) {
    await removeFileInDir(logger, config.devPlatformServicesFile, {
      logRemove: false,
    })
    return
  }
  const contributors = await loadDevContributors(config.rootDir, refs)
  const code = serializeDevPlatformServices(
    contributors,
    devContributorPlatform(visitState.serviceAggregation.requiredServices),
    {
      file: config.devPlatformServicesFile,
      packageMappings: config.packageMappings,
    }
  )
  await writeFileInDir(logger, config.devPlatformServicesFile, code)
}
