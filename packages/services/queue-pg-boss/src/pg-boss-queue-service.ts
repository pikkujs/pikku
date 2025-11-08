import PgBoss from 'pg-boss'
import type { QueueService, QueueJob, JobOptions } from '@pikku/core/queue'
import { mapPgBossJobToQueueJob } from './utils.js'

export const mapPikkuJobToPgBoss = (
  options?: JobOptions
): PgBoss.JobOptions => {
  const pgBossOptions: PgBoss.JobOptions = {}

  if (options?.priority !== undefined) {
    pgBossOptions.priority = options.priority
  }

  if (options?.delay !== undefined) {
    pgBossOptions.startAfter = new Date(Date.now() + options.delay)
  }

  if (options?.jobId !== undefined) {
    pgBossOptions.singletonKey = options.jobId
  }

  return pgBossOptions
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
