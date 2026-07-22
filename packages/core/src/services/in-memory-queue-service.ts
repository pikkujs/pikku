import type {
  QueueService,
  QueueJob,
  JobOptions,
} from '../wirings/queue/queue.types.js'
import { runQueueJob } from '../wirings/queue/queue-runner.js'

/**
 * In-process queue for local/dev runs. Schedules jobs on the macrotask queue
 * (setTimeout) so dispatch is genuinely asynchronous — the same timing shape as
 * a real queue — and redelivers a failed job up to `options.attempts` times with
 * backoff, so a transiently-failing workflow step recovers exactly as it would
 * on pg-boss/bullmq instead of being silently dropped on its first error.
 */
export class InMemoryQueueService implements QueueService {
  readonly supportsResults = false
  private jobCounter = 0

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const jobId = `inmem-${++this.jobCounter}`
    const maxAttempts = Math.max(1, options?.attempts ?? 1)
    let attemptsMade = 0
    const createdAt = new Date()

    const runAttempt = async () => {
      attemptsMade++
      const job: QueueJob<T> = {
        id: jobId,
        queueName,
        data,
        status: () => 'active',
        metadata: () => ({ attemptsMade, maxAttempts, createdAt }),
        pikkuUserId: options?.pikkuUserId,
      }
      try {
        await runQueueJob({ job })
      } catch (e: any) {
        if (attemptsMade < maxAttempts) {
          // Transient failure — redeliver with backoff, mirroring a real queue.
          setTimeout(
            runAttempt,
            this.backoffDelay(options?.backoff, attemptsMade)
          )
        } else {
          console.error(
            `[InMemoryQueue] Job ${jobId} on ${queueName} failed after ${attemptsMade} attempt(s):`,
            e.message
          )
        }
      }
    }

    const delay = options?.delay ?? 100 + Math.floor(Math.random() * 201)
    setTimeout(runAttempt, delay)

    return jobId
  }

  /** Delay before the next redelivery, honoring the job's backoff policy. */
  private backoffDelay(
    backoff: JobOptions['backoff'],
    attemptsMade: number
  ): number {
    const baseDelay = typeof backoff === 'object' ? (backoff.delay ?? 50) : 50
    if (
      backoff === 'exponential' ||
      (typeof backoff === 'object' && backoff?.type === 'exponential')
    ) {
      return Math.min(2 ** (attemptsMade - 1) * baseDelay, 2000)
    }
    if (typeof backoff === 'object' && backoff?.type === 'fixed') {
      return backoff.delay ?? 50
    }
    return 50
  }

  async getJob(): Promise<null> {
    return null
  }
}
