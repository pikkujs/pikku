import type { ConnectionOptions, JobsOptions } from 'bullmq'
import type Bull from 'bullmq'
import { Queue, QueueEvents } from 'bullmq'
import type {
  QueueInspection,
  QueueJob,
  QueueJobRecord,
  QueueJobStatus,
  QueueService,
} from '@pikku/core/queue'
import type { JobOptions } from '@pikku/core/queue'
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

  // Map retry backoff. BullMQ accepts `{ type, delay }`; our `delay` is in ms,
  // which is what BullMQ expects too (unlike pg-boss, which uses seconds).
  if (options?.backoff !== undefined) {
    bullOptions.backoff =
      typeof options.backoff === 'string'
        ? { type: options.backoff }
        : { type: options.backoff.type, delay: options.backoff.delay }
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

const INSPECTED_STATES: QueueJobStatus[] = [
  'waiting',
  'active',
  'delayed',
  'completed',
  'failed',
]

export const mapBullJobToRecord = (
  job: Bull.Job,
  status: QueueJobStatus
): QueueJobRecord => ({
  jobId: job.id!,
  status,
  attemptsMade: job.attemptsMade,
  maxAttempts: job.opts.attempts ?? 1,
  createdAt: new Date(job.timestamp),
  processedAt: job.processedOn ? new Date(job.processedOn) : null,
  finishedAt: job.finishedOn ? new Date(job.finishedOn) : null,
  durationMs:
    job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null,
  error: job.failedReason || null,
})

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

    const queue = new Queue(queueName, config)
    queue.on('error', (error) => {
      console.error('Redis connection error:', error)
    })
    await queue.waitUntilReady()

    this.queues.set(queueName, queue)

    if (!this.queueEvents.has(queueName)) {
      const queueEvents = new QueueEvents(
        queueName,
        this.redisConnectionOptions
          ? { connection: this.redisConnectionOptions }
          : undefined
      )
      await queueEvents.waitUntilReady()
      this.queueEvents.set(queueName, queueEvents)
    }

    return queue
  }

  /**
   * Add a job to the queue
   */
  public async add<In>(
    queueName: string,
    data: In,
    options?: JobOptions
  ): Promise<string> {
    const queue = await this.createQueue(queueName)
    const bullJob = await queue.add(queueName, data, mapPikkuJobToBull(options))
    if (!bullJob.id) {
      throw new Error(`Failed to add job to queue '${queueName}'.`)
    }
    return bullJob.id
  }

  async inspect(
    queueName: string,
    opts?: { limit?: number }
  ): Promise<QueueInspection> {
    const queue = await this.createQueue(queueName)
    const limit = opts?.limit ?? 50
    const counts = (await queue.getJobCounts(
      ...INSPECTED_STATES
    )) as QueueInspection['counts']
    const recent = (
      await Promise.all(
        INSPECTED_STATES.map(async (status) =>
          (await queue.getJobs([status], 0, limit - 1)).map((job) =>
            mapBullJobToRecord(job, status)
          )
        )
      )
    )
      .flat()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
    return { counts, recent }
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
