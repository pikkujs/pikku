import { APIDocs } from '../../types/core.types.js'
import { CorePikkuFunctionSessionless } from '../../function/functions.types.js'
import { QueueConfigMapping } from './validate-worker-config.js'

/**
 * Configuration for queue workers - how jobs are processed
 */
/**
 * Configuration for queue workers - how jobs are processed
 */
export interface PikkuWorkerConfig {
  /** Optional worker name for identification and monitoring */
  name?: string
  /** Number of messages to process in batch / in parallel */
  batchSize?: number
  /** Number of messages to prefetch for efficiency */
  prefetch?: number
  /** Polling interval for pull-based queues in ms */
  pollInterval?: number
  /** Message visibility timeout in seconds */
  visibilityTimeout?: number
  /** Duration of job lock in milliseconds */
  lockDuration?: number
  /** Number of seconds to wait when queue is empty before polling again */
  drainDelay?: number
  /** Keep N completed jobs for inspection */
  removeOnComplete?: number
  /** Keep N failed jobs for inspection */
  removeOnFail?: number
  /** Maximum number of times a job can be recovered from stalled state */
  maxStalledCount?: number
  /** Condition to start processor at instance creation */
  autorun?: boolean
}

/**
 * Configuration for individual jobs - how jobs behave
 */
export interface PikkuJobConfig {
  /** Maximum retry attempts for failed jobs */
  retryAttempts?: number
  /** Initial retry delay in milliseconds */
  retryDelay?: number
  /** Retry backoff strategy */
  retryBackoff?: 'linear' | 'exponential' | 'fixed'
  /** Queue for failed messages after max retries */
  deadLetterQueue?: string
  /** How long to retain completed jobs in seconds */
  messageRetention?: number
  /** Job priority (higher numbers = higher priority) */
  priority?: number
  /** Enable FIFO ordering where supported */
  fifo?: boolean
  /** Job timeout in milliseconds */
  timeout?: number
  /** Delay before job execution in milliseconds */
  delay?: number
}

/**
 * Configuration validation result with warnings and fallbacks
 */
export interface ConfigValidationResult {
  applied: Partial<PikkuWorkerConfig>
  ignored: Partial<PikkuWorkerConfig>
  warnings: string[]
  fallbacks: { [key: string]: any }
}

/**
 * Queue job representation
 */
export type QueueJobStatus =
  | 'waiting'
  | 'active'
  | 'completed'
  | 'failed'
  | 'delayed'

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
}

/**
 * Job options for queue operations
 */
export interface JobOptions {
  priority?: number
  delay?: number
  attempts?: number
  backoff?: string | { type: string; delay?: number }
  removeOnComplete?: number
  removeOnFail?: number
  jobId?: string
}

/**
 * Queue provider interface for job publishing operations
 */
export interface QueueService {
  /** Whether this queue provider supports job results */
  readonly supportsResults: boolean

  /** Add a job to the queue with type safety */
  add<T>(queueName: string, data: T, options?: JobOptions): Promise<string>

  /** Get job status and result */
  getJob<T, R>(queueName: string, jobId: string): Promise<QueueJob<T, R> | null>
}

/**
 * Queue service interface that queue adapters implement
 */
export interface QueueWorkers {
  /** Service name identifier */
  name: string

  /** Whether this queue service supports job results */
  supportsResults: boolean

  /** Configuration mapping for validation */
  configMappings: QueueConfigMapping

  /** Scan state and register all compatible processors */
  registerQueues(): Promise<Record<string, ConfigValidationResult[]>>

  /** Close all queues and connections */
  close(): Promise<void>
}

/**
 * Queue processor metadata
 */
export type queueWorkersMeta = Record<
  string,
  {
    pikkuFuncName: string
    schemaName?: string
    queueName: string
    session?: undefined
    docs?: APIDocs
    tags?: string[]
    config?: PikkuWorkerConfig
  }
>

/**
 * Core queue processor definition
 */
export type CoreQueueWorker<
  PikkuFunction = CorePikkuFunctionSessionless<any, any>,
> = {
  queueName: string
  func: PikkuFunction
  config?: PikkuWorkerConfig
  docs?: APIDocs
  session?: undefined
  tags?: string[]
}
