import { PikkuDocs, CoreUserSession } from '../../types/core.types.js'
import { CorePikkuFunctionSessionless } from '../../function/functions.types.js'

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
      docs?: PikkuDocs
      tags?: string[]
    }
  >

/**
 * Represents a core scheduled task.
 */
export type CoreScheduledTask<
  PikkuFunction = CorePikkuFunctionSessionless<void, void>,
> = {
  name: string
  schedule: string
  func: PikkuFunction
  docs?: PikkuDocs
  tags?: string[]
}

/**
 * Represents a scheduled task interaction object for middleware
 * Provides information about the current scheduled task execution
 */
export interface PikkuScheduledTask {
  /** The name of the scheduled task being executed */
  name: string
  /** The cron schedule expression */
  schedule: string
  /** Current execution timestamp */
  executionTime: Date
  /** Skip the current task execution */
  skip: (reason?: string) => void
}
