import { isAbsolute, resolve } from 'node:path'
import type { PlatformServiceContributor } from '@pikku/deploy'
import type { InspectorState } from '@pikku/inspector'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { loadUserModule } from '../../commands/load-user-project.js'
import {
  devContributorPlatform,
  serializeDevPlatformServices,
} from './serialize-dev-platform-services.js'

type ContributorRef = NonNullable<
  NonNullable<Config['dev']>['contributors']
>[number]

export const loadDevContributors = async (
  rootDir: string,
  refs: readonly ContributorRef[]
): Promise<PlatformServiceContributor[]> => {
  const contributors: PlatformServiceContributor[] = []
  for (const ref of refs) {
    const exportName = ref.export ?? 'default'
    const specifier =
      ref.module.startsWith('.') || isAbsolute(ref.module)
        ? resolve(rootDir, ref.module)
        : ref.module
    const loaded = await loadUserModule(specifier)
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
    devContributorPlatform(visitState.serviceAggregation.requiredServices)
  )
  await writeFileInDir(logger, config.devPlatformServicesFile, code)
}
