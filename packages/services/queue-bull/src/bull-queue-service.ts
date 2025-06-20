import Bull from 'bull'
import type {
  QueueService,
  QueueJob,
  JobOptions,
  QueueJobStatus,
} from '@pikku/core/queue'

/**
 * Bull/Redis queue service implementation
 * Supports job results, retries, and most queue features
 */
export class BullQueueService implements QueueService {
  readonly name = 'bull'
  readonly supportsResults = true
  protected queues = new Map<string, Bull.Queue>()
  private defaultRedisConfig: Bull.QueueOptions

  constructor(redisConfig: Bull.QueueOptions | undefined) {
    this.defaultRedisConfig = redisConfig || {
      redis: {
        port: 6379,
        host: '127.0.0.1',
      },
    }
  }

  /**
   * Create a Bull queue with translated configuration
   */
  protected async createQueue(
    queueName: string,
    config?: Bull.JobOptions
  ): Promise<Bull.Queue> {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!
    }

    const queue = new Bull(queueName, {
      ...this.defaultRedisConfig,
      defaultJobOptions: config,
    })

    this.queues.set(queueName, queue)
    return queue
  }

  /**
   * Add a job to the queue
   */
  public async add<In, Out>(
    queueName: string,
    data: In,
    options?: JobOptions
  ): Promise<QueueJob<In, Out>> {
    const queue = await this.createQueue(queueName)

    const bullOptions: Bull.JobOptions = {}

    if (options?.priority !== undefined) {
      bullOptions.priority = options.priority
    }

    if (options?.delay !== undefined) {
      bullOptions.delay = options.delay
    }

    if (options?.attempts !== undefined) {
      bullOptions.attempts = options.attempts
    }

    if (options?.removeOnComplete !== undefined) {
      bullOptions.removeOnComplete = options.removeOnComplete
    }

    if (options?.removeOnFail !== undefined) {
      bullOptions.removeOnFail = options.removeOnFail
    }

    if (options?.jobId !== undefined) {
      bullOptions.jobId = options.jobId
    }

    const bullJob = await queue.add(data, bullOptions)
    return this.mapBullJobToQueueJob<In, Out>(bullJob)
  }

  /**
   * Get job by ID
   */
  async getJob<T, R>(
    queueName: string,
    jobId: string
  ): Promise<QueueJob<T, R> | null> {
    const queue = this.queues.get(queueName)
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found.`)
    }

    const bullJob = await queue.getJob(jobId)
    if (!bullJob) {
      return null
    }

    return this.mapBullJobToQueueJob<T, R>(bullJob)
  }

  public async waitForResult<R>(queueName: string, jobId: string): Promise<R> {
    const queue = this.queues.get(queueName)
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found.`)
    }

    const job = await queue.getJob(jobId)
    if (!job) {
      throw new Error(`Job '${jobId}' not found in queue '${queueName}'`)
    }

    try {
      const result = await job.finished()
      return result as R
    } catch (error) {
      throw new Error(`Job '${jobId}' failed: ${error}`)
    }
  }

  /**
   * Map Bull job to QueueJob interface
   */
  protected async mapBullJobToQueueJob<In, Out>(
    bullJob: Bull.Job
  ): Promise<QueueJob<In, Out>> {
    return {
      queueName: bullJob.queue.name,
      id: bullJob.id?.toString() || '',
      data: bullJob.data,
      result: bullJob.returnvalue as Out,
      status: async () => this.mapBullStateToStatus(await bullJob.getState()),
      progress: bullJob.progress(),
      attemptsMade: bullJob.attemptsMade,
      maxAttempts: bullJob.opts.attempts || 1,
      createdAt: new Date(bullJob.timestamp),
      processedAt: bullJob.processedOn
        ? new Date(bullJob.processedOn)
        : undefined,
      completedAt: bullJob.finishedOn
        ? new Date(bullJob.finishedOn)
        : undefined,
      failedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : undefined,
      error: bullJob.failedReason,
    }
  }

  /**
   * Map Bull job state to our queue job status
   */
  private mapBullStateToStatus(state: string): QueueJobStatus {
    switch (state) {
      case 'waiting':
        return 'waiting'
      case 'active':
        return 'active'
      case 'completed':
        return 'completed'
      case 'failed':
        return 'failed'
      case 'delayed':
        return 'delayed'
      default:
        return 'waiting'
    }
  }
}
