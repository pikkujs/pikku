import PgBoss from 'pg-boss'
import {
  SchedulerService,
  ScheduledTaskInfo,
  ScheduledTaskSummary,
  CoreUserSession,
  parseDurationString,
} from '@pikku/core'

/**
 * Data stored in scheduled job
 */
interface ScheduledJobData {
  rpcName: string
  data?: any
  session?: CoreUserSession
}

/**
 * pg-boss scheduler service implementation
 * Uses pg-boss's schedule() API to store recurring jobs in PostgreSQL
 */
export class PgBossSchedulerService extends SchedulerService {
  constructor(private pgBoss: PgBoss) {
    super()
  }

  /**
   * Initialize - no-op as pg-boss is already initialized by factory
   */
  async init(): Promise<void> {
    // No-op - pg-boss is already initialized by factory
  }

  /**
   * Schedule a one-off delayed RPC call
   * Uses pg-boss send() with startAfter for one-time execution
   */
  async scheduleRPC(
    delay: number | string,
    rpcName: string,
    data?: any,
    session?: CoreUserSession
  ): Promise<string> {
    // Parse delay if it's a string
    const delayMs =
      typeof delay === 'string' ? parseDurationString(delay) : delay

    const jobData: ScheduledJobData = {
      rpcName,
      data,
      session,
    }

    // Use send() with startAfter for one-off delayed execution
    const taskId = await this.pgBoss.send(
      'pikku-remote-internal-rpc',
      jobData,
      {
        startAfter: new Date(Date.now() + delayMs),
        singletonKey: `${rpcName}-${Date.now()}`, // Ensure uniqueness
      }
    )

    if (!taskId) {
      throw new Error('Failed to schedule RPC')
    }

    return taskId
  }

  /**
   * Unschedule (cancel) a task by ID
   */
  async unschedule(taskId: string): Promise<boolean> {
    await this.pgBoss.cancel('pikku-remote-internal-rpc', taskId)
    return true
  }

  /**
   * Get a scheduled task by ID with full details
   */
  async getTask(taskId: string): Promise<ScheduledTaskInfo | null> {
    const job = await this.pgBoss.getJobById(
      'pikku-remote-internal-rpc',
      taskId
    )

    if (!job) {
      return null
    }

    const jobData = job.data as ScheduledJobData

    return {
      taskId: job.id,
      rpcName: jobData.rpcName,
      scheduledFor: job.startAfter || job.createdOn,
      data: jobData.data,
      session: jobData.session,
      status: job.state as any,
    }
  }

  /**
   * Get all scheduled tasks with minimal info
   */
  async getAllTasks(): Promise<ScheduledTaskSummary[]> {
    // pg-boss doesn't have a simple way to list all pending jobs
    // This would require querying the database directly or maintaining a separate index
    // For now, return empty array - can be implemented if needed
    return []
  }

  /**
   * Close - no-op as pg-boss lifecycle is managed by factory
   */
  async close(): Promise<void> {
    // No-op - pg-boss lifecycle is managed by factory
  }
}
