import { join, dirname, resolve, isAbsolute } from 'path'
import { readdir, readFile } from 'fs/promises'
import { OpenAPISpecInfo } from './events/http/openapi-spec-generator.js'
import { InspectorFilters } from '@pikku/inspector'
import { PikkuEventTypes } from '@pikku/core'

export interface PikkuCLICoreOutputFiles {
  // Base directory
  outDir?: string

  // Schema and types
  schemaDirectory: string
  typesDeclarationFile: string

  // Function definitions
  functionsFile: string
  functionsMetaFile: string

  // HTTP routes
  httpRoutesFile: string
  httpRoutesMetaFile: string
  httpRoutesMapDeclarationFile: string

  // Channels
  channelsFile: string
  channelsMetaFile: string
  channelsMapDeclarationFile: string

  // RPC
  rpcMetaFile: string
  rpcMapDeclarationFile: string

  // Schedulers
  schedulersFile: string
  schedulersMetaFile: string

  // Queue processors
  queueWorkersFile: string
  queueWorkersMetaFile: string
  queueMapDeclarationFile: string

  // MCP
  mcpEndpointsFile: string
  mcpEndpointsMetaFile: string

  // Services
  servicesFile: string

  // Application bootstrap
  bootstrapFile: string
  bootstrapFiles: Record<PikkuEventTypes, string>
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
  rpcFile?: string
  queueFile?: string
  mcpJsonFile?: string

  openAPI?: {
    outputFile: string
    additionalInfo: OpenAPISpecInfo
  }

  middlewareServices?: string[]

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

const CONFIG_DIR_FILES = [
  'nextBackendFile',
  'nextHTTPFile',
  'fetchFile',
  'websocketFile',
  'rpcFile',
  'queueFile',
  'mcpJsonFile',
]

export const getPikkuCLIConfig = async (
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  tags: string[] = [],
  types: string[] = [],
  directories: string[] = [],
  exitProcess: boolean = false
): Promise<PikkuCLIConfig> => {
  const config = await _getPikkuCLIConfig(
    configFile,
    requiredFields,
    tags,
    types,
    directories,
    exitProcess
  )
  return config
}

const _getPikkuCLIConfig = async (
  configFile: string | undefined = undefined,
  requiredFields: Array<keyof PikkuCLIConfig>,
  tags: string[] = [],
  types: string[] = [],
  directories: string[] = [],
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
        tags,
        types,
        directories,
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
      const rpcDir = join(result.outDir, 'rpc')
      const schedulerDir = join(result.outDir, 'scheduler')
      const queueDir = join(result.outDir, 'queue')
      const mcpDir = join(result.outDir, 'mcp')

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
      if (!result.typesDeclarationFile) {
        result.typesDeclarationFile = join(result.outDir, 'pikku-types.gen.ts')
      }

      // HTTP
      if (!result.httpRoutesFile) {
        result.httpRoutesFile = join(httpDir, 'pikku-http-routes.gen.ts')
      }
      if (!result.httpRoutesMetaFile) {
        result.httpRoutesMetaFile = join(
          httpDir,
          'pikku-http-routes-meta.gen.ts'
        )
      }
      if (!result.httpRoutesMapDeclarationFile) {
        result.httpRoutesMapDeclarationFile = join(
          httpDir,
          'pikku-http-routes-map.gen.d.ts'
        )
      }

      // Channels/WebSocket
      if (!result.channelsFile) {
        result.channelsFile = join(channelDir, 'pikku-channels.gen.ts')
      }
      if (!result.channelsMetaFile) {
        result.channelsMetaFile = join(channelDir, 'pikku-channels-meta.gen.ts')
      }
      if (!result.channelsMapDeclarationFile) {
        result.channelsMapDeclarationFile = join(
          channelDir,
          'pikku-channels-map.gen.d.ts'
        )
      }

      // RPC
      if (!result.rpcMetaFile) {
        result.rpcMetaFile = join(rpcDir, 'pikku-rpc-meta.gen.ts')
      }
      if (!result.rpcMapDeclarationFile) {
        result.rpcMapDeclarationFile = join(rpcDir, 'pikku-rpc-map.gen.ts')
      }

      // Scheduler
      if (!result.schedulersFile) {
        result.schedulersFile = join(schedulerDir, 'pikku-scheduler.gen.ts')
      }
      if (!result.schedulersMetaFile) {
        result.schedulersMetaFile = join(
          schedulerDir,
          'pikku-scheduler-meta.gen.ts'
        )
      }

      // Queue
      if (!result.queueWorkersFile) {
        result.queueWorkersFile = join(queueDir, 'pikku-queue-workers.gen.ts')
      }
      if (!result.queueWorkersMetaFile) {
        result.queueWorkersMetaFile = join(
          queueDir,
          'pikku-queue-workers-meta.gen.ts'
        )
      }
      if (!result.queueMapDeclarationFile) {
        result.queueMapDeclarationFile = join(
          queueDir,
          'pikku-queue-map.gen.ts'
        )
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
      if (!result.mcpEndpointsMetaFile) {
        result.mcpEndpointsMetaFile = join(mcpDir, 'mcp-endpoints-meta.gen.ts')
      }
      if (!result.mcpEndpointsFile) {
        result.mcpEndpointsFile = join(mcpDir, 'mcp-endpoints.gen.ts')
      }
      if (!result.mcpJsonFile) {
        result.mcpJsonFile = join(mcpDir, 'mcp.gen.json')
      }

      result.bootstrapFiles = result.bootstrapFiles || {}
      for (const key of Object.keys(PikkuEventTypes)) {
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
    if (tags.length > 0) {
      result.filters.tags = tags
    }
    if (types.length > 0) {
      result.filters.types = types
    }
    if (directories.length > 0) {
      result.filters.directories = directories
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
