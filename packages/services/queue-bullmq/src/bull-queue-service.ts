import Bull, {
  ConnectionOptions,
  JobsOptions,
  Queue,
  RedisConnection,
} from 'bullmq'
import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'
import { mapBullJobToQueueJob } from './utils.js'

export const mapPikkuJobToBull = (options?: JobOptions): JobsOptions => {
  const bullOptions: JobsOptions = {}

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

  return bullOptions
}

class PikkuRedisConnection extends RedisConnection {
  constructor(options: ConnectionOptions) {
    super(options)
    this.on('error', (error) => {
      console.error('Redis connection error:', error)
    })
  }
}

/**
 * Bull/Redis queue service implementation
 * Supports job results, retries, and most queue features
 */
export class BullQueueService implements QueueService {
  readonly name = 'bull'
  readonly supportsResults = true
  protected queues = new Map<string, Bull.Queue>()
  protected queueEvents = new Map<string, Bull.QueueEvents>()

  constructor(private redisConnectionOptions: ConnectionOptions = {}) {}

  /**
   * Create a Bull queue with translated configuration
   */
  protected async createQueue(
    queueName: string,
    config?: Bull.QueueOptions
  ): Promise<Bull.Queue> {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!
    }

    const queue = new Queue(queueName, config, PikkuRedisConnection)
    await queue.waitUntilReady()

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
    const bullJob = await queue.add(queueName, data, mapPikkuJobToBull(options))
    return mapBullJobToQueueJob<In, Out>(
      bullJob,
      this.redisConnectionOptions,
      this.queueEvents
    )
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

    return mapBullJobToQueueJob<T, R>(
      bullJob,
      this.redisConnectionOptions,
      this.queueEvents
    )
  }
}
