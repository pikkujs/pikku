import type {
  CoreUserSession,
  CorePikkuMiddleware,
  CommonWireMeta,
} from '../../types/core.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'

/**
 * Represents metadata for scheduled tasks, including title, schedule, and documentation.
 */
export type ScheduledTasksMeta<UserSession extends CoreUserSession = any> =
  Record<
    string,
    CommonWireMeta & {
      name: string
      schedule: string
      session?: UserSession
    }
  >

/**
 * Represents a core scheduled task.
 */
export type CoreScheduledTask<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<void, void>
  >,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  name: string
  schedule: string
  func: PikkuFunctionConfig
  tags?: string[]
  middleware?: PikkuMiddleware[]
}

/**
 * Represents a scheduled task wire object for middleware
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
