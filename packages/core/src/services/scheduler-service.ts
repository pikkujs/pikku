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
