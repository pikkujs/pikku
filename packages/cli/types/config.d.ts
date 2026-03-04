import type { InspectorFilters } from '@pikku/inspector'
import type { OpenAPISpecInfo } from '@pikku/inspector'
import { PikkuWiringTypes } from '@pikku/core'

export type PikkuScaffoldFeature = 'auth' | 'no-auth' | false

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
  functionTypesFile: string

  // HTTP
  httpWiringsFile: string
  httpWiringMetaFile: string
  httpWiringMetaJsonFile: string
  httpMapDeclarationFile: string
  httpTypesFile: string

  // Gateways
  gatewaysWiringFile: string

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

  // Remote RPC workers (auto-derived)
  remoteRpcWorkersFile: string

  // Feature-generated files (derived from scaffold.pikkuDir when enabled)
  publicRpcFile: string
  publicAgentFile: string
  consoleFunctionsFile: string
  workflowWorkersFile: string

  // Triggers
  triggersTypesFile: string
  triggersWiringFile: string
  triggersWiringMetaFile: string
  triggersWiringMetaJsonFile: string
  triggerSourcesMetaFile: string
  triggerSourcesMetaJsonFile: string

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
  workflowsWorkersFile: string
  workflowMapDeclarationFile: string
  workflowTypesFile: string
  workflowMetaDir: string

  // MCP
  mcpWiringsFile: string
  mcpWiringsMetaFile: string
  mcpWiringsMetaJsonFile: string
  mcpTypesFile: string

  // AI Agent
  agentWiringsFile: string
  agentWiringMetaFile: string
  agentWiringMetaJsonFile: string
  agentTypesFile: string
  agentMapDeclarationFile: string

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
  middlewareGroupsMetaJsonFile: string

  // Permissions
  permissionsFile: string
  permissionsGroupsMetaJsonFile: string

  // Application bootstrap
  bootstrapFile: string

  // Package service factories (for addon packages)
  packageFile: string

  // Addon types (pikkuAddonConfig, pikkuAddonServices, etc.)
  addonTypesFile: string

  // Node
  nodeTypesFile: string

  // Secrets
  secretTypesFile: string

  // Secrets (typed wrapper for SecretService)
  secretsFile: string

  // Secrets metadata JSON
  secretsMetaJsonFile: string

  // Variables
  variableTypesFile: string

  // Variables (typed wrapper for VariablesService)
  variablesFile: string

  // Variables metadata JSON
  variablesMetaJsonFile: string
}

export type PikkuCLIInput = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  packageMappings: Record<string, string>
  addon?:
    | boolean
    | {
        categories?: string[]
        icon?: string
        displayName?: string
        description?: string
      }
  addonName?: string

  models?: Record<
    string,
    string | { model: string; temperature?: number; maxSteps?: number }
  >
  agentDefaults?: { temperature?: number; maxSteps?: number }
  agentOverrides?: Record<
    string,
    { model?: string; temperature?: number; maxSteps?: number }
  >

  configDir: string
  tsconfig: string

  clientFiles?: {
    fetchFile?: string
    websocketFile?: string
    rpcWiringsFile?: string
    queueWiringsFile?: string
    mcpJsonFile?: string
    nextBackendFile?: string
    nextHTTPFile?: string
  }

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

  workflows?: {
    orchestratorQueue?: string
    workerQueue?: string
  }

  scaffold?: {
    addonDir?: string
    functionDir?: string
    wiringDir?: string
    middlewareDir?: string
    permissionDir?: string
    pikkuDir?: string
    rpc?: PikkuScaffoldFeature
    console?: PikkuScaffoldFeature
    agent?: PikkuScaffoldFeature
    workflow?: PikkuScaffoldFeature
  }

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  verboseMeta?: boolean

  lint?: {
    servicesNotDestructured?: 'off' | 'warn' | 'error'
    wiresNotDestructured?: 'off' | 'warn' | 'error'
  }

  addonMetaJsonFile?: string

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

export type PikkuCLIConfig = {
  $schema?: string

  extends?: string

  rootDir: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  packageMappings: Record<string, string>
  addon?:
    | boolean
    | {
        categories?: string[]
        icon?: string
        displayName?: string
        description?: string
      }
  addonName?: string

  models?: Record<
    string,
    string | { model: string; temperature?: number; maxSteps?: number }
  >
  agentDefaults?: { temperature?: number; maxSteps?: number }
  agentOverrides?: Record<
    string,
    { model?: string; temperature?: number; maxSteps?: number }
  >

  configFile?: string
  tags?: string[]
  types?: string[]

  userSessionType?: string
  singletonServicesFactoryType?: string
  wireServicesFactoryType?: string

  configDir: string
  tsconfig: string

  clientFiles?: {
    fetchFile?: string
    websocketFile?: string
    rpcWiringsFile?: string
    queueWiringsFile?: string
    mcpJsonFile?: string
    nextBackendFile?: string
    nextHTTPFile?: string
  }

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

  workflows?: {
    orchestratorQueue?: string
    workerQueue?: string
  }

  scaffold?: {
    addonDir?: string
    functionDir?: string
    wiringDir?: string
    middlewareDir?: string
    permissionDir?: string
    pikkuDir?: string
    rpc?: PikkuScaffoldFeature
    console?: PikkuScaffoldFeature
    agent?: PikkuScaffoldFeature
    workflow?: PikkuScaffoldFeature
  }

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  verboseMeta?: boolean

  lint?: {
    servicesNotDestructured?: 'off' | 'warn' | 'error'
    wiresNotDestructured?: 'off' | 'warn' | 'error'
  }

  addonMetaJsonFile?: string

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles
