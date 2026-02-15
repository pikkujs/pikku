import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  CorePikkuMiddleware,
  PikkuWire,
  PickRequired,
} from '../types/core.types.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CoreNodeConfig } from '../wirings/node/node.types.js'

/**
 * @deprecated Use StandardSchemaV1 from @standard-schema/spec instead.
 * This alias exists only for backward compatibility with generated code.
 */
export type ZodLike<T = any> = StandardSchemaV1<T, T>

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
  Session extends CoreUserSession = CoreUserSession,
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
  Session extends CoreUserSession = CoreUserSession,
  Wire extends PikkuWire<In, Out, false, Session, any, any, any> = PikkuWire<
    In,
    Out,
    false,
    Session,
    any,
    any,
    any
  >,
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
  /** Optional human-readable title for the permission */
  title?: string
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
 *   title: 'Admin Permission',
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

export type CorePikkuFunctionConfig<
  PikkuFunction extends
    | CorePikkuFunction<any, any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any, any>,
  PikkuPermission extends CorePikkuPermission<
    any,
    any,
    any
  > = CorePikkuPermission<any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
> = {
  /** Optional human-readable title for the function */
  title?: string
  /** Optional description of what the function does */
  description?: string
  override?: string
  version?: number
  tags?: string[]
  expose?: boolean
  internal?: boolean
  func: PikkuFunction
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission>
  middleware?: PikkuMiddleware[]
  input?: InputSchema
  output?: OutputSchema
  node?: CoreNodeConfig
}
