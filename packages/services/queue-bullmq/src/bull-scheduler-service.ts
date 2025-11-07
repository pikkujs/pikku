import { ConnectionOptions, Queue } from 'bullmq'
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
 * BullMQ scheduler service implementation
 * Uses BullMQ's delayed jobs for one-time execution
 */
export class BullSchedulerService extends SchedulerService {
  private queue: Queue

  constructor(redisConnectionOptions: ConnectionOptions) {
    super()
    this.queue = new Queue('pikku-scheduled-rpc', {
      connection: redisConnectionOptions,
    })
  }

  /**
   * Initialize - wait for queue to be ready
   */
  async init(): Promise<void> {
    await this.queue.waitUntilReady()
  }

  /**
   * Schedule a one-off delayed RPC call
   * Uses BullMQ add() with delay option
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

    // Use add() with delay for one-off delayed execution
    const job = await this.queue.add('scheduled-rpc', jobData, {
      delay: delayMs, // delay in milliseconds
      jobId: `${rpcName}-${Date.now()}`, // Ensure uniqueness
    })

    if (!job.id) {
      throw new Error('Failed to schedule RPC')
    }

    return job.id
  }

  /**
   * Unschedule (remove) a task by ID
   */
  async unschedule(taskId: string): Promise<boolean> {
    const job = await this.queue.getJob(taskId)
    if (job) {
      await job.remove()
      return true
    }
    return false
  }

  /**
   * Get a scheduled task by ID with full details
   */
  async getTask(taskId: string): Promise<ScheduledTaskInfo | null> {
    const job = await this.queue.getJob(taskId)

    if (!job) {
      return null
    }

    const jobData = job.data as ScheduledJobData
    const state = await job.getState()

    // Calculate scheduled time from delay or processedOn
    const scheduledFor = job.delay
      ? new Date(job.timestamp + job.delay)
      : new Date(job.timestamp)

    return {
      taskId: job.id!,
      rpcName: jobData.rpcName,
      scheduledFor,
      data: jobData.data,
      session: jobData.session,
      status: state as any,
    }
  }

  /**
   * Get all scheduled tasks with minimal info
   */
  async getAllTasks(): Promise<ScheduledTaskSummary[]> {
    const jobs = await this.queue.getJobs(['delayed', 'waiting'])

    return jobs.map((job) => {
      const jobData = job.data as ScheduledJobData
      const scheduledFor = job.delay
        ? new Date(job.timestamp + job.delay)
        : new Date(job.timestamp)

      return {
        taskId: job.id!,
        rpcName: jobData.rpcName,
        scheduledFor,
      }
    })
  }

  /**
   * Close the queue connection
   */
  async close(): Promise<void> {
    await this.queue.close()
  }
}
