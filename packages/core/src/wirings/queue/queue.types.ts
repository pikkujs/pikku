import type { CommonWireMeta } from '../../types/core.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { QueueConfigMapping } from './validate-worker-config.js'
import type { Safe } from '../../classification/secret-value.js'

/** Worker settings a queue adapter maps onto its backend. Each adapter supports a subset, reported through its {@link QueueConfigMapping}; the rest are ignored with a warning. */
export interface PikkuWorkerConfig {
  name?: string
  /** Total worker concurrency. */
  batchSize?: number
  prefetch?: number
  /** Milliseconds. */
  pollInterval?: number
  /** Seconds. */
  visibilityTimeout?: number
  /** Milliseconds. */
  lockDuration?: number
  /** Seconds. */
  drainDelay?: number
  /** Number of completed jobs to retain, not an age. */
  removeOnComplete?: number
  /** Number of failed jobs to retain, not an age. */
  removeOnFail?: number
  maxStalledCount?: number
  autorun?: boolean
  /** Must not exceed {@link batchSize}. */
  groupConcurrency?: number | GroupConcurrencyConfig
}

/** Per-group concurrency limits for a worker, with optional tiers that override the default. */
export interface GroupConcurrencyConfig {
  /** Limit applied to any group without a matching tier. */
  default: number
  /** Keyed by {@link JobGroup.tier}. */
  tiers?: Record<string, number>
}

/** The group a job counts against for {@link PikkuWorkerConfig.groupConcurrency}, such as a tenant. */
export interface JobGroup {
  id: string
  tier?: string
}

/** Per-job delivery settings: retries, backoff, dead-lettering, priority and timing. */
export interface PikkuJobConfig {
  retryAttempts?: number
  /** Milliseconds. */
  retryDelay?: number
  retryBackoff?: 'linear' | 'exponential' | 'fixed'
  deadLetterQueue?: string
  /** Seconds. */
  messageRetention?: number
  /** Higher numbers run first. */
  priority?: number
  fifo?: boolean
  /** Milliseconds. */
  timeout?: number
  /** Milliseconds. */
  delay?: number
}

/** What {@link validateWorkerConfig} did with a worker's config: the settings the adapter applied, those it ignored, and why. */
export interface ConfigValidationResult {
  applied: Partial<PikkuWorkerConfig>
  ignored: Partial<PikkuWorkerConfig>
  warnings: string[]
  fallbacks: { [key: string]: any }
}

/** The lifecycle state of a queue job. */
export type QueueJobStatus =
  'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

/** Bookkeeping a backend keeps about a job: progress, attempts and timestamps. */
export type QueueJobMetadata = {
  progress?: number | string | object | undefined | boolean
  attemptsMade?: number
  maxAttempts?: number
  processedAt?: Date
  completedAt?: Date
  failedAt?: Date
  error?: string
  createdAt: Date
}

/**
 * A job as handed to {@link runQueueJob}, or returned by {@link QueueService.getJob}.
 *
 * `pikkuUserId` here is the producer's signed claim, not a verified id;
 * {@link runQueueJob} verifies it before the worker sees it.
 */
export interface QueueJob<T = any, R = any> {
  id: string
  queueName: string
  status: () => Promise<QueueJobStatus> | QueueJobStatus
  data: T
  result?: R
  waitForCompletion?: (ttl?: number) => Promise<R>
  metadata?: () => Promise<QueueJobMetadata> | QueueJobMetadata
  pikkuUserId?: string
}

/**
 * Options for {@link QueueService.add}.
 *
 * `pikkuUserId` names the user the job runs on behalf of. It only reaches the
 * worker when the queue service is wrapped in `SignedQueueService`, which
 * signs it with `PIKKU_QUEUE_IDENTITY_SECRET`; an unsigned value is dropped
 * by {@link runQueueJob}.
 */
export interface JobOptions {
  priority?: number
  delay?: number
  attempts?: number
  backoff?: string | { type: string; delay?: number }
  removeOnComplete?: number
  removeOnFail?: number
  jobId?: string
  // knowledge: decisions/security/queue-jobs-carry-the-producers-pikku-user-id.md
  pikkuUserId?: string
  /** Counts against the worker's {@link PikkuWorkerConfig.groupConcurrency}. */
  group?: JobGroup
}

export type QueueJobCounts = Record<QueueJobStatus, number>

export type QueueJobRecord = {
  jobId: string
  status: QueueJobStatus
  attemptsMade: number
  maxAttempts: number
  createdAt: Date
  processedAt: Date | null
  finishedAt: Date | null
  durationMs: number | null
  error: string | null
}

export type QueueInspection = {
  counts: QueueJobCounts
  /** Newest first. */
  recent: QueueJobRecord[]
}

/**
 * The service functions use to enqueue jobs, available as `queueService` on singleton services.
 *
 * `add` resolves to the job id. `data` must be {@link Safe}: a payload with a
 * `SecretValue` anywhere in it fails to compile, so a secret is not written to
 * the queue by accident. `getJob` returns `null` on backends that do not keep jobs
 * (`supportsResults` is then `false`).
 *
 * @example snippet: queuePublish
 */
export interface QueueService {
  readonly supportsResults: boolean

  /** Live counts and recent jobs for one queue. Absent on a queue service that cannot inspect its backlog. */
  inspect?(
    queueName: string,
    opts?: { limit?: number }
  ): Promise<QueueInspection>

  add<T>(
    queueName: string,
    data: Safe<T>,
    options?: JobOptions
  ): Promise<string>

  getJob<T, R>(queueName: string, jobId: string): Promise<QueueJob<T, R> | null>
}

/** A queue adapter's worker side: it registers every wired queue worker with its backend and reports how each worker's config was applied. */
export interface QueueWorkers {
  name: string

  supportsResults: boolean

  configMappings: QueueConfigMapping

  registerQueues(): Promise<Record<string, ConfigValidationResult[]>>
}

/** Generated metadata for every wired queue worker, keyed by queue name. */
export type QueueWorkersMeta = Record<
  string,
  CommonWireMeta & {
    name: string
    config?: PikkuWorkerConfig
  }
>

/** The configuration {@link wireQueueWorker} takes. An app's generated `wireQueueWorker` narrows the function type to its own services. */
export type CoreQueueWorker<
  PikkuFunctionConfig extends CorePikkuFunctionConfig<any, any, any> =
    CorePikkuFunctionConfig<any, any, any>,
> = {
  /** The queue this worker consumes. Whoever enqueues a job names the same string, so it is the contract between producer and consumer. */
  name: string
  /** The function to run per job. Its `input` schema is the job payload's schema — a job that does not match is rejected before the body runs. */
  func: PikkuFunctionConfig
  /** Concurrency, retry and backoff, passed through to the queue service backing this worker. Defaults come from the service, not from here. */
  config?: PikkuWorkerConfig
  /** Names of error classes that mean the job is bad rather than the run — thrown, they fail the job permanently instead of being retried. */
  errors?: string[]
  /** Filters this worker in and out of a build — see the `tags` option on `pikku all`. It has no effect at runtime. */
  tags?: string[]
  /** Wraps every job. There is no request to read from, so this is for tracing, locking and teardown rather than auth. */
  middleware?: PikkuFunctionConfig['middleware']
}

/** The `queue` part of a worker function's wire: which job is running, the verified `pikkuUserId` of whoever enqueued it (if any), and controls to report progress, fail or discard it. */
export interface PikkuQueue {
  queueName: string
  jobId: string
  pikkuUserId?: string
  updateProgress: (progress: number | string | object) => Promise<void>
  /** Never returns — throws QueueJobFailedError. */
  fail: (reason?: string) => Promise<void>
  /** Never returns — throws QueueJobDiscardedError. */
  discard: (reason?: string) => Promise<void>
}
