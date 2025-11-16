import { PikkuChannel } from '../wirings/channel/channel.types.js'
import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  PikkuDocs,
  CorePikkuMiddleware,
  PikkuInteraction,
} from '../types/core.types.js'
import { UserSessionService } from '../services/user-session-service.js'

/**
 * Represents a core API function that performs an operation using core services and a user session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template ChannelData - The channel data type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Interaction - The interaction type, defaults to `PikkuInteraction<In, Out>`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuFunction<
  In,
  Out,
  ChannelData extends unknown | null = null,
  Services extends CoreSingletonServices = CoreServices,
  Interaction extends PikkuInteraction<In, Out> = PikkuInteraction<In, Out> &
    (ChannelData extends null
      ? {
          channel?: PikkuChannel<unknown, Out> | undefined
        }
      : {
          channel: PikkuChannel<ChannelData, Out>
        }),
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: In,
  interaction: Interaction & { session: UserSessionService<Session> }
) => ChannelData extends null ? Promise<Out> : Promise<Out> | Promise<void>

/**
 * Represents a core API function that can be used without a session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template ChannelData - The channel data type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Interaction - The interaction type, defaults to `PikkuInteraction<In, Out>`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuFunctionSessionless<
  In,
  Out,
  ChannelData extends unknown | null = null,
  Services extends CoreSingletonServices = CoreServices,
  Interaction extends PikkuInteraction<In, Out> = PikkuInteraction<In, Out> &
    (ChannelData extends null
      ? {
          channel?: PikkuChannel<unknown, Out> | undefined
        }
      : {
          channel: PikkuChannel<ChannelData, Out>
        }),
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: In,
  interaction: Interaction & { session?: UserSessionService<Session> }
) => ChannelData extends null ? Promise<Out> : Promise<Out> | Promise<void>

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
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: In,
  interaction: PikkuInteraction<In, any, Session> & {
    session?: UserSessionService<Session>
  }
) => Promise<boolean>

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
  Session extends CoreUserSession = CoreUserSession,
> = {
  /** The permission function */
  func: CorePikkuPermission<In, Services, Session>
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
 *   async ({ logger }, interaction, data, session) => {
 *     return session?.role === 'admin'
 *   }
 * )
 *
 * // Configuration object syntax with metadata
 * export const adminPermission = pikkuPermission({
 *   name: 'Admin Permission',
 *   description: 'Checks if user has admin role',
 *   func: async ({ logger }, interaction, data, session) => {
 *     return session?.role === 'admin'
 *   }
 * })
 * ```
 */
export const pikkuPermission = <
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
>(
  permission:
    | CorePikkuPermission<In, Services, Session>
    | CorePikkuPermissionConfig<In, Services, Session>
): CorePikkuPermission<In, Services, Session> => {
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
  Session extends CoreUserSession = CoreUserSession,
> = (input: In) => CorePikkuPermission<any, Services, Session>

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
