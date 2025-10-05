import { join, dirname, resolve, isAbsolute } from 'path'
import { readdir, readFile } from 'fs/promises'
import { OpenAPISpecInfo } from './wirings/http/openapi-spec-generator.js'
import { InspectorFilters } from '@pikku/inspector'
import { PikkuWiringTypes } from '@pikku/core'

export interface PikkuCLICoreOutputFiles {
  // Base directory
  outDir?: string

  // Schema and types
  schemaDirectory: string
  typesDeclarationFile: string

  // Function definitions
  functionsFile: string
  functionsMetaFile: string
  functionsMetaMinFile: string
  functionTypesFile: string

  // HTTP
  httpWiringsFile: string
  httpWiringMetaFile: string
  httpMapDeclarationFile: string
  httpTypesFile: string

  // Channels
  channelsWiringFile: string
  channelsWiringMetaFile: string
  channelsMapDeclarationFile: string
  channelsTypesFile: string

  // RPC Internal
  rpcInternalWiringMetaFile: string
  rpcInternalMapDeclarationFile: string

  // RPC Exposed
  rpcMapDeclarationFile: string

  // Schedulers
  schedulersWiringFile: string
  schedulersWiringMetaFile: string
  schedulersTypesFile: string

  // Queue processors
  queueWorkersWiringFile: string
  queueWorkersWiringMetaFile: string
  queueMapDeclarationFile: string
  queueTypesFile: string

  // MCP
  mcpWiringsFile: string
  mcpWiringsMetaFile: string
  mcpTypesFile: string

  // CLI
  cliWiringsFile: string
  cliWiringMetaFile: string
  cliBootstrapFile: string
  cliTypesFile: string

  // Services
  servicesFile: string

  // Application bootstrap
  bootstrapFile: string
  bootstrapFiles: Record<PikkuWiringTypes, string>
}

export type PikkuCLIConfig = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  packageMappings: Record<string, string>
  supportsImportAttributes: boolean

  configDir: string
  tsconfig: string

  nextBackendFile?: string
  nextHTTPFile?: string
  fetchFile?: string
  websocketFile?: string
  rpcWiringsFile?: string
  queueWiringsFile?: string
  mcpJsonFile?: string

  openAPI?: {
    outputFile: string
    additionalInfo: OpenAPISpecInfo
  }

  middlewareServices?: string[]

  schemasFromTypes?: string[]

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

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
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  filters: InspectorFilters = {},
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  const config = await _getPikkuCLIConfig(
    configFile,
    requiredFields,
    filters,
    exitProcess
  )
  return config
}

const _getPikkuCLIConfig = async (
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  filters: InspectorFilters = {},
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  if (!configFile) {
    let execDirectory = process.cwd()
    const files = await readdir(execDirectory)
    const file = files.find((file) => /pikku\.config\.(ts|js|json)$/.test(file))
    if (!file) {
      const errorMessage =
        '\nConfig file pikku.config.json not found\nExiting...'
      if (exitProcess) {
        console.error(errorMessage)
        process.exit(1)
      }
      throw new Error(errorMessage)
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
        resolve(configDir, config.extends),
        [],
        filters,
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
      }
    } else {
      result = {
        ...config,
        configDir,
        packageMappings: config.packageMappings || {},
        rootDir: config.rootDir
          ? resolve(configDir, config.rootDir)
          : configDir,
      }
    }

    if (result.outDir) {
      // Create transport/event directories
      const functionDir = join(result.outDir, 'function')
      const httpDir = join(result.outDir, 'http')
      const channelDir = join(result.outDir, 'channel')
      const internalRPCDirectory = join(result.outDir, 'rpc-internal')
      const externalRPCDirectory = join(result.outDir, 'rpc')
      const schedulerDir = join(result.outDir, 'scheduler')
      const queueDir = join(result.outDir, 'queue')
      const mcpDir = join(result.outDir, 'mcp')
      const cliDir = join(result.outDir, 'cli')

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
        result.channelsTypesFile = join(
          channelDir,
          'pikku-channel-types.gen.ts'
        )
      }

      // Internal
      if (!result.rpcInternalWiringMetaFile) {
        result.rpcInternalWiringMetaFile = join(
          internalRPCDirectory,
          'pikku-rpc-wirings-meta.internal.gen.ts'
        )
      }

      if (!result.rpcInternalMapDeclarationFile) {
        result.rpcInternalMapDeclarationFile = join(
          internalRPCDirectory,
          'pikku-rpc-wirings-map.internal.gen.d.ts'
        )
      }

      // External
      if (!result.rpcMapDeclarationFile) {
        result.rpcMapDeclarationFile = join(
          externalRPCDirectory,
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

      // Bootstrap files
      if (!result.bootstrapFile) {
        result.bootstrapFile = join(result.outDir, 'pikku-bootstrap.gen.ts')
      }

      // MCP
      if (!result.mcpWiringsMetaFile) {
        result.mcpWiringsMetaFile = join(
          mcpDir,
          'pikku-mcp-wirings-meta.gen.ts'
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
      if (!result.cliBootstrapFile) {
        result.cliBootstrapFile = join(cliDir, 'pikku-cli-bootstrap.gen.ts')
      }
      if (!result.cliTypesFile) {
        result.cliTypesFile = join(cliDir, 'pikku-cli-types.gen.ts')
      }

      result.bootstrapFiles = result.bootstrapFiles || {}
      for (const key of Object.keys(PikkuWiringTypes)) {
        const eventDir = join(result.outDir, key.toLowerCase())
        result.bootstrapFiles[key] = join(
          eventDir,
          `pikku-bootstrap-${key}.gen.ts`
        )
      }
    }

    if (requiredFields.length > 0) {
      validateCLIConfig(result, requiredFields)
    }

    for (const objectKey of Object.keys(result)) {
      if (objectKey.endsWith('File') || objectKey.endsWith('Directory')) {
        const relativeTo = CONFIG_DIR_FILES.includes(objectKey)
          ? result.configDir
          : result.rootDir
        if (result[objectKey]) {
          if (!isAbsolute(result[objectKey])) {
            result[objectKey] = join(relativeTo, result[objectKey])
          }
        }
      }
    }

    result.filters = result.filters || {}
    if (filters.tags && filters.tags.length > 0) {
      result.filters.tags = filters.tags
    }
    if (filters.types && filters.types.length > 0) {
      result.filters.types = filters.types
    }
    if (filters.directories && filters.directories.length > 0) {
      result.filters.directories = filters.directories
    }

    if (!isAbsolute(result.tsconfig)) {
      result.tsconfig = join(result.rootDir, result.tsconfig)
    }

    return result
  } catch (e: any) {
    console.error(e)
    console.error(`Config file not found: ${configFile}`)
    process.exit(1)
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
    console.error(
      `${errors.join(', ')} ${errors.length === 1 ? 'is' : 'are'} required in pikku.config.json`
    )
    process.exit(1)
  }
}
