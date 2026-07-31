import type { CoreUserSession } from '../types/core.types.js'

export interface ScheduledTaskSummary {
  taskId: string
  rpcName: string
  scheduledFor: Date
}

export interface ScheduledTaskInfo extends ScheduledTaskSummary {
  data?: any
  session?: CoreUserSession
  status?: 'scheduled' | 'active' | 'completed' | 'failed'
}

export abstract class SchedulerService {
  abstract init(): Promise<void>

  /** `delay` is milliseconds as a number, or a duration string such as `"5h"` / `"30m"`. */
  abstract scheduleRPC(
    delay: number | string,
    rpcName: string,
    data?: any,
    session?: CoreUserSession
  ): Promise<string>

  abstract unschedule(taskId: string): Promise<boolean>

  abstract getTask(taskId: string): Promise<ScheduledTaskInfo | null>

  abstract getAllTasks(): Promise<ScheduledTaskSummary[]>

  abstract close(): Promise<void>

  async start(): Promise<void> {}

  async stop(): Promise<void> {}
}
