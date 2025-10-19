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
import { inspect, InspectorState, InspectorFilters } from '@pikku/inspector'
import { glob } from 'tinyglobby'
import path from 'path'
import { PikkuCLIConfig } from '../types/config.js'
import {
  CLILoggerForwarder,
  ForwardedLogMessage,
} from './services/cli-logger-forwarder.service.js'

const logger = new CLILogger({ logLogo: true, silent: false })

/**
 * Parse a comma-separated string or array into an array of trimmed, non-empty strings
 * Returns undefined if the input is empty/undefined or results in an empty array
 */
function parseCommaSeparated(
  value: string | string[] | undefined
): string[] | undefined {
  if (!value) return undefined

  // If already an array, return it
  if (Array.isArray(value)) {
    const filtered = value.filter((item) => item && item.trim().length > 0)
    return filtered.length > 0 ? filtered : undefined
  }

  // If string, split by comma
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  return parsed.length > 0 ? parsed : undefined
}

/**
 * Parse CLI filter arguments into InspectorFilters format
 */
function parseCLIFilters(data: any): InspectorFilters {
  const filters: InspectorFilters = {}

  if (data.filters) {
    return JSON.parse(data.filters)
  }

  // Parse each filter type from CLI arguments
  const names = parseCommaSeparated(data.names)
  const tags = parseCommaSeparated(data.tags)
  const types = parseCommaSeparated(data.types)
  const directories = parseCommaSeparated(data.directories)
  const httpRoutes = parseCommaSeparated(data.httpRoutes)
  const httpMethods = parseCommaSeparated(data.httpMethods)

  // Only include non-undefined values in the result
  if (names) filters.names = names
  if (tags) filters.tags = tags
  if (types) filters.types = types
  if (directories) filters.directories = directories
  if (httpRoutes) filters.httpRoutes = httpRoutes
  if (httpMethods) filters.httpMethods = httpMethods

  return filters
}

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
  const cliConfig = await getPikkuCLIConfig(logger, data.configFile, [], true)

  return {
    ...cliConfig,
    ...data,
    filters: parseCLIFilters(data),
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
          userSessionType: config.userSessionType,
          singletonServicesFactoryType: config.singletonServicesFactoryType,
          sessionServicesFactoryType: config.sessionServicesFactoryType,
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
