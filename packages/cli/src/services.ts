import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.js'
import { CreateSessionServices, CreateSingletonServices } from '@pikku/core'
import { LocalVariablesService } from '@pikku/core/services'
import { CLILogger } from './services/cli-logger.service.js'
import { getPikkuCLIConfig } from './utils/pikku-cli-config.js'
import { inspect, InspectorState } from '@pikku/inspector'
import { glob } from 'tinyglobby'
import path from 'path'

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
      const { rootDir, srcDirectories, filters } = cliConfig
      const wiringFiles = (
        await Promise.all(
          srcDirectories.map((dir) =>
            glob(`${path.join(rootDir, dir)}/**/*.ts`)
          )
        )
      ).flat()
      return await inspect(logger, wiringFiles, filters)
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

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async (_config, _singletonServices) => {
  return {}
}
