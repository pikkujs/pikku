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
} from '@pikku/core'
import { pikkuCLIRender } from '@pikku/core/cli'
import { LocalVariablesService, LogLevel } from '@pikku/core/services'
import { CLILogger } from './services/cli-logger.service.js'
import { getPikkuCLIConfig } from './utils/pikku-cli-config.js'
import {
  inspect,
  InspectorState,
  InspectorFilters,
  serializeInspectorState,
  deserializeInspectorState,
  filterInspectorState,
} from '@pikku/inspector'
import { glob } from 'tinyglobby'
import path from 'path'
import { PikkuCLIConfig } from '../types/config.js'
import {
  CLILoggerForwarder,
  ForwardedLogMessage,
} from './services/cli-logger-forwarder.service.js'
import { readFile, writeFile } from 'fs/promises'

const logger = new CLILogger({ logLogo: true, silent: false })

/**
 * Parse a comma-separated string or array into an array of trimmed, non-empty strings
 * Returns undefined if the input is empty/undefined or results in an empty array
 */
function parseCommaSeparated(
  value: string | string[] | undefined
): string[] | undefined {
  if (!value) return undefined

  // If already an array, flatten and split any comma-separated values
  if (Array.isArray(value)) {
    const flattened = value
      .flatMap((item) => item.split(','))
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
    return flattened.length > 0 ? flattened : undefined
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

/**
 * Client-safe CLI renderer that outputs to console (no service dependencies)
 * This renderer can be used in CLI-over-channel clients
 */
export const clientCLIRenderer = pikkuCLIRender<ForwardedLogMessage>(
  (_services, data) => {
    if (data) {
      // Simple console output without service dependencies
      const prefix = data.type ? `[${data.type}] ` : ''
      console.log(`${prefix}${data.message}`)
    }
  }
)

export const createConfig: CreateConfig<Config, [PikkuCLIConfig]> = async (
  _variablesService,
  data
) => {
  // Set log level if provided via CLI option
  const logLevel = (data as any).logLevel
  if (logLevel && LogLevel[logLevel] !== undefined) {
    logger.setLevel(LogLevel[logLevel as keyof typeof LogLevel])
  }

  const cliConfig = await getPikkuCLIConfig(logger, data.configFile, [], true)

  // Load inspector state from file if stateInput is provided
  let preloadedInspectorState: Omit<InspectorState, 'typesLookup'> | undefined =
    undefined

  if (data.stateInput) {
    try {
      logger.info(`Loading inspector state from ${data.stateInput}`)
      const stateJson = await readFile(data.stateInput, 'utf-8')
      const serializedState = JSON.parse(stateJson)
      preloadedInspectorState = deserializeInspectorState(serializedState)
      logger.info(`Inspector state loaded successfully`)
    } catch (error: any) {
      logger.error(
        `Failed to load inspector state from ${data.stateInput}: ${error.message}`
      )
      throw error
    }
  }

  return {
    ...cliConfig,
    ...data,
    filters: parseCLIFilters(data),
    preloadedInspectorState,
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
  const {
    rootDir,
    srcDirectories,
    filters,
    preloadedInspectorState,
    stateOutput,
  } = config
  const variables = new LocalVariablesService()

  // Store unfiltered state
  let unfilteredState:
    | InspectorState
    | Omit<InspectorState, 'typesLookup'>
    | undefined = preloadedInspectorState

  const getInspectorState = async (
    refresh: boolean = false,
    setupOnly: boolean = false
  ) => {
    // Get or refresh the unfiltered state
    if (!unfilteredState || refresh) {
      // Run inspector WITHOUT filters to get full state
      const wiringFiles = (
        await Promise.all(
          srcDirectories.map((dir) =>
            glob(`${path.join(rootDir, dir)}/**/*.ts`, {
              ignore: config.ignoreFiles || [],
            })
          )
        )
      ).flat()
      unfilteredState = inspect(logger, wiringFiles, {
        setupOnly,
        types: {
          configFileType: config.configFile,
          userSessionType: config.userSessionType,
          singletonServicesFactoryType: config.singletonServicesFactoryType,
          sessionServicesFactoryType: config.sessionServicesFactoryType,
        },
      })

      // Save unfiltered inspector state to file if stateOutput is provided
      if (stateOutput && 'typesLookup' in unfilteredState) {
        try {
          logger.info(`Saving inspector state to ${stateOutput}`)
          const serialized = serializeInspectorState(unfilteredState)
          await writeFile(
            stateOutput,
            JSON.stringify(serialized, null, 2),
            'utf-8'
          )
          logger.info(`Inspector state saved successfully`)
        } catch (error: any) {
          logger.error(
            `Failed to save inspector state to ${stateOutput}: ${error.message}`
          )
          // Don't throw - state saving is optional/nice-to-have
        }
      }
    }

    // Apply filters as a post-processing step
    const filteredState = filterInspectorState(unfilteredState, filters, logger)

    return filteredState as InspectorState
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
