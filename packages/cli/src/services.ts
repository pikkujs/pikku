import type {
  Config,
  Services,
  SingletonServices,
  UserSession,
} from '../types/application-types.js'
import type { CreateConfig } from '@pikku/core'
import type {
  CreateWireServices,
  CreateSingletonServices,
} from '@pikku/core/internal'
import { pikkuCLIRender } from '@pikku/core/cli'
import {
  LocalVariablesService,
  LocalSecretService,
  LogLevel,
  InMemoryWorkflowService,
} from '@pikku/core/services'
import { NoopAuditService } from '@pikku/core'
import { CLILogger } from './services/cli-logger.service.js'
import { getPikkuCLIConfig } from './utils/pikku-cli-config.js'
import type { InspectorState, InspectorDiagnostic } from '@pikku/inspector'
import {
  inspect,
  serializeInspectorState,
  deserializeInspectorState,
  filterInspectorState,
  getInitialInspectorState,
  ErrorCode,
} from '@pikku/inspector'
import { glob } from 'tinyglobby'
import path from 'path'
import type { PikkuCLIConfig } from '../types/config.js'
import type { ForwardedLogMessage } from './services/cli-logger-forwarder.service.js'
import { CLILoggerForwarder } from './services/cli-logger-forwarder.service.js'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { loadManifest } from './utils/contract-versions.js'
import { join } from 'path'
import { NodeBundler } from './deploy/bundler/node-bundler.js'
import { BunBundler } from './deploy/bundler/bun-bundler.js'
import { NodeServerRunner } from './server/node-server-runner.js'
import { BunServerRunner } from './server/bun-server-runner.js'
import { parseCLIFilters } from './utils/parse-cli-filters.js'

const DIAGNOSTIC_CODE_TO_LINT_KEY: Record<
  string,
  keyof NonNullable<PikkuCLIConfig['lint']>
> = {
  [ErrorCode.SERVICES_NOT_DESTRUCTURED]: 'servicesNotDestructured',
  [ErrorCode.WIRES_NOT_DESTRUCTURED]: 'wiresNotDestructured',
}

// Default severity for each lint rule when not explicitly configured.
// 'error' routes through logger.critical and always fails the build. Both
// default to 'error': a non-destructured services/wire param hides which
// services/transports a function uses (defeating tree-shaking) and usually masks
// a missing type behind a cast. The whole `wire` is never genuinely needed —
// destructure the transport you use (`{ rpc }`, `{ http }`, `{ channel }`).
const LINT_DEFAULTS: NonNullable<PikkuCLIConfig['lint']> = {
  servicesNotDestructured: 'error',
  wiresNotDestructured: 'error',
}

function processDiagnostics(
  diagnostics: InspectorDiagnostic[],
  lint?: PikkuCLIConfig['lint']
): void {
  for (const diagnostic of diagnostics) {
    const lintKey = DIAGNOSTIC_CODE_TO_LINT_KEY[diagnostic.code]
    const severity = lintKey ? (lint?.[lintKey] ?? LINT_DEFAULTS[lintKey] ?? 'off') : 'off'
    if (severity === 'error') {
      logger.critical(diagnostic.code as ErrorCode, diagnostic.message)
    } else if (severity === 'warn') {
      logger.warn(`[${diagnostic.code}] ${diagnostic.message}`)
    }
  }
}

const logger = new CLILogger({ logLogo: false, silent: false })

/**
 * Default CLI renderer that logs output using the logger
 */
export const defaultCLIRenderer = pikkuCLIRender<ForwardedLogMessage>(
  (_services, data) => {
    if (!data) return
    const validLevels: ReadonlyArray<ForwardedLogMessage['level']> = [
      'trace',
      'debug',
      'info',
      'warn',
      'error',
    ]
    if (!validLevels.includes(data.level)) return
    logger[data.level]({ message: data.message, type: data.type })
  }
)

