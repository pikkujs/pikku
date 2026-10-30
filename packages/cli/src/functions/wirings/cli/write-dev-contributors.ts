import type { ContributorPlatform } from '@pikku/core/contributors'
import type { InspectorState } from '@pikku/inspector'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { buildContributorPlatform } from '../../../contributors/contributor-platform.js'
import { resolveTargetContributors } from '../../../contributors/resolve-contributors.js'
import { serializeContributors } from '../../../contributors/serialize-contributors.js'
import { devRuntimeServices, localSpecifier } from './dev-specifier.js'

/**
 * `kysely` is a dev baseline service exactly when the pikku config has a `db`,
 * since that is what makes `pikku dev` build one, while `platform.db` comes
 * from `createConfig` or the `db/<dialect>` folders. The two must agree: a
 * project that has a database on disk but none in its config would give
 * contributors a `platform.db` and no `kysely` to decorate.
 */
export const reconcileDevKysely = (
  platform: ContributorPlatform,
  configHasDb: boolean
): ContributorPlatform => {
  if (platform.db && !configHasDb) {
    throw new Error(
      `pikku dev: the project has a ${platform.db.engine} database (createConfig or db/${platform.db.engine}) but the pikku config has no \`db\`, so dev builds no kysely for the contributors to use. Set \`db\` in the pikku config or remove the database declaration.`
    )
  }
  return {
    ...platform,
    runtimeServices: devRuntimeServices({ db: configHasDb }),
  }
}

/**
 * Writes the dev file for the contributors the project opted in to with
 * `wireAddon({ contributors })`, and removes a stale one when there are none.
 * `mergeDevPlatformServices` loads it.
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

  const built = await buildContributorPlatform({
    projectDir: config.rootDir,
    pikkuDir: config.outDir,
    srcDirectories: config.srcDirectories,
    logger: { debug: (msg) => logger.debug(msg) },
    serviceNames: visitState.serviceAggregation.requiredServices,
    subject: 'pikku dev',
  })
  const platform = reconcileDevKysely(built, config.db !== undefined)
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
