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
> = {
  name: string
  schedule: string
  func: PikkuFunctionConfig
  tags?: string[]
  middleware?: PikkuMiddleware[]
}

export interface PikkuScheduledTask {
  name: string
  schedule: string
  executionTime: Date
  /** Never returns — throws to abort the run. */
  skip: (reason?: string) => void
}
