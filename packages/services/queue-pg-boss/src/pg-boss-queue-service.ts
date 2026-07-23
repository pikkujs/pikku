import type { PgBoss, Request as PgBossRequest } from 'pg-boss'
import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'
import { mapPgBossJobToQueueJob } from './utils.js'

export const mapPikkuJobToPgBoss = (
  options?: JobOptions
): PgBossRequest['options'] => {
  const pgBossOptions: any = {}

  if (options?.priority !== undefined) {
    pgBossOptions.priority = options.priority
  }

  if (options?.delay !== undefined) {
    pgBossOptions.startAfter = new Date(Date.now() + options.delay)
  }

  if (options?.jobId !== undefined) {
    pgBossOptions.singletonKey = options.jobId
  }

  if (options?.group !== undefined) {
    pgBossOptions.group = {
      id: options.group.id,
      ...(options.group.tier !== undefined ? { tier: options.group.tier } : {}),
    }
  }

  // Map retry options
  if (options?.attempts !== undefined) {
    pgBossOptions.retryLimit = options.attempts - 1
  }

  if (options?.backoff !== undefined) {
    const type =
      typeof options.backoff === 'string' ? options.backoff : options.backoff.type
    const delay =
      typeof options.backoff === 'object' ? options.backoff.delay : undefined
    pgBossOptions.retryBackoff = type === 'exponential'
    if (delay !== undefined) {
      // pg-boss uses seconds, we use milliseconds — never round a sub-second
      // delay down to 0, which pg-boss treats as retry-immediately
      pgBossOptions.retryDelay = Math.max(1, Math.round(delay / 1000))
    } else if (type === 'exponential') {
      // pg-boss computes exponential backoff as retry_delay * 2^n, and the
      // queue-level retry_delay defaults to 0 — without an explicit base every
      // "exponential" retry fires immediately. 1s base → ~1s, 2s, 4s, 8s…
      pgBossOptions.retryDelay = 1
    }
  }

  if (options?.removeOnComplete !== undefined) {
    pgBossOptions.onComplete = options.removeOnComplete === 0
  }

  if (options?.removeOnFail !== undefined) {
    // pg-boss doesn't have a direct equivalent, but we can track this for consistency
    // Note: pg-boss keeps failed jobs by default
  }

  return pgBossOptions as PgBossRequest['options']
}

/**
 * pg-boss/PostgreSQL queue service implementation
 * Supports job results, retries, and PostgreSQL-based queuing
 */
export class PgBossQueueService implements QueueService {
  readonly name = 'pg-boss'
  readonly supportsResults = true
  protected pgBoss: PgBoss

  constructor(pgBoss: PgBoss) {
    this.pgBoss = pgBoss
  }

  /**
   * Add a job to the queue
   */
  public async add<In>(
    queueName: string,
    data: In,
    options?: JobOptions
  ): Promise<string> {
    await this.pgBoss.createQueue(queueName)
    const jobId = await this.pgBoss.send(
      queueName,
      data as any,
      mapPikkuJobToPgBoss(options)
    )
    if (!jobId) {
      throw new Error('Failed to create job')
    }
    return jobId
  }

  /**
   * Get job by ID
   */
  async getJob<T, R>(
    queueName: string,
    jobId: string
  ): Promise<QueueJob<T, R> | null> {
    const job = await this.pgBoss.getJobById<T>(queueName, jobId)
    if (!job) {
      return null
    }
    return mapPgBossJobToQueueJob<T, R>(job, this.pgBoss)
  }
}
