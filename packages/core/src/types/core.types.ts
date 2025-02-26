import type { Logger, LogLevel } from '../services/logger.js'
import type { HTTPSessionService } from '../http/http-session-service.js'
import { VariablesService } from '../services/variables-service.js'
import { EventHubService } from '../channel/eventhub-service.js'
import { SchemaService } from '../services/schema-service.js'
import { enforceChannelAccess } from '../channel/channel.types.js'
import { enforceHTTPAccess, PikkuHTTP } from '../http/http-routes.types.js'
import { UserSessionService } from '../services/user-session-service.js'
import { JWTService } from '../services/jwt-service.js'
import { SecretService } from '../services/secret-service.js'

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
  /** The maximum compute time allowed, in milliseconds (optional). */
  maximumComputeTime?: number
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
export type CoreSingletonServices<
  Config extends CoreConfig = CoreConfig,
  UserSession extends CoreUserSession = CoreUserSession,
  UserServices extends Record<string, unknown> = {},
> = {
  /** The http permission service used for authorization (optional). */
  enforceHTTPAccess?: enforceHTTPAccess
  /** The channel permission service used by the application (optional). */
  enforceChannelAccess?: enforceChannelAccess
  /** JWT Service */
  jwt?: JWTService<UserSession>
  /** The session service used by the application (optional). */
  httpSessionService?: HTTPSessionService
  /** The schema library used to validate data */
  schemaService?: SchemaService
  /** The core configuration for the application. */
  config: Config
  /** The logger used by the application. */
  logger: Logger
  /** The variable service to be used */
  variablesService: VariablesService
  /** The subscription service that is passed to streams */
  eventHub?: EventHubService<unknown>
  /** SecretServce  */
  secretService?: SecretService
} & UserServices

/**
 * Represents different forms of interaction within Pikku and the outside world.
 */
export interface PikkuInteractions {
  http?: PikkuHTTP
}

/**
 * Represents the core services used by Pikku, including singleton services and the request/response interaction.
 */
export type CoreServices<
  SingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
  CoreServices extends Record<string, unknown> = {},
> = SingletonServices &
  PikkuInteractions & {
    userSession?: UserSessionService<UserSession>
  } & CoreServices

export type SessionServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services = CoreServices<SingletonServices>,
> = Omit<
  Services,
  keyof SingletonServices | keyof PikkuInteractions | 'session'
>

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
  interaction: PikkuInteractions,
  session: UserSession | undefined
) => Promise<SessionServices<Services, SingletonServices>>

/**
 * Defines a function type for creating config.
 */
export type CreateConfig<Config extends CoreConfig> = (
  variablesService?: VariablesService
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
