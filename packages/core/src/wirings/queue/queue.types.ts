import type { CommonWireMeta } from '../../types/core.types.js'
import type { CorePikkuFunctionConfig } from '../../function/functions.types.js'
import type { QueueConfigMapping } from './validate-worker-config.js'
import type { Safe } from '../../classification/secret-value.js'

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

export interface GroupConcurrencyConfig {
  /** Limit applied to any group without a matching tier. */
  default: number
  /** Keyed by {@link JobGroup.tier}. */
  tiers?: Record<string, number>
}

export interface JobGroup {
  id: string
  tier?: string
}

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

export interface ConfigValidationResult {
  applied: Partial<PikkuWorkerConfig>
  ignored: Partial<PikkuWorkerConfig>
  warnings: string[]
  fallbacks: { [key: string]: any }
}

export type QueueJobStatus =
  'waiting' | 'active' | 'completed' | 'failed' | 'delayed'

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

export interface QueueService {
  readonly supportsResults: boolean

  add<T>(
    queueName: string,
    data: Safe<T>,
    options?: JobOptions
  ): Promise<string>

  getJob<T, R>(queueName: string, jobId: string): Promise<QueueJob<T, R> | null>
}

export interface QueueWorkers {
  name: string

  supportsResults: boolean

  configMappings: QueueConfigMapping

  registerQueues(): Promise<Record<string, ConfigValidationResult[]>>
}

export type QueueWorkersMeta = Record<
  string,
  CommonWireMeta & {
    name: string
    config?: PikkuWorkerConfig
  }
>

export type CoreQueueWorker<
  PikkuFunctionConfig extends CorePikkuFunctionConfig<any, any, any> =
    CorePikkuFunctionConfig<any, any, any>,
> = {
  name: string
  func: PikkuFunctionConfig
  config?: PikkuWorkerConfig
  errors?: string[]
  tags?: string[]
  middleware?: PikkuFunctionConfig['middleware']
}

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
