import type { Config, SingletonServices } from '../types/application-types.js'
import { CreateSingletonServices } from '@pikku/core'
import { LocalVariablesService } from '@pikku/core/services'
import { CLILogger } from './services/cli-logger.service.js'
import { getPikkuCLIConfig } from './utils/pikku-cli-config.js'
import { inspectorGlob } from './functions/inspector-glob.js'
import { InspectorState } from '@pikku/inspector'

/**
 * Singleton services factory for the Pikku CLI
 * This function creates the singleton services used by the CLI and is created once on start.
 */
export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config) => {
  const logger = new CLILogger({ logLogo: true, silent: false })
  const variables = new LocalVariablesService()

  const cliConfig = await getPikkuCLIConfig(
    config.configFile,
    [],
    {
      tags: config.tags,
      types: config.types,
      directories: config.directories,
    },
    true
  )

  let inspectorState: InspectorState | undefined = undefined
  const getInspectorState = async (refresh: boolean = false) => {
    if (refresh || !inspectorState) {
      // Call inspectorGlob as a pikku function
      inspectorState = await inspectorGlob.invoke(
        { logger, variables, config, cliConfig, getInspectorState },
        {
          rootDir: cliConfig.rootDir,
          srcDirectories: cliConfig.srcDirectories,
          filters: cliConfig.filters,
        }
      )
    }
    return inspectorState!
  }

  return {
    config,
    logger,
    variables,
    cliConfig,
    getInspectorState,
  }
}
