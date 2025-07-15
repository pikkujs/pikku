import { APIDocs, CoreUserSession } from '../../types/core.types.js'
import { CoreAPIFunctionSessionless } from '../../function/functions.types.js'

/**
 * Represents metadata for scheduled tasks, including title, schedule, and documentation.
 */
export type ScheduledTasksMeta<UserSession extends CoreUserSession = any> =
  Record<
    string,
    {
      pikkuFuncName: string
      name: string
      schedule: string
      session?: UserSession
      docs?: APIDocs
      tags?: string[]
    }
  >

/**
 * Represents a core scheduled task.
 */
export type CoreScheduledTask<
  APIFunction = CoreAPIFunctionSessionless<void, void>,
> = {
  name: string
  schedule: string
  func: APIFunction
  docs?: APIDocs
  tags?: string[]
}
