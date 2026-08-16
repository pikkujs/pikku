import type { ConnectionOptions } from 'bullmq'
import { Queue, Worker } from 'bullmq'
import { runScheduledTask } from '@pikku/core/scheduler'
import { SchedulerService } from '@pikku/core/services'
import type { CoreUserSession } from '@pikku/core/types'
import type {
  ScheduledTaskInfo,
  ScheduledTaskSummary,
} from '@pikku/core/services'
import { parseDurationString } from '@pikku/core/time-utils'
import { pikkuState } from '@pikku/core/state'
import { getScheduledTasks } from '@pikku/core/scheduler'

/**
 * Data stored in scheduled job
 */
interface ScheduledJobData {
  rpcName: string
  data?: any
  session?: CoreUserSession
}

const RECURRING_QUEUE_NAME = 'pikku-recurring-scheduled-task'

export class BullSchedulerService extends SchedulerService {
  private queue: Queue
  private recurringQueue: Queue
  private recurringWorker?: Worker
  private jobSchedulerIds: string[] = []

  constructor(private redisConnectionOptions: ConnectionOptions) {
    super()
    this.queue = new Queue('pikku-remote-internal-rpc', {
      connection: redisConnectionOptions,
    })
    this.recurringQueue = new Queue(RECURRING_QUEUE_NAME, {
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
    if (this.recurringWorker) {
      await this.recurringWorker.close()
    }
    await this.recurringQueue.close()
    await this.queue.close()
  }

  /**
   * Start recurring scheduled tasks.
   * Creates a BullMQ Worker to process repeat jobs via runScheduledTask.
   */
  async start(): Promise<void> {
    const logger = pikkuState(null, 'package', 'singletonServices')!.logger
    const scheduledTasks = getScheduledTasks()

    // Create a worker to process recurring scheduled task jobs
    this.recurringWorker = new Worker(
      RECURRING_QUEUE_NAME,
      async (job) => {
        const { rpcName } = job.data as ScheduledJobData
        logger.info(`Running scheduled task: ${rpcName}`)
        await runScheduledTask({ name: rpcName })
      },
      { connection: this.redisConnectionOptions }
    )
    this.recurringWorker.on('error', (err) => {
      logger.error(`Recurring task worker error: ${err}`)
    })

    for (const [name, task] of scheduledTasks) {
      const jobSchedulerId = `recurring:${name}`
      await this.recurringQueue.upsertJobScheduler(
        jobSchedulerId,
        { pattern: task.schedule },
        { name, data: { rpcName: name } as ScheduledJobData }
      )
      this.jobSchedulerIds.push(jobSchedulerId)
    }
  }

  /**
   * Stop recurring scheduled tasks by removing their job schedulers.
   */
  async stop(): Promise<void> {
    for (const id of this.jobSchedulerIds) {
      await this.recurringQueue.removeJobScheduler(id)
    }
    this.jobSchedulerIds = []
    if (this.recurringWorker) {
      await this.recurringWorker.close()
      this.recurringWorker = undefined
    }
  }
}
