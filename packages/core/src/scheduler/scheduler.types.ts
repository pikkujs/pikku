import { APIDocs, CoreUserSession } from '../types/core.types.js'
import { CoreAPIFunctionSessionless } from '../types/functions.types.js'

/**
 * Represents metadata for scheduled tasks, including title, schedule, and documentation.
 */
export type ScheduledTasksMeta<UserSession extends CoreUserSession = any> = Record<string,
  {
    name: string
    schedule: string
    session?: UserSession
    docs?: APIDocs
    tags?: string[]
  }>

/**
 * Represents a core scheduled task.
 */
export type CoreScheduledTask<
  APIFunction = CoreAPIFunctionSessionless<void, void>,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  name: string
  schedule: string
  func: APIFunction
  docs?: APIDocs
  session?: UserSession
  tags?: string[]
}
