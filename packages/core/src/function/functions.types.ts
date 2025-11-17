import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  PikkuDocs,
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
  Wire extends PikkuWire<In, Out> = PikkuWire<In, Out, Session>,
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
  Wire extends PikkuWire<In, Out, CoreUserSession, any, any, any> = PikkuWire<
    In,
    Out,
    CoreUserSession,
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
    CoreUserSession,
    any,
    never,
    never
  > = PikkuWire<In, never, CoreUserSession, never, never, never>,
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
  Wire extends PikkuWire<In, never, CoreUserSession> = PikkuWire<
    In,
    never,
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
 *   async ({ logger }, session) => {
 *     return session?.role === 'admin'
 *   }
 * )
 *
 * // Configuration object syntax with metadata
 * export const adminPermission = pikkuPermission({
 *   name: 'Admin Permission',
 *   description: 'Checks if user has admin role',
 *   func: async ({ logger }, session) => {
 *     return session?.role === 'admin'
 *   }
 * })
 * ```
 */
export const pikkuPermission = <
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Wire extends PickRequired<
    PikkuWire<In, never, CoreUserSession>,
    'session'
  > = PickRequired<PikkuWire<In, never, CoreUserSession>, 'session'>,
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
  Wire extends PikkuWire<In, never, CoreUserSession> = PikkuWire<
    In,
    never,
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
 *   return pikkuPermission(async ({ logger }, data, session) => {
 *     if (!session || session.role !== role) {
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
> = {
  name?: string
  expose?: boolean
  internal?: boolean
  func: PikkuFunction
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission>
  middleware?: PikkuMiddleware[]
  tags?: string[]
  docs?: PikkuDocs
}
