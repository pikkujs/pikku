import type { Logger, LogLevel } from '../services/logger.js'
import { VariablesService } from '../services/variables-service.js'
import { SecretService } from '../services/secret-service.js'
import { SchemaService } from '../services/schema-service.js'
import { JWTService } from '../services/jwt-service.js'
import { PikkuHTTP } from '../wirings/http/http.types.js'
import {
  PikkuChannel,
  CorePikkuChannelMiddleware,
  CorePikkuChannelMiddlewareFactory,
} from '../wirings/channel/channel.types.js'
import { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import { PikkuMCP } from '../wirings/mcp/mcp.types.js'
import { PikkuScheduledTask } from '../wirings/scheduler/scheduler.types.js'
import { PikkuQueue, QueueService } from '../wirings/queue/queue.types.js'
import { PikkuCLI } from '../wirings/cli/cli.types.js'
import {
  PikkuWorkflowWire,
  WorkflowService,
  WorkflowServiceConfig,
  WorkflowStepWire,
} from '../wirings/workflow/workflow.types.js'
import type { PikkuGraphWire } from '../wirings/workflow/graph/workflow-graph.types.js'
import { PikkuTrigger } from '../wirings/trigger/trigger.types.js'
import { SchedulerService } from '../services/scheduler-service.js'
import { DeploymentService } from '../services/deployment-service.js'
import { AIStorageService } from '../services/ai-storage-service.js'
import { AIVectorService } from '../services/ai-vector-service.js'
import { AIEmbedderService } from '../services/ai-embedder-service.js'
import { AIAgentRunnerService } from '../services/ai-agent-runner-service.js'
import { AIRunStateService } from '../services/ai-run-state-service.js'

export type PikkuWiringTypes =
  | 'http'
  | 'scheduler'
  | 'trigger'
  | 'channel'
  | 'rpc'
  | 'queue'
  | 'mcp'
  | 'cli'
  | 'workflow'
  | 'agent'

export interface FunctionServicesMeta {
  optimized: boolean
  services: string[]
}

/**
 * Metadata for middleware at any level
 * - type: 'http' = HTTP route middleware group (references httpGroup in pikkuState)
 * - type: 'tag' = Tag-based middleware group (references tagGroup in pikkuState)
 * - type: 'wire' = Wire-level individual middleware
 */
export type MiddlewareMetadata =
  | {
      type: 'http'
      route: string // Route pattern (e.g., '*' for all, '/api/*' for specific)
    }
  | {
      type: 'tag'
      tag: string // Tag name
    }
  | {
      type: 'wire'
      name: string
      inline?: boolean // true if inline middleware
    }

/**
 * Metadata for permissions at any level
 * - type: 'http' = HTTP route permission group (references httpGroup in pikkuState)
 * - type: 'tag' = Tag-based permission group (references tagGroup in pikkuState)
 * - type: 'wire' = Wire-level individual permission
 */
export type PermissionMetadata =
  | {
      type: 'http'
      route: string // Route pattern (e.g., '*' for all, '/api/*' for specific)
    }
  | {
      type: 'tag'
      tag: string // Tag name
    }
  | {
      type: 'wire'
      name: string
      inline?: boolean // true if inline permission
    }

export type FunctionRuntimeMeta = {
  pikkuFuncId: string
  inputSchemaName: string | null
  outputSchemaName: string | null
  expose?: boolean
  internal?: boolean
  sessionless?: boolean
  version?: number
  requiresApproval?: boolean
}

export type FunctionMeta = FunctionRuntimeMeta &
  Partial<
    {
      name: string
      functionType: 'user' | 'inline' | 'helper'
      funcWrapper: string
      services: FunctionServicesMeta
      usedWires: string[]
      inputs: string[] | null
      outputs: string[] | null
      inputsSchemaHash: string
      outputsSchemaHash: string
      middleware: MiddlewareMetadata[]
      permissions: PermissionMetadata[]
      isDirectFunction: boolean
    } & CommonWireMeta
  >

export type FunctionsRuntimeMeta = Record<string, FunctionRuntimeMeta>
export type FunctionsMeta = Record<string, FunctionMeta>

// Optimized runtime metadata with only essential fields

export type MakeRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>

/**
 * Represents a JSON primitive type which can be a string, number, boolean, null, or undefined.
 */
export type JSONPrimitive = string | number | boolean | null | undefined

/**
 * Represents a JSON value which can be a primitive, an array, or an object.
 */
export type JSONValue =
  | JSONPrimitive
  | JSONValue[]
  | {
      [key: string]: JSONValue
    }

/**
 * Utility type for making certain keys required and leaving the rest as optional.
 */
export type PickRequired<T, K extends keyof T> = Required<Pick<T, K>> &
  Partial<T>

/**
 * Utility type for making certain keys optional while keeping the rest required.
 */
export type PickOptional<T, K extends keyof T> = Partial<T> & Pick<T, K>

/**
 * Utility type that ensures at least one key in the given type `T` is required.
 */
export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

/**
 * Interface for the core configuration settings of Pikku.
 */
export type CoreConfig<Config extends Record<string, unknown> = {}> = {
  /** The log level for the application. */
  logLevel?: LogLevel
  /** Secrets used by the application (optional). */
  secrets?: {}

  workflow?: WorkflowServiceConfig
} & Config

/**
 * Represents a core user session, which can be extended for more specific session information.
 */
export interface CoreUserSession {}

/**
 * Interface for core singleton services provided by Pikku.
 */
export interface CoreSingletonServices<Config extends CoreConfig = CoreConfig> {
  /** The schema library used to validate data */
  schema?: SchemaService
  /** The JWT service used to encode and decode tokens */
  jwt?: JWTService
  /** The core configuration for the application. */
  config: Config
  /** The logger used by the application. */
  logger: Logger
  /** The variable service to be used */
  variables: VariablesService
  /** The secrets service to retrieve secrets */
  secrets: SecretService
  /** The workflow orchestrator service */
  workflowService?: WorkflowService
  /** The queue service */
  queueService?: QueueService
  /** The scheduler service */
  schedulerService?: SchedulerService
  /** The deployment service for service discovery */
  deploymentService?: DeploymentService
  /** AI agent storage service (threads, messages, working memory) */
  aiStorage?: AIStorageService
  /** AI vector store service (embeddings) */
  aiVector?: AIVectorService
  /** AI embedder service (text to vectors) */
  aiEmbedder?: AIEmbedderService
  /** AI agent runner service (model calls + tool loop) */
  aiAgentRunner?: AIAgentRunnerService
  /** AI run state service (run lifecycle + approval persistence) */
  aiRunState?: AIRunStateService
}

/**
 * Represents different forms of wire within Pikku and the outside world.
 */
export type PikkuWire<
  In = unknown,
  Out = unknown,
  HasInitialSession extends boolean = false,
  UserSession extends CoreUserSession = CoreUserSession,
  TypedRPC extends PikkuRPC = PikkuRPC,
  IsChannel extends true | null = null,
  MCPTools extends string | never = never,
  TypedWorkflow extends PikkuWorkflowWire | never = PikkuWorkflowWire,
  TriggerOutput = unknown,
> = Partial<{
  http: PikkuHTTP<In>
  mcp: PikkuMCP<MCPTools>
  rpc: TypedRPC
  channel: [IsChannel] extends [null]
    ? PikkuChannel<unknown, Out>
    : PikkuChannel<unknown, Out> | undefined
  scheduledTask: PikkuScheduledTask
  queue: PikkuQueue
  cli: PikkuCLI
  workflow: TypedWorkflow
  workflowStep: WorkflowStepWire
  graph: PikkuGraphWire
  trigger: PikkuTrigger<TriggerOutput>
  session: HasInitialSession extends true
    ? UserSession
    : UserSession | undefined
  setSession: (session: CoreUserSession) => Promise<void> | void
  clearSession: () => Promise<void> | void
  getSession: () => Promise<UserSession> | UserSession | undefined
  hasSessionChanged: () => boolean
}>

/**
 * A function that can wrap an wire and be called before or after
 */
export type CorePikkuMiddleware<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices,
  wires: PikkuWire<unknown, unknown, false, UserSession>,
  next: () => Promise<void>
) => Promise<void>

