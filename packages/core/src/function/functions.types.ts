import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
  PikkuWire,
  PickRequired,
} from '../types/core.types.js'
import { Session } from 'inspector'

/**
 * Represents a core API function that performs an operation using core services and a user session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Wire - The wire type, defaults to `PikkuWire<In, Out>`.
 */
export type CorePikkuFunction<
  In,
  Out,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PikkuWire<In, Out> = PikkuWire<In, Out, true, Session>,
> = (
  services: Services,
  data: In,
  wire: Wire
) => Wire['channel'] extends null ? Promise<Out> : Promise<Out> | Promise<void>

/**
 * Represents a core API function that can be used without a session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Wire - The wire type, defaults to `PikkuWire<In, Out>`.
 */
export type CorePikkuFunctionSessionless<
  In,
  Out,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PikkuWire<
    In,
    Out,
    false,
    CoreUserSession,
    any,
    any,
    any
  > = PikkuWire<In, Out, false, CoreUserSession, any, any, any>,
> = (
  services: Services,
  data: In,
  wire: Wire
) => Wire['channel'] extends null ? Promise<Out> : Promise<Out> | Promise<void>

/**
 * Represents a function that checks permissions for a given operation.
 *
 * @template In - The input type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuPermission<
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PikkuWire<
    In,
    never,
    false,
    CoreUserSession,
    any,
    never,
    never
  > = PikkuWire<In, never, false, CoreUserSession, never, never, never>,
> = (services: Services, data: In, wire: Wire) => Promise<boolean>

/**
 * Configuration object for creating a permission with metadata
 *
 * @template In - The input type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuPermissionConfig<
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PikkuWire<In, never, false, CoreUserSession> = PikkuWire<
    In,
    never,
    false,
    CoreUserSession
  >,
> = {
  /** The permission function */
  func: CorePikkuPermission<In, Services, Wire>
  /** Optional human-readable name for the permission */
  name?: string
  /** Optional description of what the permission checks */
  description?: string
}

/**
 * Factory function for creating permissions with tree-shaking support
 * Supports both direct function and configuration object syntax
 *
 * @example
 * ```typescript
 * // Direct function syntax
 * export const adminPermission = pikkuPermission(
 *   async ({ logger }, _data, { session }) => {
 *     const currentSession = await session.get()
 *     return currentSession?.role === 'admin'
 *   }
 * )
 *
 * // Configuration object syntax with metadata
 * export const adminPermission = pikkuPermission({
 *   name: 'Admin Permission',
 *   description: 'Checks if user has admin role',
 *   func: async ({ logger }, _data, { session }) => {
 *     const currentSession = await session.get()
 *     return currentSession?.role === 'admin'
 *   }
 * })
 * ```
 */
export const pikkuPermission = <
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PickRequired<
    PikkuWire<In, never, false, CoreUserSession>,
    'session'
  > = PickRequired<PikkuWire<In, never, false, CoreUserSession>, 'session'>,
>(
  permission:
    | CorePikkuPermission<In, Services, Wire>
    | CorePikkuPermissionConfig<In, Services, Wire>
): CorePikkuPermission<In, Services, Wire> => {
  return typeof permission === 'function' ? permission : permission.func
}

/**
 * A factory function that takes input and returns a permission
 * Used when permissions need configuration/input parameters
 *
 * @template In - The input type for the factory.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuPermissionFactory<
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PikkuWire<In, never, false, CoreUserSession> = PikkuWire<
    In,
    never,
    false,
    CoreUserSession
  >,
> = (input: In) => CorePikkuPermission<any, Services, Wire>

/**
 * Factory function for creating permission factories
 * Use this when your permission needs configuration/input parameters
 *
 * @example
 * ```typescript
 * export const requireRole = pikkuPermissionFactory<{ role: string }>(({
 *   role
 * }) => {
 *   return pikkuPermission(async ({ logger }, data, { session }) => {
 *      const currentSession = await session.get()
 *     if (!currentSession || currentSession.role !== role) {
 *       logger.warn(`Permission denied: required role '${role}'`)
 *       return false
 *     }
 *     return true
 *   })
 * })
 * ```
 */
export const pikkuPermissionFactory = <In = any>(
  factory: CorePikkuPermissionFactory<In>
): CorePikkuPermissionFactory<In> => {
  return factory
}

