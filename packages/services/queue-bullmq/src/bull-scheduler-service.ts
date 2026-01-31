import { ConnectionOptions, Queue, Worker } from 'bullmq'
import {
  SchedulerService,
  ScheduledTaskInfo,
  ScheduledTaskSummary,
  CoreSingletonServices,
  CoreServices,
  CoreUserSession,
  CreateWireServices,
  parseDurationString,
} from '@pikku/core'
import { runScheduledTask, getScheduledTasks } from '@pikku/core/scheduler'

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
  private repeatJobKeys: string[] = []
  private singletonServices?: CoreSingletonServices
  private createWireServices?: CreateWireServices<
    CoreSingletonServices,
    CoreServices,
    CoreUserSession
  >

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
   * Set services needed for processing recurring tasks.
   * Must be called before start() since the scheduler is typically
   * created before singletonServices are available.
   */
  setServices(
    singletonServices: CoreSingletonServices,
    createWireServices?: CreateWireServices<
      CoreSingletonServices,
      CoreServices,
      CoreUserSession
    >
  ): void {
    this.singletonServices = singletonServices
    this.createWireServices = createWireServices
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
    if (!this.singletonServices) {
      throw new Error(
        'BullSchedulerService requires singletonServices to start recurring tasks'
      )
    }

    const scheduledTasks = getScheduledTasks()

    // Create a worker to process recurring scheduled task jobs
    this.recurringWorker = new Worker(
      RECURRING_QUEUE_NAME,
      async (job) => {
        const { rpcName } = job.data as ScheduledJobData
        this.singletonServices!.logger.info(
          `Running scheduled task: ${rpcName}`
        )
        await runScheduledTask({
          singletonServices: this.singletonServices!,
          createWireServices: this.createWireServices as any,
          name: rpcName,
        })
      },
      { connection: this.redisConnectionOptions }
    )
    this.recurringWorker.on('error', (err) => {
      this.singletonServices!.logger.error(
        `Recurring task worker error: ${err}`
      )
    })

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
  }

  /**
   * Stop recurring scheduled tasks by removing repeat jobs.
   */
  async stop(): Promise<void> {
    for (const key of this.repeatJobKeys) {
      await this.recurringQueue.removeRepeatableByKey(key)
    }
    this.repeatJobKeys = []
    if (this.recurringWorker) {
      await this.recurringWorker.close()
      this.recurringWorker = undefined
    }
  }
}
