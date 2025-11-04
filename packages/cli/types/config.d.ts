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

  // Workflows
  workflowsWiringFile: string
  workflowsWiringMetaFile: string
  workflowsWorkersFile: string
  workflowMapDeclarationFile: string
  workflowTypesFile: string

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

  // Middleware
  middlewareFile: string
  middlewareGroupsMetaFile: string

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
  sessionServicesFactoryType?: string

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

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles
