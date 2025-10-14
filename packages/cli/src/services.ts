import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.js'
import {
  CreateConfig,
  CreateSessionServices,
  CreateSingletonServices,
  pikkuCLIRender,
} from '@pikku/core'
import { LocalVariablesService } from '@pikku/core/services'
import { CLILogger } from './services/cli-logger.service.js'
import { getPikkuCLIConfig } from './utils/pikku-cli-config.js'
import { inspect, InspectorState } from '@pikku/inspector'
import { glob } from 'tinyglobby'
import path from 'path'
import { PikkuCLIConfig } from '../types/config.js'
import {
  CLILoggerForwarder,
  ForwardedLogMessage,
} from './services/cli-logger-forwarder.service.js'

const logger = new CLILogger({ logLogo: true, silent: false })

/**
 * Default CLI renderer that logs output using the logger
 */
export const defaultCLIRenderer = pikkuCLIRender<
  ForwardedLogMessage,
  SingletonServices
>((_services, data) => {
  if (data) {
    logger[data.level]({ message: data.message, type: data.type })
  }
})

export const createConfig: CreateConfig<Config, [PikkuCLIConfig]> = async (
  _variablesService,
  data
) => {
  const cliConfig = await getPikkuCLIConfig(
    logger,
    data.configFile,
    [],
    data,
    true
  )
  return {
    ...cliConfig,
    ...data,
  }
}

/**
 * Singleton services factory for the Pikku CLI
 * This function creates the singleton services used by the CLI and is created once on start.
 */
export const createSingletonServices: CreateSingletonServices<
  Config,
  SingletonServices
> = async (config) => {
  const { rootDir, srcDirectories, filters } = config
  const variables = new LocalVariablesService()

  let inspectorState: InspectorState | undefined = undefined
  const getInspectorState = async (refresh: boolean = false) => {
    if (refresh || !inspectorState) {
      const wiringFiles = (
        await Promise.all(
          srcDirectories.map((dir) =>
            glob(`${path.join(rootDir, dir)}/**/*.ts`)
          )
        )
      ).flat()
      inspectorState = await inspect(logger, wiringFiles, {
        filters,
        types: {
          configFileType: config.configFile,
          userSessionType: config.tags?.[0], // TODO: Properly handle type selection
          singletonServicesFactoryType: undefined,
          sessionServicesFactoryType: undefined,
        },
      })
      return inspectorState
    }
    return inspectorState!
  }

  return {
    config,
    logger,
    variables,
    getInspectorState,
  }
}

export const createSessionServices: CreateSessionServices<
  SingletonServices,
  Services,
  UserSession
> = async ({ logger }, { cli, channel }) => {
  const vChannel = cli ? cli.channel : channel
  if (!vChannel) {
    throw new Error('No channel provided for CLI services')
  }
  return {
    logger: new CLILoggerForwarder(logger, vChannel),
  }
}
