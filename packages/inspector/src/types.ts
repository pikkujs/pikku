import * as ts from 'typescript'
import { ChannelsMeta } from '@pikku/core/channel'
import { HTTPWiringsMeta } from '@pikku/core/http'
import { ScheduledTasksMeta } from '@pikku/core/scheduler'
import { queueWorkersMeta } from '@pikku/core/queue'
import { MCPResourceMeta, MCPToolMeta, MCPPromptMeta } from '@pikku/core'
import { CLIMeta } from '@pikku/core'
import { TypesMap } from './types-map.js'
import { FunctionsMeta, FunctionServicesMeta } from '@pikku/core'

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

export interface InspectorHTTPState {
  metaInputTypes: MetaInputTypes
  meta: HTTPWiringsMeta
  files: Set<string>
  // HTTP middleware calls tracking - route pattern -> middleware names
  // Pattern '*' matches all routes (from addHTTPMiddleware([...]))
  // Pattern '/api/*' matches specific routes (from addHTTPMiddleware('/api/*', [...]))
  routeMiddleware: Map<string, string[]>
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
    }
  >
  // Tag-based middleware calls tracking
  tagMiddleware: Map<string, string[]> // tag -> middleware names (from addMiddleware)
}

export interface InspectorPermissionState {
  meta: Record<
    string,
    {
      services: FunctionServicesMeta
      sourceFile: string
      position: number
      exportedName: string | null
    }
  >
}

export type InspectorFilters = {
  tags?: string[]
  types?: string[]
  directories?: string[]
}

export type InspectorOptions = Partial<{
  types: Partial<{
    configFileType: string
    userSessionType: string
    singletonServicesFactoryType: string
    sessionServicesFactoryType: string
  }>
  filters: InspectorFilters
}>

export interface InspectorLogger {
  info: (message: string) => void
  error: (message: string) => void
  warn: (message: string) => void
  debug: (message: string) => void
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
  singletonServicesTypeImportMap: PathToNameAndType
  sessionServicesTypeImportMap: PathToNameAndType
  userSessionTypeImportMap: PathToNameAndType
  configTypeImportMap: PathToNameAndType
  singletonServicesFactories: PathToNameAndType
  sessionServicesFactories: PathToNameAndType
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
}
