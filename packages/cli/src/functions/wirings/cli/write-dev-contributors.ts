import type { InspectorState } from '@pikku/inspector'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { buildContributorPlatform } from '../../../contributors/contributor-platform.js'
import { resolveTargetContributors } from '../../../contributors/resolve-contributors.js'
import { serializeContributors } from '../../../contributors/serialize-contributors.js'
import {
  devRuntimeServices,
  localSpecifier,
} from './serialize-dev-platform-services.js'

/**
 * Writes the dev file for the contributors the project opted in to with
 * `wireAddon({ contributors })`, and removes a stale one when there are none.
 * It sits beside the file `dev.contributors` and package.json contributors
 * produce, and `mergeDevPlatformServices` loads both.
 */
export const writeDevContributors = async (
  logger: CLILogger,
  config: Config,
  visitState: InspectorState
): Promise<void> => {
  const file = config.devContributorsFile
  if (Object.keys(visitState.optedInContributors ?? {}).length === 0) {
    await removeFileInDir(logger, file, { logRemove: false })
    return
  }

  const platform = await buildContributorPlatform({
    projectDir: config.rootDir,
    pikkuDir: config.outDir,
    srcDirectories: config.srcDirectories,
    logger: { debug: (msg) => logger.debug(msg) },
    serviceNames: visitState.serviceAggregation.requiredServices,
    runtimeServices: devRuntimeServices({ db: config.db !== undefined }),
    subject: 'pikku dev',
  })
  const { ordered, skipped, withoutVariant } = await resolveTargetContributors({
    state: visitState,
    rootDir: config.rootDir,
    target: 'dev',
    platform,
  })
  for (const { name, reason } of skipped) {
    logger.debug(`Contributor '${name}' left out of dev: ${reason}`)
  }
  for (const name of withoutVariant) {
    logger.debug(`Contributor '${name}' has no dev variant`)
  }

  if (ordered.length === 0) {
    await removeFileInDir(logger, file, { logRemove: false })
    return
  }
  const target = { file, packageMappings: config.packageMappings }
  await writeFileInDir(
    logger,
    file,
    serializeContributors({
      contributors: ordered,
      platform,
      specifier: ({ module }) => localSpecifier(module, target),
    })
  )
}
