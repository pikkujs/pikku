import type * as ts from 'typescript'
import type { ChannelsMeta } from '@pikku/core/channel'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ScheduledTasksMeta } from '@pikku/core/scheduler'
import type { TriggerMeta, TriggerSourceMeta } from '@pikku/core/trigger'
import type { QueueWorkersMeta } from '@pikku/core/queue'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import type {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'
import type { AIAgentMeta } from '@pikku/core/ai-agent'
import type { CLIMeta } from '@pikku/core/cli'
import type { NodesMeta } from '@pikku/core/node'
import type { SecretDefinitions } from '@pikku/core/secret'
import type { VariableDefinitions } from '@pikku/core/variable'
import type { TypesMap } from './types-map.js'
import type {
  FunctionsMeta,
  FunctionServicesMeta,
  FunctionWiresMeta,
  JSONValue,
} from '@pikku/core'
import type { OpenAPISpecInfo } from './utils/serialize-openapi-json.js'
import type { ErrorCode } from './error-codes.js'
import type {
  VersionManifest,
  VersionValidateError,
} from './utils/contract-hashes.js'
import type { SerializedWorkflowGraphs } from './utils/workflow/graph/workflow-graph.types.js'

export type PathToNameAndType = Map<
  string,
  { variable: string; type: string | null; typePath: string | null }[]
>

export type MetaInputTypes = Map<
  string,
  {
    query: string[] | undefined
    params: string[] | undefined
    body: string[] | undefined
  }
>

export interface MiddlewareGroupMeta {
  exportName: string | null // null if not exported
  sourceFile: string
  position: number
  services: FunctionServicesMeta
  count: number
  instanceIds: string[]
  isFactory: boolean // true if wrapped in () => add...()
}

export interface PermissionGroupMeta {
  exportName: string | null // null if not exported
  sourceFile: string
  position: number
  services: FunctionServicesMeta
  count: number
  instanceIds: string[]
  isFactory: boolean // true if wrapped in () => add...()
}

export interface InspectorHTTPState {
  metaInputTypes: MetaInputTypes
  meta: HTTPWiringsMeta
  files: Set<string>
  // HTTP middleware calls tracking - route pattern -> group metadata
  // Pattern '*' matches all routes (from addHTTPMiddleware('*', [...]))
  // Pattern '/api/*' matches specific routes (from addHTTPMiddleware('/api/*', [...]))
  routeMiddleware: Map<string, MiddlewareGroupMeta>
  // HTTP permission calls tracking - route pattern -> group metadata
  // Pattern '*' matches all routes (from addHTTPPermission('*', [...]))
  // Pattern '/api/*' matches specific routes (from addHTTPPermission('/api/*', [...]))
  routePermissions: Map<string, PermissionGroupMeta>
}

/**
 * Schema vendor types for Standard Schema compliant validators
 */
export type SchemaVendor = 'zod' | 'valibot' | 'arktype' | 'effect' | 'unknown'

/**
 * Schema reference for deferred conversion to JSON Schema at build time.
 * Supports Standard Schema compliant validators (Zod, Valibot, ArkType, Effect Schema).
 */
export interface SchemaRef {
  variableName: string
  sourceFile: string
  vendor?: SchemaVendor
}

export interface InspectorFunctionState {
  typesMap: TypesMap
  meta: FunctionsMeta
  files: Map<string, { path: string; exportedName: string }>
}

export interface InspectorChannelState {
  meta: ChannelsMeta
  files: Set<string>
}

export interface InspectorMiddlewareDefinition {
  services: FunctionServicesMeta
  wires?: FunctionWiresMeta
  sourceFile: string
  position: number
  exportedName: string | null
  factory?: boolean
  name?: string
  description?: string
  package?: string
}

export interface InspectorMiddlewareInstance {
  definitionId: string
  sourceFile: string
  position: number
  isFactoryCall: boolean
}

export interface InspectorMiddlewareState {
  definitions: Record<string, InspectorMiddlewareDefinition>
  instances: Record<string, InspectorMiddlewareInstance>
  tagMiddleware: Map<string, MiddlewareGroupMeta>
}

export interface InspectorChannelMiddlewareState {
  definitions: Record<string, InspectorMiddlewareDefinition>
  instances: Record<string, InspectorMiddlewareInstance>
  tagMiddleware: Map<string, MiddlewareGroupMeta>
}

export interface InspectorAIMiddlewareState {
  definitions: Record<string, InspectorMiddlewareDefinition>
}

export interface InspectorPermissionDefinition {
  services: FunctionServicesMeta
  wires?: FunctionWiresMeta
  sourceFile: string
  position: number
  exportedName: string | null
  factory?: boolean
  name?: string
  description?: string
  package?: string
  requiresData?: boolean
}

export interface InspectorPermissionInstance {
  definitionId: string
  sourceFile: string
  position: number
  isFactoryCall: boolean
}

export interface InspectorPermissionState {
  definitions: Record<string, InspectorPermissionDefinition>
  instances: Record<string, InspectorPermissionInstance>
  tagPermissions: Map<string, PermissionGroupMeta>
}

export type InspectorFilters = {
  names?: string[] // Wildcard support: "email-*" matches "email-worker", "email-sender"
  tags?: string[]
  types?: string[]
  directories?: string[]
  httpRoutes?: string[] // HTTP route patterns: "/api/*", "/webhooks/*"
  httpMethods?: string[] // HTTP methods: "GET", "POST", "DELETE", etc.
}

export type AddonConfig = {
  package: string
  rpcEndpoint?: string
  secretOverrides?: Record<string, string>
  forceInclude?: boolean
}

export type ModelConfigEntry =
  | string
  | { model: string; temperature?: number; maxSteps?: number }

export type InspectorModelConfig = {
  models?: Record<string, ModelConfigEntry>
  agentDefaults?: { temperature?: number; maxSteps?: number }
  agentOverrides?: Record<
    string,
    { model?: string; temperature?: number; maxSteps?: number }
  >
}

export type InspectorOptions = Partial<{
  setupOnly: boolean
  rootDir: string
  isAddon: boolean
  types: Partial<{
    configFileType: string
    userSessionType: string
    singletonServicesFactoryType: string
    wireServicesFactoryType: string
  }>
  schemaConfig: {
    tsconfig: string
    schemasFromTypes?: string[]
    schema?: { additionalProperties?: boolean }
  }
  openAPI: {
    additionalInfo: OpenAPISpecInfo
  }
  tags: string[]
  manifest: VersionManifest
  modelConfig: InspectorModelConfig
}>

export interface InspectorLogger {
  info: (message: string) => void
  error: (message: string) => void
  warn: (message: string) => void
  debug: (message: string) => void
  critical: (code: ErrorCode, message: string) => void
  hasCriticalErrors: () => boolean
}

export type AddWiring = (
  logger: InspectorLogger,
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  options: InspectorOptions
) => void
export interface InspectorFilesAndMethods {
  userSessionType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  wireServicesType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  singletonServicesType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  pikkuConfigType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  pikkuConfigFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  singletonServicesFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  wireServicesFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
}

export interface InspectorDiagnostic {
  code: string
  message: string
  sourceFile: string
  position: number
}

export interface InspectorState {
  rootDir: string // Root directory inferred from source files
  singletonServicesTypeImportMap: PathToNameAndType
  wireServicesTypeImportMap: PathToNameAndType
  userSessionTypeImportMap: PathToNameAndType
  configTypeImportMap: PathToNameAndType
  singletonServicesFactories: PathToNameAndType
  wireServicesFactories: PathToNameAndType
  wireServicesMeta: Map<string, string[]> // variable name -> singleton services consumed
  configFactories: PathToNameAndType
  filesAndMethods: InspectorFilesAndMethods
  filesAndMethodsErrors: Map<string, PathToNameAndType>
  typesLookup: Map<string, ts.Type[]> // Lookup for types by name (e.g., function input types, Config type)
  schemaLookup: Map<string, SchemaRef> // Lookup for schemas by name for deferred JSON Schema conversion (supports Standard Schema vendors)
  schemas: Record<string, JSONValue>
  http: InspectorHTTPState
  functions: InspectorFunctionState
  channels: InspectorChannelState
  triggers: {
    meta: TriggerMeta
    sourceMeta: TriggerSourceMeta
    files: Set<string>
  }
  scheduledTasks: {
    meta: ScheduledTasksMeta
    files: Set<string>
  }
  queueWorkers: {
    meta: QueueWorkersMeta
    files: Set<string>
  }
  workflows: {
    meta: WorkflowsMeta
    files: Map<string, { path: string; exportedName: string }>
    graphMeta: SerializedWorkflowGraphs
    graphFiles: Map<string, { path: string; exportedName: string }>
    invokedWorkflows: Set<string>
  }
  rpc: {
    internalMeta: Record<string, string>
    internalFiles: Map<string, { path: string; exportedName: string }>
    exposedMeta: Record<string, string>
    exposedFiles: Map<string, { path: string; exportedName: string }>
    invokedFunctions: Set<string>
    usedAddons: Set<string>
    wireAddonDeclarations: Map<
      string,
      {
        package: string
        rpcEndpoint?: string
        secretOverrides?: Record<string, string>
        variableOverrides?: Record<string, string>
      }
    >
  }
  mcpEndpoints: {
    resourcesMeta: MCPResourceMeta
    toolsMeta: MCPToolMeta
    promptsMeta: MCPPromptMeta
    files: Set<string>
  }
  agents: {
    agentsMeta: AIAgentMeta
    files: Map<string, { path: string; exportedName: string }>
  }
  cli: {
    meta: CLIMeta
    files: Set<string>
  }
  nodes: {
    meta: NodesMeta
    files: Set<string>
  }
  secrets: {
    definitions: SecretDefinitions
    files: Set<string>
  }
  variables: {
    definitions: VariableDefinitions
    files: Set<string>
  }
  manifest: {
    initial: VersionManifest | null
    current: VersionManifest | null
    errors: VersionValidateError[]
  }
  middleware: InspectorMiddlewareState
  channelMiddleware: InspectorChannelMiddlewareState
  aiMiddleware: InspectorAIMiddlewareState
  permissions: InspectorPermissionState
  serviceAggregation: {
    requiredServices: Set<string>
    usedFunctions: Set<string>
    usedMiddleware: Set<string>
    usedPermissions: Set<string>
    allSingletonServices: string[]
    allWireServices: string[]
  }
  resolvedIOTypes: Record<string, { inputType: string; outputType: string }>
  middlewareGroupsMeta: {
    definitions: Record<string, InspectorMiddlewareDefinition>
    instances: Record<string, InspectorMiddlewareInstance>
    httpGroups: Record<string, MiddlewareGroupMeta>
    tagGroups: Record<string, MiddlewareGroupMeta>
    channelMiddleware: {
      definitions: Record<string, InspectorMiddlewareDefinition>
      instances: Record<string, InspectorMiddlewareInstance>
      tagGroups: Record<string, MiddlewareGroupMeta>
    }
  }
  permissionsGroupsMeta: {
    definitions: Record<string, InspectorPermissionDefinition>
    httpGroups: Record<string, PermissionGroupMeta>
    tagGroups: Record<string, PermissionGroupMeta>
  }
  requiredSchemas: Set<string>
  openAPISpec: Record<string, any> | null
  diagnostics: InspectorDiagnostic[]
}