export const createConfig: CreateConfig<Config, [PikkuCLIConfig]> = async (
  _variablesService,
  data
) => {
  // Determine log level based on CLI flags with precedence:
  // --silent > --loglevel > --verbose > --info > default (info)
  let logLevel: LogLevel = LogLevel.info // default
  let isSilent = false
  // --output is constrained to 'text' | 'json' by the CLI parser
  // (choices + default in cli.wiring.ts), so no runtime validation
  // is needed here. --json is kept as an alias that forces 'json'.
  const outputMode: 'text' | 'json' = (data as any).json
    ? 'json'
    : ((data as any).output as 'text' | 'json')

  logger.setOutputMode(outputMode)

  if ((data as any).silent) {
    logLevel = LogLevel.critical
    isSilent = true
  } else if ((data as any).loglevel) {
    const levelStr = (data as any).loglevel
    if (LogLevel[levelStr] !== undefined) {
      logLevel = LogLevel[levelStr as keyof typeof LogLevel]
    } else {
      logger.warn(
        `Invalid log level "${levelStr}". Valid levels: trace, debug, info, warn, error, critical. Using default (warn).`
      )
    }
  } else if ((data as any).verbose) {
    logLevel = LogLevel.debug
  } else if ((data as any).info) {
    logLevel = LogLevel.info
  }

  logger.setLevel(logLevel)
  logger.setSilent(isSilent)

  // Build gate: critical always fails; --fail-on-warn implies --fail-on-error.
  const extraFailOn: Array<'error' | 'warn'> = []
  if ((data as any).failOnWarn) extraFailOn.push('warn', 'error')
  else if ((data as any).failOnError) extraFailOn.push('error')
  logger.setFailOn(extraFailOn)

  // Display logo unless in silent mode
  if (!isSilent && outputMode !== 'json') {
    logger.logLogo()
  }

  const cliConfig = await getPikkuCLIConfig(
    logger,
    data.configFile,
    [],
    true,
    data.outDir
  )

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

  // Destructure outDir from data so the resolved path from cliConfig is
  // preserved (getPikkuCLIConfig already resolves relative --outDir to
  // an absolute path and recomputes all derived *File/*Dir paths).
  const { outDir: _rawOutDir, ...dataWithoutOutDir } = data
  return {
    ...cliConfig,
    ...dataWithoutOutDir,
    tags: cliConfig.tags,
    filters: parseCLIFilters(data, cliConfig),
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
  let unfilteredStateIsSetupOnly = false

  const getInspectorState = async (
    refresh: boolean = false,
    setupOnly: boolean = false,
    bootstrapMode: boolean = false
  ) => {
    // In bootstrap mode, return a minimal "zero state" with core types
    // This allows bootstrap to run immediately without inspecting the codebase
    if (bootstrapMode) {
      const corePackagePath = '@pikku/core'
      const initialState = getInitialInspectorState(rootDir)

      // Populate filesAndMethods with core types from @pikku/core
      initialState.filesAndMethods = {
        userSessionType: {
          file: corePackagePath,
          variable: 'CoreUserSession',
          type: 'CoreUserSession',
          typePath: corePackagePath,
        },
        wireServicesType: {
          file: corePackagePath,
          variable: 'CoreServices',
          type: 'CoreServices',
          typePath: corePackagePath,
        },
        singletonServicesType: {
          file: corePackagePath,
          variable: 'CoreSingletonServices',
          type: 'CoreSingletonServices',
          typePath: corePackagePath,
        },
        pikkuConfigType: {
          file: corePackagePath,
          variable: 'CoreConfig',
          type: 'CoreConfig',
          typePath: corePackagePath,
        },
      }

      return initialState
    }

    // Get or refresh the unfiltered state.
    // When a preloaded state was provided via --stateInput, skip re-inspection
    // because the preloaded state is already the complete unfiltered state.
    // Also re-run when the cache holds a setupOnly=true state but a full
    // inspection (setupOnly=false) is now requested — setupOnly skips
    // visitRoutes so variables/secrets/etc. are absent from that cache.
    if (
      !unfilteredState ||
      (refresh && !preloadedInspectorState) ||
      (unfilteredStateIsSetupOnly && !setupOnly && !preloadedInspectorState)
    ) {
      // Run inspector WITHOUT filters to get full state
      const wiringFiles = (
        await Promise.all(
          srcDirectories.map((dir) =>
            glob(`${path.join(rootDir, dir)}/**/*.ts`, {
              ignore: config.ignoreFiles || [],
              absolute: true,
            })
          )
        )
      ).flat()

      const scaffoldFiles = [
        config.consoleFunctionsFile,
        config.remoteRpcWorkersFile,
        config.workflowRoutesFile,
        config.publicRpcFile,
        config.publicAgentFile,
        // The auth scaffold (catch-all routes + session middleware) and its
        // sibling secrets file (wireSecret per provider) are generated into the
        // scaffold dir, which may live outside srcDirectories (e.g. a project's
        // `pikku/` dir). Add them explicitly so their wirings are inspected.
        config.authFile,
        config.authFile
          ? path.join(path.dirname(config.authFile), 'auth-secrets.gen.ts')
          : undefined,
        // Stateless-session split: middleware-only file nothing imports, so it's
        // unreachable via the import graph — add it explicitly to get inspected.
        config.authFile
          ? path.join(path.dirname(config.authFile), 'auth-middleware.gen.ts')
          : undefined,
      ]
      for (const file of scaffoldFiles) {
        if (file && !wiringFiles.includes(file) && existsSync(file)) {
          wiringFiles.push(file)
        }
      }

      const manifest = !setupOnly
        ? ((await loadManifest(join(config.rootDir, 'versions.pikku.json'))) ??
          undefined)
        : undefined
      const oldProgram = unfilteredState?.program ?? undefined
      const inspectStart = Date.now()
      unfilteredStateIsSetupOnly = setupOnly
      unfilteredState = await inspect(logger, wiringFiles, {
        setupOnly,
        rootDir,
        isAddon: !!config.addon,
        oldProgram,
        types: {
          configFileType: config.configFile,
          userSessionType: config.userSessionType,
          singletonServicesFactoryType: config.singletonServicesFactoryType,
          wireServicesFactoryType: config.wireServicesFactoryType,
        },
        tags: config.tags,
        // Opt-in security lint (`--security`): scans function return types for
        // data-classification leaks. Off by default — it's the dominant codegen
        // cost. Never runs during a plain `pikku all`.
        classificationCheck: !setupOnly && !!config.security,
        schemaConfig: !setupOnly
          ? {
              tsconfig: config.tsconfig,
              schemasFromTypes: config.schemasFromTypes,
              schema: config.schema,
              // Persist generated TS schemas under node_modules/.cache (gitignored
              // by convention) so a warm `pikku all` with unchanged function types
              // skips ts-json-schema-generator — the largest cold-run cost.
              cacheDir: path.join(rootDir, 'node_modules', '.cache', 'pikku'),
            }
          : undefined,
        openAPI:
          !setupOnly && config.openAPI
            ? { additionalInfo: config.openAPI.additionalInfo }
            : undefined,
        manifest,
      })

      logger.debug(`Inspector took ${Date.now() - inspectStart}ms`)

      if (
        'diagnostics' in unfilteredState &&
        unfilteredState.diagnostics.length > 0
      ) {
        processDiagnostics(unfilteredState.diagnostics, config.lint)
      }

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

  const workflowService = new InMemoryWorkflowService()

  // Resolve the runtime ONCE here, then inject runtime-specific implementations.
  // Keeping the check in this single place avoids `typeof Bun` branches leaking
  // into the deploy pipeline / dev command.
  const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

  return {
    config,
    logger,
    variables,
    secrets: new LocalSecretService(variables),
    audit: new NoopAuditService(),
    getInspectorState,
    workflowService,
    bundler: isBun ? new BunBundler() : new NodeBundler(),
    devServerRunner: isBun ? new BunServerRunner() : new NodeServerRunner(),
  }
}

export const createWireServices: CreateWireServices<
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
