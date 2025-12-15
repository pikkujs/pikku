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
        externalPackages: {
          ...extendedConfig.externalPackages,
          ...config.externalPackages,
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
          supportsImportAttributes: true,
          ...extendedConfig.schema,
          ...config.schema,
        },
      }
    } else {
      result = {
        ...config,
        configDir,
        packageMappings: config.packageMappings || {},
        externalPackages: config.externalPackages || {},
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
          supportsImportAttributes: true,
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
    if (!result.functionsMetaJsonFile) {
      result.functionsMetaJsonFile = join(
        functionDir,
        'pikku-functions-meta.gen.json'
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
    if (!result.httpWiringMetaJsonFile) {
      result.httpWiringMetaJsonFile = join(
        httpDir,
        'pikku-http-wirings-meta.gen.json'
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
    if (!result.channelsWiringMetaJsonFile) {
      result.channelsWiringMetaJsonFile = join(
        channelDir,
        'pikku-channels-meta.gen.json'
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

    if (!result.rpcInternalWiringMetaJsonFile) {
      result.rpcInternalWiringMetaJsonFile = join(
        rpcDir,
        'pikku-rpc-wirings-meta.internal.gen.json'
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

    // RPC config defaults
    if (!result.rpc) {
      result.rpc = {}
    }
    if (!result.rpc.remoteRpcWorkersPath) {
      result.rpc.remoteRpcWorkersPath = join(
        rpcDir,
        'pikku-remote-rpc-workers.gen.ts'
      )
    }

    const triggerDir = join(result.outDir, 'trigger')
    if (!result.triggersTypesFile) {
      result.triggersTypesFile = join(triggerDir, 'pikku-trigger-types.gen.ts')
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
    if (!result.schedulersWiringMetaJsonFile) {
      result.schedulersWiringMetaJsonFile = join(
        schedulerDir,
        'pikku-schedulers-wirings-meta.gen.json'
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
    if (!result.queueWorkersWiringMetaJsonFile) {
      result.queueWorkersWiringMetaJsonFile = join(
        queueDir,
        'pikku-queue-workers-wirings-meta.gen.json'
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

    // Workflows
    if (!result.workflowsWiringFile) {
      result.workflowsWiringFile = join(
        workflowDir,
        'pikku-workflow-wirings.gen.ts'
      )
    }
    if (!result.workflowsWiringMetaFile) {
      result.workflowsWiringMetaFile = join(
        workflowDir,
        'pikku-workflow-wirings-meta.gen.ts'
      )
    }
    if (!result.workflowsWorkersFile) {
      result.workflowsWorkersFile = join(
        workflowDir,
        'pikku-workflow-workers.gen.ts'
      )
    }
    if (!result.workflowMapDeclarationFile) {
      result.workflowMapDeclarationFile = join(
        workflowDir,
        'pikku-workflow-map.gen.d.ts'
      )
    }
    if (!result.workflowTypesFile) {
      result.workflowTypesFile = join(
        workflowDir,
        'pikku-workflow-types.gen.ts'
      )
    }

    // Workflow meta directory (individual JSON files for each workflow)
    if (!result.workflowMetaDir) {
      result.workflowMetaDir = join(workflowDir, 'meta')
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
    if (!result.middlewareGroupsMetaJsonFile) {
      result.middlewareGroupsMetaJsonFile = join(
        middlewareDir,
        'pikku-middleware-groups-meta.gen.json'
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
    if (!result.mcpWiringsMetaJsonFile) {
      result.mcpWiringsMetaJsonFile = join(
        mcpDir,
        'pikku-mcp-wirings-meta.gen.json'
      )
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
    if (!result.cliWiringMetaJsonFile) {
      result.cliWiringMetaJsonFile = join(
        cliDir,
        'pikku-cli-wirings-meta.gen.json'
      )
    }
    if (!result.cliBootstrapFile) {
      result.cliBootstrapFile = join(cliDir, 'pikku-cli-bootstrap.gen.ts')
    }
    if (!result.cliTypesFile) {
      result.cliTypesFile = join(cliDir, 'pikku-cli-types.gen.ts')
    }

    // Forge (for wireForgeNode and nodes meta)
    const forgeDir = join(result.outDir, 'forge')
    if (!result.forgeNodesMetaJsonFile) {
      result.forgeNodesMetaJsonFile = join(
        forgeDir,
        'pikku-forge-nodes-meta.gen.json'
      )
    }
    if (!result.forgeTypesFile) {
      result.forgeTypesFile = join(forgeDir, 'pikku-forge-types.gen.ts')
    }

    // Package (for wireCredential, package service factories, and package meta)
    const packageDir = join(result.outDir, 'package')
    if (!result.packageFile) {
      result.packageFile = join(packageDir, 'pikku-package.gen.ts')
    }
    if (!result.credentialTypesFile) {
      result.credentialTypesFile = join(
        packageDir,
        'pikku-credential-types.gen.ts'
      )
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

    if (result.externalPackage) {
      const packageJsonPath = join(result.rootDir, 'package.json')
      try {
        const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
        const packageJson = JSON.parse(packageJsonContent)

        if (
          !packageJson.name ||
          typeof packageJson.name !== 'string' ||
          packageJson.name.trim() === ''
        ) {
          throw new Error(
            `package.json at ${packageJsonPath} is missing a valid "name" field`
          )
        }

        result.externalPackageName = packageJson.name
      } catch (e: any) {
        throw new Error(
          `externalPackage is true but could not read or parse package.json at ${packageJsonPath}: ${e.message}`
        )
      }
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
