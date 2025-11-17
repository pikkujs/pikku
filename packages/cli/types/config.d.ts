import { InspectorFilters } from '@pikku/inspector'
import { OpenAPISpecInfo } from '../src/functions/wirings/http/openapi-spec-generator.ts'
import { PikkuWiringTypes } from '@pikku/core'

export interface PikkuCLICoreOutputFiles {
  // Base directory
  outDir: string

  // Schema and types
  schemaDirectory: string
  typesDeclarationFile: string

  // Function definitions
  functionsFile: string
  functionsMetaFile: string
  functionsMetaJsonFile: string
  functionsMetaMinFile: string
  functionsMetaMinJsonFile: string
  functionTypesFile: string

  // HTTP
  httpWiringsFile: string
  httpWiringMetaFile: string
  httpWiringMetaJsonFile: string
  httpMapDeclarationFile: string
  httpTypesFile: string

  // Channels
  channelsWiringFile: string
  channelsWiringMetaFile: string
  channelsWiringMetaJsonFile: string
  channelsMapDeclarationFile: string
  channelsTypesFile: string

  // RPC Internal
  rpcInternalWiringMetaFile: string
  rpcInternalWiringMetaJsonFile: string
  rpcInternalMapDeclarationFile: string

  // RPC Exposed
  rpcMapDeclarationFile: string

  // Schedulers
  schedulersWiringFile: string
  schedulersWiringMetaFile: string
  schedulersWiringMetaJsonFile: string
  schedulersTypesFile: string

  // Queue processors
  queueWorkersWiringFile: string
  queueWorkersWiringMetaFile: string
  queueWorkersWiringMetaJsonFile: string
  queueMapDeclarationFile: string
  queueTypesFile: string

  // Workflows
  workflowsWiringFile: string
  workflowsWiringMetaFile: string
  workflowsWiringMetaJsonFile: string
  workflowsWorkersFile: string
  workflowMapDeclarationFile: string
  workflowTypesFile: string

  // MCP
  mcpWiringsFile: string
  mcpWiringsMetaFile: string
  mcpWiringsMetaJsonFile: string
  mcpTypesFile: string

  // CLI
  cliWiringsFile: string
  cliWiringMetaFile: string
  cliWiringMetaJsonFile: string
  cliBootstrapFile: string
  cliTypesFile: string

  // Services
  servicesFile: string

  // Middleware
  middlewareFile: string
  middlewareGroupsMetaFile: string
  middlewareGroupsMetaJsonFile: string

  // Permissions
  permissionsFile: string

  // Application bootstrap
  bootstrapFile: string
}

export type PikkuCLIInput = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  packageMappings: Record<string, string>

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

  schema?: {
    additionalProperties?: boolean
    supportsImportAttributes?: boolean
  }

  cli?: {
    entrypoints?: Record<
      string,
      | string
      | { type: 'local'; path: string }
      | {
          type: 'channel'
          name?: string
          route?: string
          wirePath: string
          path?: string
        }
      | Array<
          | string
          | { type: 'local'; path: string }
          | {
              type: 'channel'
              name?: string
              route?: string
              wirePath: string
              path?: string
            }
        >
    >
  }

  workflows?:
    | {
        singleQueue: true
        path: string
        orchestratorQueue?: string
        workerQueue?: string
      }
    | {
        singleQueue: false
        dir: string
        orchestratorQueuePrefix?: string
        workerQueuePrefix?: string
      }

  rpc?: {
    remoteRpcWorkersPath?: string
    publicRpcPath?: string
  }

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

export type PikkuCLIConfig = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  packageMappings: Record<string, string>

  configFile?: string
  tags?: string[]
  types?: string[]

  userSessionType?: string
  singletonServicesFactoryType?: string
  wireServicesFactoryType?: string

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

  schema?: {
    additionalProperties?: boolean
    supportsImportAttributes?: boolean
  }

  cli?: {
    entrypoints?: Record<
      string,
      | string
      | { type: 'local'; path: string }
      | {
          type: 'channel'
          name?: string
          route?: string
          wirePath: string
          path?: string
        }
      | Array<
          | string
          | { type: 'local'; path: string }
          | {
              type: 'channel'
              name?: string
              route?: string
              wirePath: string
              path?: string
            }
        >
    >
  }

  workflows?:
    | {
        singleQueue: true
        path: string
        orchestratorQueue?: string
        workerQueue?: string
      }
    | {
        singleQueue: false
        dir: string
        orchestratorQueuePrefix?: string
        workerQueuePrefix?: string
      }

  rpc?: {
    remoteRpcWorkersPath?: string
    publicRpcPath?: string
  }

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles
