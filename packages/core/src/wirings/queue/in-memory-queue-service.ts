import type {
  QueueService,
  QueueJob,
  JobOptions,
  QueueInspection,
  QueueJobRecord,
  QueueJobStatus,
} from './queue.types.js'
import { runQueueJob } from './queue-runner.js'

const FINISHED_JOBS_KEPT = 100

// knowledge: decisions/internals/the-dev-queue-copies-prod-timing-and-serialization-semantics.md
/**
 * A {@link QueueService} that runs jobs in-process, for development and tests.
 *
 * Jobs run after a short delay, payloads are JSON round-tripped as a real
 * backend would, and failed jobs are retried up to `attempts` with the given
 * backoff. Nothing is persisted, `getJob` always returns `null`, and jobs still
 * pending when the process exits are lost.
 */
export class InMemoryQueueService implements QueueService {
  readonly supportsResults = false
  private jobCounter = 0
  private jobs = new Map<string, QueueJobRecord[]>()
  private finishedTotals = new Map<
    string,
    { completed: number; failed: number }
  >()

  async add<T>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<string> {
    const jobId = `inmem-${++this.jobCounter}`
    const maxAttempts = Math.max(1, options?.attempts ?? 1)
    let attemptsMade = 0
    const createdAt = new Date()
    const payload: T =
      data === undefined ? data : (JSON.parse(JSON.stringify(data)) as T)

    const record: QueueJobRecord = {
      jobId,
      status: options?.delay ? 'delayed' : 'waiting',
      attemptsMade: 0,
      maxAttempts,
      createdAt,
      processedAt: null,
      finishedAt: null,
      durationMs: null,
      error: null,
    }
    this.track(queueName, record)

    const runAttempt = async () => {
      attemptsMade++
      record.attemptsMade = attemptsMade
      record.status = 'active'
      record.processedAt = new Date()
      const job: QueueJob<T> = {
        id: jobId,
        queueName,
        data: payload,
        status: () => 'active',
        metadata: () => ({ attemptsMade, maxAttempts, createdAt }),
        pikkuUserId: options?.pikkuUserId,
      }
      try {
        await runQueueJob({ job })
        this.finish(queueName, record, 'completed', null)
      } catch (e: any) {
        record.error = e?.message ?? String(e)
        if (attemptsMade < maxAttempts) {
          record.status = 'delayed'
          // Fire-and-forget retry: runAttempt catches every error itself.
          setTimeout(
            () => void runAttempt(),
            this.backoffDelay(options?.backoff, attemptsMade)
          )
        } else {
          this.finish(queueName, record, 'failed', record.error)
          console.error(
            `[InMemoryQueue] Job ${jobId} on ${queueName} failed after ${attemptsMade} attempt(s):`,
            e.message
          )
        }
      }
    }

    const delay = options?.delay ?? 100 + Math.floor(Math.random() * 201)
    // Fire-and-forget: runAttempt catches every error itself.
    setTimeout(() => void runAttempt(), delay)

    return jobId
  }

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

  async inspect(
    queueName: string,
    opts?: { limit?: number }
  ): Promise<QueueInspection> {
    const records = this.jobs.get(queueName) ?? []
    const totals = this.finishedTotals.get(queueName)
    const counts: Record<QueueJobStatus, number> = {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: totals?.completed ?? 0,
      failed: totals?.failed ?? 0,
    }
    for (const record of records) {
      if (record.status !== 'completed' && record.status !== 'failed') {
        counts[record.status]++
      }
    }
    return {
      counts,
      recent: records
        .slice(0, opts?.limit ?? 50)
        .map((record) => ({ ...record })),
    }
  }

  private track(queueName: string, record: QueueJobRecord) {
    const records = this.jobs.get(queueName) ?? []
    records.unshift(record)
    this.jobs.set(queueName, records)
  }

  private finish(
    queueName: string,
    record: QueueJobRecord,
    status: 'completed' | 'failed',
    error: string | null
  ) {
    record.status = status
    record.error = error
    record.finishedAt = new Date()
    record.durationMs =
      record.finishedAt.getTime() -
      (record.processedAt ?? record.createdAt).getTime()
    const totals = this.finishedTotals.get(queueName) ?? {
      completed: 0,
      failed: 0,
    }
    totals[status]++
    this.finishedTotals.set(queueName, totals)

    const records = this.jobs.get(queueName) ?? []
    let finished = 0
    this.jobs.set(
      queueName,
      records.filter(
        (r) =>
          (r.status !== 'completed' && r.status !== 'failed') ||
          ++finished <= FINISHED_JOBS_KEPT
      )
    )
  }
}
