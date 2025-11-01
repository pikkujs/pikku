import * as ts from 'typescript'
import { ChannelsMeta } from '@pikku/core/channel'
import { HTTPWiringsMeta } from '@pikku/core/http'
import { ScheduledTasksMeta } from '@pikku/core/scheduler'
import { queueWorkersMeta } from '@pikku/core/queue'
import { MCPResourceMeta, MCPToolMeta, MCPPromptMeta } from '@pikku/core/mcp'
import { CLIMeta } from '@pikku/core/cli'
import { TypesMap } from './types-map.js'
import { FunctionsMeta, FunctionServicesMeta } from '@pikku/core'
import { ErrorCode } from './error-codes.js'

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
  middlewareCount: number
  isFactory: boolean // true if wrapped in () => add...()
}

export interface PermissionGroupMeta {
  exportName: string | null // null if not exported
  sourceFile: string
  position: number
  services: FunctionServicesMeta
  permissionCount: number
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

export interface InspectorFunctionState {
  typesMap: TypesMap
  meta: FunctionsMeta
  files: Map<string, { path: string; exportedName: string }>
}

export interface InspectorChannelState {
  meta: ChannelsMeta
  files: Set<string>
}

export interface InspectorMiddlewareState {
  // Individual middleware function metadata
  meta: Record<
    string,
    {
      services: FunctionServicesMeta
      sourceFile: string
      position: number
      exportedName: string | null
      factory?: boolean // true if wrapped with pikkuMiddlewareFactory
      name?: string // optional name from pikkuMiddleware({ name: '...' })
      description?: string // optional description from pikkuMiddleware({ description: '...' })
    }
  >
  // Tag-based middleware calls tracking - tag -> group metadata
  // e.g., export const adminMiddleware = () => addMiddleware('admin', [...])
  tagMiddleware: Map<string, MiddlewareGroupMeta>
}

export interface InspectorPermissionState {
  // Individual permission function metadata
  meta: Record<
    string,
    {
      services: FunctionServicesMeta
      sourceFile: string
      position: number
      exportedName: string | null
      factory?: boolean // true if wrapped with pikkuPermissionFactory
      name?: string // optional name from pikkuPermission({ name: '...' })
      description?: string // optional description from pikkuPermission({ description: '...' })
    }
  >
  // Tag-based permission calls tracking - tag -> group metadata
  // e.g., export const adminPermissions = () => addPermission('admin', [...])
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

export type InspectorOptions = Partial<{
  setupOnly: boolean
  types: Partial<{
    configFileType: string
    userSessionType: string
    singletonServicesFactoryType: string
    sessionServicesFactoryType: string
  }>
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
  sessionServicesType?: {
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
  sessionServicesFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
}

export interface InspectorState {
  rootDir: string // Root directory inferred from source files
  singletonServicesTypeImportMap: PathToNameAndType
  sessionServicesTypeImportMap: PathToNameAndType
  userSessionTypeImportMap: PathToNameAndType
  configTypeImportMap: PathToNameAndType
  singletonServicesFactories: PathToNameAndType
  sessionServicesFactories: PathToNameAndType
  sessionServicesMeta: Map<string, string[]> // variable name -> singleton services consumed
  configFactories: PathToNameAndType
  filesAndMethods: InspectorFilesAndMethods
  filesAndMethodsErrors: Map<string, PathToNameAndType>
  typesLookup: Map<string, ts.Type[]> // Lookup for types by name (e.g., function input types, Config type)
  http: InspectorHTTPState
  functions: InspectorFunctionState
  channels: InspectorChannelState
  scheduledTasks: {
    meta: ScheduledTasksMeta
    files: Set<string>
  }
  queueWorkers: {
    meta: queueWorkersMeta
    files: Set<string>
  }
  rpc: {
    internalMeta: Record<string, string>
    internalFiles: Map<string, { path: string; exportedName: string }>
    exposedMeta: Record<string, string>
    exposedFiles: Map<string, { path: string; exportedName: string }>
    invokedFunctions: Set<string> // Track functions called via rpc.invoke()
  }
  mcpEndpoints: {
    resourcesMeta: MCPResourceMeta
    toolsMeta: MCPToolMeta
    promptsMeta: MCPPromptMeta
    files: Set<string>
  }
  cli: {
    meta: CLIMeta
    files: Set<string>
  }
  middleware: InspectorMiddlewareState
  permissions: InspectorPermissionState
  serviceAggregation: {
    requiredServices: Set<string> // All services needed across the app
    usedFunctions: Set<string> // Function names actually wired/exposed
    usedMiddleware: Set<string> // Middleware names used by wired functions
    usedPermissions: Set<string> // Permission names used by wired functions
    allSingletonServices: string[] // All services available in SingletonServices type
    allSessionServices: string[] // All services available in Services type (excluding SingletonServices)
  }
}
