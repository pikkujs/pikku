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

const DEFAULT_FILE_PATHS: Record<string, string> = {
  schemaDirectory: 'schemas',
  typesDeclarationFile: 'pikku-types.gen.ts',
  functionsFile: 'pikku-functions.gen.ts',
  functionsMetaFile: 'pikku-functions-meta.gen.ts',
  functionsMetaJsonFile: 'pikku-functions-meta.gen.json',
  functionsMetaVerboseFile: 'pikku-functions-meta.verbose.gen.ts',
  functionsMetaVerboseJsonFile: 'pikku-functions-meta.verbose.gen.json',
  functionsMetaMinFile: 'pikku-functions-meta.min.gen.ts',
  functionsMetaMinJsonFile: 'pikku-functions-meta.min.gen.json',
  functionTypesFile: 'pikku-function-types.gen.ts',
  httpWiringsFile: 'pikku-http-wirings.gen.ts',
  httpWiringMetaFile: 'pikku-http-wirings-meta.gen.ts',
  httpWiringMetaJsonFile: 'pikku-http-wirings-meta.gen.json',
  httpWiringMetaVerboseFile: 'pikku-http-wirings-meta.verbose.gen.ts',
  httpWiringMetaVerboseJsonFile: 'pikku-http-wirings-meta.verbose.gen.json',
  httpMapDeclarationFile: 'pikku-http-wirings-map.gen.d.ts',
  httpTypesFile: 'pikku-http-types.gen.ts',
  channelsWiringFile: 'pikku-channels.gen.ts',
  channelsWiringMetaFile: 'pikku-channels-meta.gen.ts',
  channelsWiringMetaJsonFile: 'pikku-channels-meta.gen.json',
  channelsWiringMetaVerboseFile: 'pikku-channels-meta.verbose.gen.ts',
  channelsWiringMetaVerboseJsonFile: 'pikku-channels-meta.verbose.gen.json',
  channelsMapDeclarationFile: 'pikku-channels-map.gen.d.ts',
  channelsTypesFile: 'pikku-channel-types.gen.ts',
  rpcInternalWiringMetaFile: 'pikku-rpc-wirings-meta.internal.gen.ts',
  rpcInternalWiringMetaJsonFile: 'pikku-rpc-wirings-meta.internal.gen.json',
  rpcInternalMapDeclarationFile: 'pikku-rpc-wirings-map.internal.gen.d.ts',
  rpcMapDeclarationFile: 'pikku-rpc-wirings-map.gen.d.ts',
  remoteRpcWorkersPath: 'pikku-remote-rpc-workers.gen.ts',
  schedulersWiringFile: 'pikku-schedulers-wirings.gen.ts',
  schedulersWiringMetaFile: 'pikku-schedulers-wirings-meta.gen.ts',
  schedulersWiringMetaJsonFile: 'pikku-schedulers-wirings-meta.gen.json',
  schedulersWiringMetaVerboseFile:
    'pikku-schedulers-wirings-meta.verbose.gen.ts',
  schedulersWiringMetaVerboseJsonFile:
    'pikku-schedulers-wirings-meta.verbose.gen.json',
  schedulersTypesFile: 'pikku-scheduler-types.gen.ts',
  queueWorkersWiringFile: 'pikku-queue-workers-wirings.gen.ts',
  queueWorkersWiringMetaFile: 'pikku-queue-workers-wirings-meta.gen.ts',
  queueWorkersWiringMetaJsonFile: 'pikku-queue-workers-wirings-meta.gen.json',
  queueWorkersWiringMetaVerboseFile:
    'pikku-queue-workers-wirings-meta.verbose.gen.ts',
  queueWorkersWiringMetaVerboseJsonFile:
    'pikku-queue-workers-wirings-meta.verbose.gen.json',
  queueMapDeclarationFile: 'pikku-queue-workers-wirings-map.gen.d.ts',
  queueTypesFile: 'pikku-queue-types.gen.ts',
  workflowsWiringFile: 'pikku-workflow-wirings.gen.ts',
  workflowsWiringMetaFile: 'pikku-workflow-wirings-meta.gen.ts',
  workflowsWiringMetaJsonFile: 'pikku-workflow-wirings-meta.gen.json',
  workflowsWiringMetaVerboseFile: 'pikku-workflow-wirings-meta.verbose.gen.ts',
  workflowsWiringMetaVerboseJsonFile:
    'pikku-workflow-wirings-meta.verbose.gen.json',
  workflowsWorkersFile: 'pikku-workflow-workers.gen.ts',
  workflowMapDeclarationFile: 'pikku-workflow-map.gen.d.ts',
  workflowTypesFile: 'pikku-workflow-types.gen.ts',
  mcpWiringsFile: 'pikku-mcp-wirings.gen.ts',
  mcpWiringsMetaFile: 'pikku-mcp-wirings-meta.gen.ts',
  mcpWiringsMetaJsonFile: 'pikku-mcp-wirings-meta.gen.json',
  mcpWiringsMetaVerboseFile: 'pikku-mcp-wirings-meta.verbose.gen.ts',
  mcpWiringsMetaVerboseJsonFile: 'pikku-mcp-wirings-meta.verbose.gen.json',
  mcpJsonFile: 'pikku-mcp.gen.json',
  mcpTypesFile: 'pikku-mcp-types.gen.ts',
  cliWiringsFile: 'pikku-cli-wirings.gen.ts',
  cliWiringMetaFile: 'pikku-cli-wirings-meta.gen.ts',
  cliWiringMetaJsonFile: 'pikku-cli-wirings-meta.gen.json',
  cliWiringMetaVerboseFile: 'pikku-cli-wirings-meta.verbose.gen.ts',
  cliWiringMetaVerboseJsonFile: 'pikku-cli-wirings-meta.verbose.gen.json',
  cliBootstrapFile: 'pikku-cli-bootstrap.gen.ts',
  cliTypesFile: 'pikku-cli-types.gen.ts',
  servicesFile: 'pikku-services.gen.ts',
  middlewareFile: 'pikku-middleware.gen.ts',
  middlewareGroupsMetaFile: 'pikku-middleware-groups-meta.gen.ts',
  middlewareGroupsMetaJsonFile: 'pikku-middleware-groups-meta.gen.json',
  permissionsFile: 'pikku-permissions.gen.ts',
  bootstrapFile: 'pikku-bootstrap.gen.ts',
}

