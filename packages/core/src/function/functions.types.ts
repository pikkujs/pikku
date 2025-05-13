import { PikkuChannel } from '../channel/channel.types.js'
import type {
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '../types/core.types.js'

/**
 * Represents a core API function that performs an operation using core services and a user session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CoreAPIFunction<
  In,
  Out,
  Channel extends boolean = false,
  Services extends CoreSingletonServices = CoreServices &
    (Channel extends true
      ? {
          channel: PikkuChannel<unknown, Out>
        }
      : {
          channel?: PikkuChannel<unknown, Out> | undefined
        }),
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: In,
  session: Session
) => Channel extends true ? Promise<Out> | Promise<void> : Promise<Out>

/**
 * Represents a core API function that can be used without a session.
 *
 * @template In - The input type.
 * @template Out - The output type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CoreAPIFunctionSessionless<
  In,
  Out,
  Channel extends boolean = false,
  Services extends CoreSingletonServices = CoreServices &
    (Channel extends true
      ? {
          channel: PikkuChannel<unknown, Out>
        }
      : {
          channel?: PikkuChannel<unknown, Out> | undefined
        }),
  Session extends CoreUserSession = CoreUserSession,
> = (
  services: Services,
  data: In,
  session?: Session
) => Channel extends true ? Promise<Out> | Promise<void> : Promise<Out>

/**
 * Represents a function that checks permissions for a given API operation.
 *
 * @template In - The input type.
 * @template Services - The services type, defaults to `CoreServices`.
 * @template Session - The session type, defaults to `CoreUserSession`.
 */
export type CoreAPIPermission<
  In = any,
  Services extends CoreSingletonServices = CoreServices,
  Session extends CoreUserSession = CoreUserSession,
> = (services: Services, data: In, session?: Session) => Promise<boolean>

export type CorePermissionGroup<
  APIPermission = CoreAPIPermission<any>,
> = Record<string, APIPermission | APIPermission[]> | undefined