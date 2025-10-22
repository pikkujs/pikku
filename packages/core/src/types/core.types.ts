import type { Logger, LogLevel } from '../services/logger.js'
import { VariablesService } from '../services/variables-service.js'
import { SchemaService } from '../services/schema-service.js'
import { PikkuHTTP } from '../wirings/http/http.types.js'
import { UserSessionService } from '../services/user-session-service.js'
import { PikkuChannel } from '../wirings/channel/channel.types.js'
import { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import { PikkuMCP } from '../wirings/mcp/mcp.types.js'
import { PikkuScheduledTask } from '../wirings/scheduler/scheduler.types.js'
import { PikkuQueue } from '../wirings/queue/queue.types.js'
import { PikkuCLI } from '../wirings/cli/cli.types.js'

export enum PikkuWiringTypes {
  http = 'http',
  scheduler = 'scheduler',
  channel = 'channel',
  rpc = 'rpc',
  queue = 'queue',
  mcp = 'mcp',
  cli = 'cli',
}

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
  pikkuFuncName: string
  inputSchemaName: string | null
  outputSchemaName: string | null
  expose?: boolean
}

export type FunctionMeta = FunctionRuntimeMeta &
  Partial<{
    name: string
    services: FunctionServicesMeta
    inputs: string[] | null
    outputs: string[] | null
    tags: string[]
    docs: PikkuDocs
    isDirectFunction: boolean // true if it's pikkuFunc(fn), false if it's pikkuFunc({ func: fn })
    middleware: MiddlewareMetadata[] // Function-level middleware
    permissions: PermissionMetadata[] // Function-level permissions
  }>

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
  /** The core configuration for the application. */
  config: Config
  /** The logger used by the application. */
  logger: Logger
  /** The variable service to be used */
  variables: VariablesService
}

/**
 * Represents different forms of interaction within Pikku and the outside world.
 */
export type PikkuInteraction<In = unknown, Out = unknown> = Partial<{
  http: PikkuHTTP<In>
  mcp: PikkuMCP
  rpc: PikkuRPC
  channel: PikkuChannel<unknown, Out>
  scheduledTask: PikkuScheduledTask
  queue: PikkuQueue
  cli: PikkuCLI
}>

/**
 * A function that can wrap an interaction and be called before or after
 */
export type CorePikkuMiddleware<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices & {
    userSession: UserSessionService<UserSession>
  },
  interactions: PikkuInteraction,
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
  /** Optional human-readable name for the middleware */
  name?: string
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
 *   async ({ logger }, _interaction, next) => {
 *     logger.info('Request started')
 *     await next()
 *   }
 * )
 *
 * // Configuration object syntax with metadata
 * export const logMiddleware = pikkuMiddleware({
 *   name: 'Request Logger',
 *   description: 'Logs request information',
 *   func: async ({ logger }, _interaction, next) => {
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
 *   return pikkuMiddleware(async ({ logger }, _interaction, next) => {
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

/**
 * Represents the core services used by Pikku, including singleton services and the request/response interaction.
 */
export type CoreServices<
  SingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = SingletonServices &
  PikkuInteraction & {
    userSession?: UserSessionService<UserSession>
  }

export type SessionServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services = CoreServices<SingletonServices>,
> = Omit<Services, keyof SingletonServices | keyof PikkuInteraction | 'session'>

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
export type CreateSessionServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services extends
    CoreServices<SingletonServices> = CoreServices<SingletonServices>,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices,
  interaction: PikkuInteraction,
  session: UserSession | undefined
) => Promise<SessionServices<Services, SingletonServices>>

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
export type PikkuDocs = {
  summary?: string
  description?: string
  tags?: string[]
  errors?: string[]
}