const addFilePath = (
  result: PikkuCLIConfig,
  dir: string,
  property: keyof PikkuCLIConfig
) => {
  if (!(result as any)[property]) {
    const defaultPath = DEFAULT_FILE_PATHS[property as string]
    if (defaultPath) {
      ;(result as any)[property] = join(dir, defaultPath)
    }
  }
}

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
            '**/*.test.ts',
            '**/*.spec.ts',
            '**/node_modules/**',
            '**/dist/**',
          ],
        schema: {
          additionalProperties: false,
          supportsImportAttributes: false,
          ...extendedConfig.schema,
          ...config.schema,
        },
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
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/node_modules/**',
          '**/dist/**',
        ],
        schema: {
          additionalProperties: false,
          supportsImportAttributes: false,
          ...config.schema,
        },
      }
    }

    // Create transport/event directories
    const functionDir = join(result.outDir, 'function')
    const httpDir = join(result.outDir, 'http')
    const channelDir = join(result.outDir, 'channel')
    const rpcDir = join(result.outDir, 'rpc')
    const schedulerDir = join(result.outDir, 'scheduler')
    const queueDir = join(result.outDir, 'queue')
    const workflowDir = join(result.outDir, 'workflow')
    const mcpDir = join(result.outDir, 'mcp')
    const cliDir = join(result.outDir, 'cli')
    const middlewareDir = join(result.outDir, 'middleware')

    addFilePath(result, result.outDir, 'schemaDirectory')
    addFilePath(result, result.outDir, 'typesDeclarationFile')

    addFilePath(result, functionDir, 'functionsFile')
    addFilePath(result, functionDir, 'functionsMetaFile')
    addFilePath(result, functionDir, 'functionsMetaJsonFile')
    addFilePath(result, functionDir, 'functionsMetaVerboseFile')
    addFilePath(result, functionDir, 'functionsMetaVerboseJsonFile')
    addFilePath(result, functionDir, 'functionsMetaMinFile')
    addFilePath(result, functionDir, 'functionsMetaMinJsonFile')
    addFilePath(result, functionDir, 'functionTypesFile')

    addFilePath(result, httpDir, 'httpWiringsFile')
    addFilePath(result, httpDir, 'httpWiringMetaFile')
    addFilePath(result, httpDir, 'httpWiringMetaJsonFile')
    addFilePath(result, httpDir, 'httpWiringMetaVerboseFile')
    addFilePath(result, httpDir, 'httpWiringMetaVerboseJsonFile')
    addFilePath(result, httpDir, 'httpMapDeclarationFile')
    addFilePath(result, httpDir, 'httpTypesFile')

    addFilePath(result, channelDir, 'channelsWiringFile')
    addFilePath(result, channelDir, 'channelsWiringMetaFile')
    addFilePath(result, channelDir, 'channelsWiringMetaJsonFile')
    addFilePath(result, channelDir, 'channelsWiringMetaVerboseFile')
    addFilePath(result, channelDir, 'channelsWiringMetaVerboseJsonFile')
    addFilePath(result, channelDir, 'channelsMapDeclarationFile')
    addFilePath(result, channelDir, 'channelsTypesFile')

    addFilePath(result, rpcDir, 'rpcInternalWiringMetaFile')
    addFilePath(result, rpcDir, 'rpcInternalWiringMetaJsonFile')
    addFilePath(result, rpcDir, 'rpcInternalMapDeclarationFile')
    addFilePath(result, rpcDir, 'rpcMapDeclarationFile')

    if (!result.rpc) {
      result.rpc = {}
    }
    if (!result.rpc.remoteRpcWorkersPath) {
      result.rpc.remoteRpcWorkersPath = join(
        rpcDir,
        DEFAULT_FILE_PATHS.remoteRpcWorkersPath
      )
    }

    addFilePath(result, schedulerDir, 'schedulersWiringFile')
    addFilePath(result, schedulerDir, 'schedulersWiringMetaFile')
    addFilePath(result, schedulerDir, 'schedulersWiringMetaJsonFile')
    addFilePath(result, schedulerDir, 'schedulersWiringMetaVerboseFile')
    addFilePath(result, schedulerDir, 'schedulersWiringMetaVerboseJsonFile')
    addFilePath(result, schedulerDir, 'schedulersTypesFile')

    addFilePath(result, queueDir, 'queueWorkersWiringFile')
    addFilePath(result, queueDir, 'queueWorkersWiringMetaFile')
    addFilePath(result, queueDir, 'queueWorkersWiringMetaJsonFile')
    addFilePath(result, queueDir, 'queueWorkersWiringMetaVerboseFile')
    addFilePath(result, queueDir, 'queueWorkersWiringMetaVerboseJsonFile')
    addFilePath(result, queueDir, 'queueMapDeclarationFile')
    addFilePath(result, queueDir, 'queueTypesFile')

    addFilePath(result, workflowDir, 'workflowsWiringFile')
    addFilePath(result, workflowDir, 'workflowsWiringMetaFile')
    addFilePath(result, workflowDir, 'workflowsWiringMetaJsonFile')
    addFilePath(result, workflowDir, 'workflowsWiringMetaVerboseFile')
    addFilePath(result, workflowDir, 'workflowsWiringMetaVerboseJsonFile')
    addFilePath(result, workflowDir, 'workflowsWorkersFile')
    addFilePath(result, workflowDir, 'workflowMapDeclarationFile')
    addFilePath(result, workflowDir, 'workflowTypesFile')

    addFilePath(result, mcpDir, 'mcpWiringsFile')
    addFilePath(result, mcpDir, 'mcpWiringsMetaFile')
    addFilePath(result, mcpDir, 'mcpWiringsMetaJsonFile')
    addFilePath(result, mcpDir, 'mcpWiringsMetaVerboseFile')
    addFilePath(result, mcpDir, 'mcpWiringsMetaVerboseJsonFile')
    addFilePath(result, mcpDir, 'mcpJsonFile')
    addFilePath(result, mcpDir, 'mcpTypesFile')

    addFilePath(result, cliDir, 'cliWiringsFile')
    addFilePath(result, cliDir, 'cliWiringMetaFile')
    addFilePath(result, cliDir, 'cliWiringMetaJsonFile')
    addFilePath(result, cliDir, 'cliWiringMetaVerboseFile')
    addFilePath(result, cliDir, 'cliWiringMetaVerboseJsonFile')
    addFilePath(result, cliDir, 'cliBootstrapFile')
    addFilePath(result, cliDir, 'cliTypesFile')

    addFilePath(result, result.outDir, 'servicesFile')
    addFilePath(result, middlewareDir, 'middlewareFile')
    addFilePath(result, middlewareDir, 'middlewareGroupsMetaFile')
    addFilePath(result, middlewareDir, 'middlewareGroupsMetaJsonFile')

    const permissionsDir = join(result.outDir, 'permissions')
    addFilePath(result, permissionsDir, 'permissionsFile')
    addFilePath(result, result.outDir, 'bootstrapFile')

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
