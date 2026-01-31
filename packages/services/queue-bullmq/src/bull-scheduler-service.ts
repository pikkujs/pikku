import { ConnectionOptions, Queue } from 'bullmq'
import {
  SchedulerService,
  ScheduledTaskInfo,
  ScheduledTaskSummary,
  CoreUserSession,
  parseDurationString,
} from '@pikku/core'
import { getScheduledTasks } from '@pikku/core/scheduler'
import { findAllWorkflowScheduleWires } from '@pikku/core/workflow'

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
const RECURRING_QUEUE = 'pikku-recurring-scheduled-task'

export class BullSchedulerService extends SchedulerService {
  private queue: Queue
  private recurringQueue: Queue
  private repeatJobKeys: string[] = []

  constructor(redisConnectionOptions: ConnectionOptions) {
    super()
    this.queue = new Queue('pikku-remote-internal-rpc', {
      connection: redisConnectionOptions,
    })
    this.recurringQueue = new Queue(RECURRING_QUEUE, {
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
    const job = await this.queue.add('pikku-remote-internal-rpc', jobData, {
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
    await this.recurringQueue.close()
    await this.queue.close()
  }

  /**
   * Start recurring scheduled tasks.
   * Reads pikkuState for wireScheduler tasks and workflow schedule wires,
   * then creates BullMQ repeat jobs for each.
   */
  async start(): Promise<void> {
    const scheduledTasks = getScheduledTasks()

    // Schedule recurring tasks from wireScheduler
    for (const [name, task] of scheduledTasks) {
      const job = await this.recurringQueue.add(
        name,
        { rpcName: name } as ScheduledJobData,
        {
          repeat: { pattern: task.schedule },
          jobId: `recurring:${name}`,
        }
      )
      if (job.repeatJobKey) {
        this.repeatJobKeys.push(job.repeatJobKey)
      }
    }

    // Schedule recurring tasks from workflow schedule wires
    const workflowScheduleWires = findAllWorkflowScheduleWires()
    for (const wire of workflowScheduleWires) {
      if (wire.cron) {
        const jobName = `workflow:${wire.workflowName}:${wire.startNode}`
        const job = await this.recurringQueue.add(
          jobName,
          {
            rpcName: `__workflow__:${wire.workflowName}`,
            data: { startNode: wire.startNode },
          } as ScheduledJobData,
          {
            repeat: { pattern: wire.cron },
            jobId: `recurring:${jobName}`,
          }
        )
        if (job.repeatJobKey) {
          this.repeatJobKeys.push(job.repeatJobKey)
        }
      }
    }
  }

  /**
   * Stop recurring scheduled tasks by removing repeat jobs.
   */
  async stop(): Promise<void> {
    for (const key of this.repeatJobKeys) {
      await this.recurringQueue.removeRepeatableByKey(key)
    }
    this.repeatJobKeys = []
  }
}
