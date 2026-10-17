import type { CoreUserSession, CommonWireMeta } from '../../types/core.types.js'
import type { CorePikkuMiddleware } from '../../middleware/middleware.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'

/** Generated metadata for every wired scheduled task, keyed by name. */
export type ScheduledTasksMeta<UserSession extends CoreUserSession = any> =
  Record<
    string,
    CommonWireMeta & {
      name: string
      schedule: string
      session?: UserSession
    }
  >

/** The configuration {@link wireScheduler} takes. An app's generated `wireScheduler` narrows the function and middleware types to its own. */
export type CoreScheduledTask<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<void, void>
  >,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  /** Unique across the project. It is how the task is addressed in logs, in `pikku meta`, and by a scheduler service asked to run it now. */
  name: string
  /** A five-field cron expression: minute, hour, day of month, month, day of week. `0 9 * * 1` is 09:00 every Monday. Interpreted in the deployment's timezone, not the author's. */
  schedule: string
  /** The function to run. It receives no session and no input: a scheduled task has no caller, so it must be sessionless. */
  func: PikkuFunctionConfig
  /** Filters this task in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** Wraps every execution. There is no request to read from, so this is for tracing, locking and teardown rather than auth. */
  middleware?: PikkuMiddleware[]
}

/** The `scheduledTask` part of a scheduled function's wire: which task is running, when, and a `skip` to end the run without treating it as a failure. */
export interface PikkuScheduledTask {
  name: string
  schedule: string
  executionTime: Date
  /** Never returns — throws to abort the run. */
  skip: (reason?: string) => void
}

export interface ScheduledTaskRun {
  startedAt: Date
  status: 'completed' | 'failed' | 'skipped'
  durationMs: number
  error: string | null
}

export interface ScheduledTaskRuns {
  nextRun: Date | null
  lastRun: ScheduledTaskRun | null
  /** Newest first. */
  history: ScheduledTaskRun[]
}
