import type { CoreUserSession, CommonWireMeta } from '../../types/core.types.js'
import type { CorePikkuMiddleware } from '../../middleware/middleware.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'

export type ScheduledTasksMeta<UserSession extends CoreUserSession = any> =
  Record<
    string,
    CommonWireMeta & {
      name: string
      schedule: string
      session?: UserSession
    }
  >

export type CoreScheduledTask<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<void, void>
  >,
  PikkuMiddleware = CorePikkuMiddleware<any>,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  /** Unique across the project. It is how the task is addressed in logs, in `pikku meta`, and by a scheduler service asked to run it now. */
  name: string
  /** A five-field cron expression: minute, hour, day of month, month, day of week. `0 9 * * 1` is 09:00 every Monday. Interpreted in the deployment's timezone, not the author's. */
  schedule: string
  /** The function to run. It receives no session and no input: a scheduled task has no caller, so it must be sessionless. */
  func: PikkuFunctionConfig
  /** Filters this task in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** Wraps every execution. There is no request to read from, so this is for tracing, locking and teardown rather than authenticating a caller. */
  middleware?: PikkuMiddleware[]
  /**
   * The identity the task runs as. A cron has no caller to take a session from,
   * so without this it runs with none: it cannot pass a permission gate, hold a
   * scope, or be attributed in an audit trail, and any logic it shares with a
   * gated RPC has to be factored out to a helper both can call. Declare a system
   * identity here and the task can invoke that RPC directly instead.
   */
  session?: UserSession
}

export interface PikkuScheduledTask {
  name: string
  schedule: string
  executionTime: Date
  /** Never returns — throws to abort the run. */
  skip: (reason?: string) => void
}
