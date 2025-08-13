import type { Logger, LogLevel } from '../services/logger.js'
import { VariablesService } from '../services/variables-service.js'
import { SchemaService } from '../services/schema-service.js'
import { PikkuHTTP } from '../wirings/http/http.types.js'
import { UserSessionService } from '../services/user-session-service.js'
import { PikkuChannel } from '../wirings/channel/channel.types.js'
import { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import { PikkuMCP } from '../wirings/mcp/mcp.types.js'

export enum PikkuWiringTypes {
  http = 'http',
  scheduler = 'scheduler',
  channel = 'channel',
  rpc = 'rpc',
  queue = 'queue',
  mcp = 'mcp',
}

export interface FunctionServicesMeta {
  optimized: boolean
  services: string[]
}

export type FunctionsMeta = Record<
  string,
  {
    pikkuFuncName: string
    name?: string
    services: FunctionServicesMeta
    schemaName: string | null
    inputs: string[] | null
    outputs: string[] | null
  }
>

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
export interface PikkuInteraction {
  http?: PikkuHTTP
  mcp?: PikkuMCP
  rpc?: PikkuRPC
}

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
 * Represents the core services used by Pikku, including singleton services and the request/response interaction.
 */
export type CoreServices<
  SingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
  CoreServices extends Record<string, unknown> = {},
> = SingletonServices &
  PikkuInteraction & {
    mcp?: PikkuMCP
    rpc?: PikkuRPC
    userSession?: UserSessionService<UserSession>
    channel?: PikkuChannel<unknown, unknown>
  } & CoreServices

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
export type CreateConfig<Config extends CoreConfig> = (
  variables?: VariablesService
) => Promise<Config>

/**
 * Represents the documentation for a route, including summary, description, tags, and errors.
 */
export type APIDocs = {
  summary?: string
  description?: string
  tags?: string[]
  errors?: string[]
}
