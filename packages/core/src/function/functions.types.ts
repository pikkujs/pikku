import { PikkuChannel } from '../wirings/channel/channel.types.js'
import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  PikkuDocs,
  CorePikkuMiddleware,
} from '../types/core.types.js'

/**
 * Represents a core API function that performs an operation using core services and a user session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuFunction<
  In,
  Out,
  ChannelData extends unknown | null = null,
  Services extends CoreSingletonServices = CoreServices &
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
  session: Session
) => ChannelData extends null ? Promise<Out> : Promise<Out> | Promise<void>

/**
 * Represents a core API function that can be used without a session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CorePikkuFunctionSessionless<
  In,
  Out,
  ChannelData extends unknown | null = null,
  Services extends CoreSingletonServices = CoreServices &
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
  session?: Session
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
> = (services: Services, data: In, session?: Session) => Promise<boolean>

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
> = {
  name?: string
  expose?: boolean
  func: PikkuFunction
  auth?: boolean
  permissions?: CorePermissionGroup<PikkuPermission>
  middleware?: CorePikkuMiddleware[]
  docs?: PikkuDocs
}
