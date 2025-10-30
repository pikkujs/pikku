import { join, dirname, resolve, isAbsolute } from 'path'
import { readdir, readFile } from 'fs/promises'
import { PikkuCLIConfig } from '../../types/config.js'
import { CLILogger } from '../services/cli-logger.service.js'

const CONFIG_DIR_FILES = [
  'nextBackendFile',
  'nextHTTPFile',
  'fetchFile',
  'websocketFile',
  'rpcWiringsFile',
  'queueWiringsFile',
  'mcpJsonFile',
]

export const getPikkuCLIConfig = async (
  logger: CLILogger,
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  const config = await _getPikkuCLIConfig(
    logger,
    configFile,
    requiredFields,
    exitProcess
  )
  return config
}

const _getPikkuCLIConfig = async (
  logger: CLILogger,
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  if (!configFile) {
    let execDirectory = process.cwd()
    const files = await readdir(execDirectory)
    const file = files.find((file) => /pikku\.config\.(ts|js|json)$/.test(file))
    if (!file) {
      throw new Error('Config file pikku.config.json not found')
    }
    configFile = join(execDirectory, file)
  }

  try {
    let result: PikkuCLIConfig
    const file = await readFile(configFile, 'utf-8')
    const configDir = dirname(configFile)
    const config: PikkuCLIConfig = JSON.parse(file)
    if (config.extends) {
      const extendedConfig = await getPikkuCLIConfig(
        logger,
        resolve(configDir, config.extends),
        [],
        exitProcess
      )
      result = {
        ...extendedConfig,
        ...config,
        configDir,
        packageMappings: {
          ...extendedConfig.packageMappings,
          ...config.packageMappings,
        },
        ignoreFiles: config.ignoreFiles ??
          extendedConfig.ignoreFiles ?? [
            '**/*.gen.ts',
            '**/*.test.ts',
            '**/*.spec.ts',
            '**/node_modules/**',
            '**/.pikku/**',
            '**/dist/**',
          ],
      }
    } else {
      result = {
        ...config,
        configDir,
        packageMappings: config.packageMappings || {},
        rootDir: config.rootDir
          ? resolve(configDir, config.rootDir)
          : configDir,
        ignoreFiles: config.ignoreFiles ?? [
          '**/*.gen.ts',
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/node_modules/**',
          '**/.pikku/**',
          '**/dist/**',
        ],
      }
    }

    // Create transport/event directories
    const functionDir = join(result.outDir, 'function')
    const httpDir = join(result.outDir, 'http')
    const channelDir = join(result.outDir, 'channel')
    const rpcDir = join(result.outDir, 'rpc')
    const schedulerDir = join(result.outDir, 'scheduler')
    const queueDir = join(result.outDir, 'queue')
    const mcpDir = join(result.outDir, 'mcp')
    const cliDir = join(result.outDir, 'cli')
    const middlewareDir = join(result.outDir, 'middleware')

    // Create directories if they don't exist (will be done lazily when files are written)

    if (!result.schemaDirectory) {
      result.schemaDirectory = join(result.outDir, 'schemas')
    }

    // Functions
    if (!result.functionsFile) {
      result.functionsFile = join(functionDir, 'pikku-functions.gen.ts')
    }
    if (!result.functionsMetaFile) {
      result.functionsMetaFile = join(
        functionDir,
        'pikku-functions-meta.gen.ts'
      )
    }
    if (!result.functionsMetaMinFile) {
      result.functionsMetaMinFile = join(
        functionDir,
        'pikku-functions-meta.min.gen.ts'
      )
    }
    if (!result.functionTypesFile) {
      result.functionTypesFile = join(
        functionDir,
        'pikku-function-types.gen.ts'
      )
    }
    if (!result.typesDeclarationFile) {
      result.typesDeclarationFile = join(result.outDir, 'pikku-types.gen.ts')
    }

    // HTTP
    if (!result.httpWiringsFile) {
      result.httpWiringsFile = join(httpDir, 'pikku-http-wirings.gen.ts')
    }
    if (!result.httpWiringMetaFile) {
      result.httpWiringMetaFile = join(
        httpDir,
        'pikku-http-wirings-meta.gen.ts'
      )
    }
    if (!result.httpMapDeclarationFile) {
      result.httpMapDeclarationFile = join(
        httpDir,
        'pikku-http-wirings-map.gen.d.ts'
      )
    }
    if (!result.httpTypesFile) {
      result.httpTypesFile = join(httpDir, 'pikku-http-types.gen.ts')
    }

    // Channels/WebSocket
    if (!result.channelsWiringFile) {
      result.channelsWiringFile = join(channelDir, 'pikku-channels.gen.ts')
    }
    if (!result.channelsWiringMetaFile) {
      result.channelsWiringMetaFile = join(
        channelDir,
        'pikku-channels-meta.gen.ts'
      )
    }
    if (!result.channelsMapDeclarationFile) {
      result.channelsMapDeclarationFile = join(
        channelDir,
        'pikku-channels-map.gen.d.ts'
      )
    }
    if (!result.channelsTypesFile) {
      result.channelsTypesFile = join(channelDir, 'pikku-channel-types.gen.ts')
    }

    // RPC (internal and external)
    if (!result.rpcInternalWiringMetaFile) {
      result.rpcInternalWiringMetaFile = join(
        rpcDir,
        'pikku-rpc-wirings-meta.internal.gen.ts'
      )
    }

    if (!result.rpcInternalMapDeclarationFile) {
      result.rpcInternalMapDeclarationFile = join(
        rpcDir,
        'pikku-rpc-wirings-map.internal.gen.d.ts'
      )
    }

    if (!result.rpcMapDeclarationFile) {
      result.rpcMapDeclarationFile = join(
        rpcDir,
        'pikku-rpc-wirings-map.gen.d.ts'
      )
    }

    // Scheduler
    if (!result.schedulersWiringFile) {
      result.schedulersWiringFile = join(
        schedulerDir,
        'pikku-schedulers-wirings.gen.ts'
      )
    }
    if (!result.schedulersWiringMetaFile) {
      result.schedulersWiringMetaFile = join(
        schedulerDir,
        'pikku-schedulers-wirings-meta.gen.ts'
      )
    }
    if (!result.schedulersTypesFile) {
      result.schedulersTypesFile = join(
        schedulerDir,
        'pikku-scheduler-types.gen.ts'
      )
    }

    // Queue
    if (!result.queueWorkersWiringFile) {
      result.queueWorkersWiringFile = join(
        queueDir,
        'pikku-queue-workers-wirings.gen.ts'
      )
    }
    if (!result.queueWorkersWiringMetaFile) {
      result.queueWorkersWiringMetaFile = join(
        queueDir,
        'pikku-queue-workers-wirings-meta.gen.ts'
      )
    }
    if (!result.queueMapDeclarationFile) {
      result.queueMapDeclarationFile = join(
        queueDir,
        'pikku-queue-workers-wirings-map.gen.d.ts'
      )
    }
    if (!result.queueTypesFile) {
      result.queueTypesFile = join(queueDir, 'pikku-queue-types.gen.ts')
    }

    // Services
    if (!result.servicesFile) {
      result.servicesFile = join(result.outDir, 'pikku-services.gen.ts')
    }

    // Middleware
    if (!result.middlewareFile) {
      result.middlewareFile = join(middlewareDir, 'pikku-middleware.gen.ts')
    }
    if (!result.middlewareGroupsMetaFile) {
      result.middlewareGroupsMetaFile = join(
        middlewareDir,
        'pikku-middleware-groups-meta.gen.ts'
      )
    }

    // Permissions
    const permissionsDir = join(result.outDir, 'permissions')
    if (!result.permissionsFile) {
      result.permissionsFile = join(permissionsDir, 'pikku-permissions.gen.ts')
    }

    // Bootstrap files
    if (!result.bootstrapFile) {
      result.bootstrapFile = join(result.outDir, 'pikku-bootstrap.gen.ts')
    }

    // MCP
    if (!result.mcpWiringsMetaFile) {
      result.mcpWiringsMetaFile = join(mcpDir, 'pikku-mcp-wirings-meta.gen.ts')
    }
    if (!result.mcpWiringsFile) {
      result.mcpWiringsFile = join(mcpDir, 'pikku-mcp-wirings.gen.ts')
    }
    if (!result.mcpJsonFile) {
      result.mcpJsonFile = join(mcpDir, 'pikku-mcp.gen.json')
    }
    if (!result.mcpTypesFile) {
      result.mcpTypesFile = join(mcpDir, 'pikku-mcp-types.gen.ts')
    }

    // CLI
    if (!result.cliWiringsFile) {
      result.cliWiringsFile = join(cliDir, 'pikku-cli-wirings.gen.ts')
    }
    if (!result.cliWiringMetaFile) {
      result.cliWiringMetaFile = join(cliDir, 'pikku-cli-wirings-meta.gen.ts')
    }
    if (!result.cliBootstrapFile) {
      result.cliBootstrapFile = join(cliDir, 'pikku-cli-bootstrap.gen.ts')
    }
    if (!result.cliTypesFile) {
      result.cliTypesFile = join(cliDir, 'pikku-cli-types.gen.ts')
    }

    if (requiredFields.length > 0) {
      validateCLIConfig(result, requiredFields)
    }

    for (const objectKey of Object.keys(result)) {
      if (objectKey.endsWith('File') || objectKey.endsWith('Directory')) {
        const relativeTo = CONFIG_DIR_FILES.includes(objectKey)
          ? result.configDir
          : result.rootDir
        // Only normalize string values to avoid corrupting nested objects
        if (result[objectKey] && typeof result[objectKey] === 'string') {
          if (!isAbsolute(result[objectKey])) {
            result[objectKey] = join(relativeTo, result[objectKey])
          }
        }
      }
    }

    if (!isAbsolute(result.tsconfig)) {
      result.tsconfig = join(result.rootDir, result.tsconfig)
    }

    return result
  } catch (e: any) {
    logger.error(e)
    throw new Error(`Config file not found: ${configFile}`)
  }
}

export const validateCLIConfig = (
  cliConfig: PikkuCLIConfig,
  required: Array<keyof PikkuCLIConfig>
) => {
  let errors: string[] = []
  for (const key of required) {
    if (!cliConfig[key]) {
      errors.push(key)
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.join(', ')} ${errors.length === 1 ? 'is' : 'are'} required in pikku.config.json`
    )
  }
}