/**
 * Configuration object for creating middleware with metadata
 *
 * @template SingletonServices - The singleton services type
 * @template UserSession - The user session type
 */
export type CorePikkuMiddlewareConfig<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  /** The middleware function */
  func: CorePikkuMiddleware<SingletonServices, UserSession>
  /** Optional human-readable title for the middleware */
  title?: string
  /** Optional description of what the middleware does */
  description?: string
}

/**
 * A factory function that takes input and returns middleware
 * Used when middleware needs configuration/input parameters
 */
export type CorePikkuMiddlewareFactory<
  In = any,
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (input: In) => CorePikkuMiddleware<SingletonServices, UserSession>

/**
 * A group of middleware (combination of regular middleware and factories)
 * Used with addMiddleware() and addHTTPMiddleware() to group related middleware together
 */
export type CorePikkuMiddlewareGroup<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = Array<
  | CorePikkuMiddleware<SingletonServices, UserSession>
  | CorePikkuMiddlewareFactory<any, SingletonServices, UserSession>
>

/**
 * Factory function for creating middleware with tree-shaking support
 * Supports both direct function and configuration object syntax
 *
 * @example
 * ```typescript
 * // Direct function syntax
 * export const logMiddleware = pikkuMiddleware(
 *   async ({ logger }, next) => {
 *     logger.info('Request started')
 *     await next()
 *   }
 * )
 *
 * // Configuration object syntax with metadata
 * export const logMiddleware = pikkuMiddleware({
 *   title: 'Request Logger',
 *   description: 'Logs request information',
 *   func: async ({ logger }, next) => {
 *     logger.info('Request started')
 *     await next()
 *   }
 * })
 * ```
 */
