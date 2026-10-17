import type { CoreUserSession } from '../types/core.types.js'
import type { ScheduledTaskRuns } from '../wirings/scheduler/scheduler.types.js'

/**
 * A task scheduled with {@link SchedulerService.scheduleRPC}: which RPC it runs
 * and when.
 */
export interface ScheduledTaskSummary {
  taskId: string
  rpcName: string
  scheduledFor: Date
}

/** A scheduled task with the data and session it will run with. */
export interface ScheduledTaskInfo extends ScheduledTaskSummary {
  data?: any
  session?: CoreUserSession
  status?: 'scheduled' | 'active' | 'completed' | 'failed'
}

/**
 * Runs RPCs later, provided as the `schedulerService` singleton service
 * (implementations ship in the queue and database packages). A task runs the
 * named RPC with the given data, under the session it was scheduled with.
 *
 * This is for one-off delayed work; recurring cron tasks are declared with
 * `wireScheduler`.
 */
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

  /** Per wired cron task. Empty when this scheduler keeps no run history. */
  async getTaskRuns(): Promise<Record<string, ScheduledTaskRuns>> {
    return {}
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}
}