export type CorePermissionGroup<PikkuPermission = CorePikkuPermission<any>> =
  | Record<string, PikkuPermission | PikkuPermission[]>
  | undefined

/**
 * Zod schema type - matches z.ZodType shape for type inference
 * This avoids requiring zod as a dependency while allowing schema inference
 */
export type ZodLike<T = any> = {
  _input: T
  _output: T
}

export type CorePikkuFunctionConfig<
  PikkuFunction extends
    | CorePikkuFunction<any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any>,
  PikkuPermission extends CorePikkuPermission<
    any,
    any,
    any
  > = CorePikkuPermission<any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
  InputSchema extends ZodLike | undefined = undefined,
  OutputSchema extends ZodLike | undefined = undefined,
> = {
  override?: string
  tags?: string[]
  expose?: boolean
  internal?: boolean
  func: PikkuFunction
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission>
  middleware?: PikkuMiddleware[]
  input?: InputSchema
  output?: OutputSchema
}

/**
 * A trigger function that sets up a subscription and returns a teardown function.
 * The trigger is fired via wire.trigger.trigger(data).
 *
 * @template TConfig - Configuration type (hardcoded when wired)
 * @template TOutput - Output type produced when trigger fires
 * @template Services - Services available to the trigger
 */
export type CorePikkuTriggerFunction<
  TConfig = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
> = (
  services: Services,
  config: TConfig,
  wire: { trigger: { trigger: (data: TOutput) => void } }
) => Promise<() => void | Promise<void>>

/**
 * Configuration object for creating a trigger function with metadata
 */
export type CorePikkuTriggerFunctionConfig<
  TConfig = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
  ConfigSchema extends ZodLike | undefined = undefined,
  OutputSchema extends ZodLike | undefined = undefined,
> = {
  /** Optional human-readable name for the trigger */
  name?: string
  /** Optional description of what the trigger does */
  description?: string
  /** Optional tags for categorization */
  tags?: string[]
  /** The trigger function */
  func: CorePikkuTriggerFunction<TConfig, TOutput, Services>
  /** Optional Zod schema for config validation */
  config?: ConfigSchema
  /** Optional Zod schema for output validation */
  output?: OutputSchema
}

/**
 * Factory function for creating trigger functions
 * Supports both direct function and configuration object syntax
 *
 * @example
 * ```typescript
 * // Direct function syntax
 * export const redisSubscribeTrigger = pikkuTriggerFunc<
 *   { channel: string },
 *   { message: string }
 * >(async ({ redis }, { channel }, { trigger }) => {
 *   const subscriber = redis.duplicate()
 *   await subscriber.subscribe(channel, (msg) => {
 *     trigger.trigger({ message: msg })
 *   })
 *   return () => subscriber.unsubscribe()
 * })
 *
 * // Configuration object syntax with metadata
 * export const redisSubscribeTrigger = pikkuTriggerFunc({
 *   name: 'Redis Subscribe Trigger',
 *   description: 'Listens to Redis pub/sub channel',
 *   config: z.object({ channel: z.string() }),
 *   output: z.object({ message: z.string() }),
 *   func: async ({ redis }, { channel }, { trigger }) => {
 *     const subscriber = redis.duplicate()
 *     await subscriber.subscribe(channel, (msg) => {
 *       trigger.trigger({ message: msg })
 *     })
 *     return () => subscriber.unsubscribe()
 *   }
 * })
 * ```
 */
export const pikkuTriggerFunc = <
  TConfig = unknown,
  TOutput = unknown,
  Services extends CoreSingletonServices = CoreSingletonServices,
  ConfigSchema extends ZodLike | undefined = undefined,
  OutputSchema extends ZodLike | undefined = undefined,
>(
  triggerOrConfig:
    | CorePikkuTriggerFunction<TConfig, TOutput, Services>
    | CorePikkuTriggerFunctionConfig<
        TConfig,
        TOutput,
        Services,
        ConfigSchema,
        OutputSchema
      >
): CorePikkuTriggerFunctionConfig<
  TConfig,
  TOutput,
  Services,
  ConfigSchema,
  OutputSchema
> => {
  if (typeof triggerOrConfig === 'function') {
    return { func: triggerOrConfig }
  }
  return triggerOrConfig
}