export const pikkuMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
>(
  middleware:
    | CorePikkuMiddleware<SingletonServices, UserSession>
    | CorePikkuMiddlewareConfig<SingletonServices, UserSession>
): CorePikkuMiddleware<SingletonServices, UserSession> => {
  return typeof middleware === 'function' ? middleware : middleware.func
}

/**
 * Factory function for creating middleware factories
 * Use this when your middleware needs configuration/input parameters
 *
 * @example
 * ```typescript
 * export const logMiddleware = pikkuMiddlewareFactory<LogOptions>(({
 *   message,
 *   level = 'info'
 * }) => {
 *   return pikkuMiddleware(async ({ logger }, next) => {
 *     logger[level](message)
 *     await next()
 *   })
 * })
 * ```
 */
export const pikkuMiddlewareFactory = <In = any>(
  factory: CorePikkuMiddlewareFactory<In>
): CorePikkuMiddlewareFactory<In> => {
  return factory
}

export const pikkuChannelMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Event = unknown,
>(
  middleware: CorePikkuChannelMiddleware<SingletonServices, Event>
): CorePikkuChannelMiddleware<SingletonServices, Event> => {
  return middleware
}

export const pikkuChannelMiddlewareFactory = <In = any>(
  factory: CorePikkuChannelMiddlewareFactory<In>
): CorePikkuChannelMiddlewareFactory<In> => {
  return factory
}

import type { PikkuAIMiddlewareHooks } from '../wirings/ai-agent/ai-agent.types.js'
export type { PikkuAIMiddlewareHooks } from '../wirings/ai-agent/ai-agent.types.js'

export const pikkuAIMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Event = unknown,
>(
  hooks: PikkuAIMiddlewareHooks<SingletonServices, Event>
): PikkuAIMiddlewareHooks<SingletonServices, Event> => hooks

/**
 * Represents the core services used by Pikku, including singleton services.
 */
export type CoreServices<SingletonServices = CoreSingletonServices> =
  SingletonServices

export type WireServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services = CoreServices<SingletonServices>,
> = Omit<Services, keyof SingletonServices | 'session'>

/**
 * Defines a function type for creating singleton services from the given configuration.
 */
export type CreateSingletonServices<
  Config extends CoreConfig,
  SingletonServices extends CoreSingletonServices,
> = (
  config: Config,
  existingServices?: Partial<SingletonServices>
) => Promise<SingletonServices>

/**
 * Defines a function type for creating session-specific services.
 */
export type CreateWireServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services extends
    CoreServices<SingletonServices> = CoreServices<SingletonServices>,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices,
  wire: PikkuWire<unknown, unknown, false, UserSession>
) => Promise<WireServices<Services, SingletonServices>>

/**
 * Defines a function type for creating config.
 */
export type CreateConfig<
  Config extends CoreConfig,
  RemainingArgs extends any[] = unknown[],
> = (variables?: VariablesService, ...args: RemainingArgs) => Promise<Config>

/**
 * Represents the documentation for a route, including summary, description, tags, and errors.
 */
export type CommonWireMeta = {
  pikkuFuncId: string

  title?: string
  tags?: string[]
  summary?: string
  description?: string
  errors?: string[]

  middleware?: MiddlewareMetadata[]
  permissions?: PermissionMetadata[]
}

/**
 * Serialized error for storage
 */
export interface SerializedError {
  message: string
  stack?: string
  code?: string
  [key: string]: any
}
