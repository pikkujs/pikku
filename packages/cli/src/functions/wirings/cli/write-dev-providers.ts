import type { InspectorState } from '@pikku/inspector'
import { removeFileInDir, writeFileInDir } from '../../../utils/file-writer.js'
import type { Config } from '../../../../types/application-types.js'
import type { CLILogger } from '../../../services/cli-logger.service.js'
import { resolveProviders } from '../../../providers/resolve-providers.js'
import { serializeProviderRunner } from '../../../providers/serialize-provider-runner.js'
import { devBaselineServices, localSpecifier } from './dev-specifier.js'

/**
 * The keys `pikku dev` holds when its services run, for a project's state: the
 * same ones `dev.ts` injects, with `kysely` and `agentRunner` as it decides
 * them.
 */
export const devBaselineFor = (
  config: Pick<Config, 'db'>,
  state: Pick<InspectorState, 'agents' | 'serviceAggregation'>,
  host: 'dev' | 'serve' = 'dev'
): string[] =>
  devBaselineServices({
    credentials: host === 'dev',
    db: config.db !== undefined,
    agents:
      Object.keys(state.agents.agentsMeta).length > 0 ||
      state.serviceAggregation.requiredServices.has('agentRunner'),
  })

/**
 * Writes the dev runner for the services the project declares with
 * `defineProvider` and opted in to with `wireAddon({ services })`, and removes a
 * stale one when there are none. `loadDevProviders` runs it.
 */
export const writeDevProviders = async (
  logger: CLILogger,
  config: Config,
  visitState: InspectorState
): Promise<void> => {
  const file = config.devProvidersFile
  if (
    config.addon ||
    (Object.keys(visitState.providers ?? {}).length === 0 &&
      Object.keys(visitState.optedInProviders ?? {}).length === 0)
  ) {
    await removeFileInDir(logger, file, { logRemove: false })
    return
  }

  const { ordered } = resolveProviders({
    state: visitState,
    rootDir: config.rootDir,
    target: 'dev',
    baseline: devBaselineFor(config, visitState),
    requiredServices: visitState.serviceAggregation.requiredServices,
    factoryServices: visitState.projectServicesRead,
    targetLabel: 'pikku dev',
  })
  if (ordered.length === 0) {
    await removeFileInDir(logger, file, { logRemove: false })
    return
  }
  const target = { file, packageMappings: config.packageMappings }
  await writeFileInDir(
    logger,
    file,
    serializeProviderRunner({
      target: 'dev',
      services: ordered,
      specifier: (module) => localSpecifier(module, target),
    })
  )
}
