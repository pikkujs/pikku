import { APIDocs } from '../../types/core.types.js'
import { CoreAPIFunctionSessionless } from '../../function/functions.types.js'

/**
 * Configuration for queue workers - how jobs are processed
 */
/**
 * Configuration for queue workers - how jobs are processed
 */
export interface PikkuWorkerConfig {
  /** Optional worker name for identification and monitoring */
  name?: string
  /** Maximum number of concurrent message processors */
  concurrency?: number
  /** Number of messages to process in batch (where supported) */
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
 * Queue capabilities matrix for different queue systems
 */
export interface QueueCapabilities {
  retryAttempts: boolean
  retryBackoff: boolean
  deadLetterQueue: boolean
  concurrency: boolean
  batchProcessing: boolean
  priority: boolean
  fifo: boolean
  visibilityTimeout: boolean
  messageRetention: boolean
  prefetch: boolean
  pollInterval: boolean
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
export interface QueueJob<T = any, R = any> {
  id: string
  queueName: string
  status: () => Promise<QueueJobStatus> | QueueJobStatus
  data: T
  createdAt: Date

  result?: R
  waitForCompletion?: (ttl?: number) => Promise<R>

  progress?: number
  attemptsMade?: number
  maxAttempts?: number
  processedAt?: Date
  completedAt?: Date
  failedAt?: Date
  error?: string
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
  add<T, R>(
    queueName: string,
    data: T,
    options?: JobOptions
  ): Promise<QueueJob<T, R>>

  /** Get job status and result */
  getJob<T, R>(queueName: string, jobId: string): Promise<QueueJob<T, R> | null>
}

/**
 * Queue service interface that queue adapters implement
 */
export interface QueueWorkers {
  /** Service name identifier */
  name: string

  /** Queue capabilities matrix */
  capabilities: QueueCapabilities

  /** Whether this queue service supports job results */
  supportsResults: boolean

  /** Validate config and return warnings */
  validateConfig(config: PikkuWorkerConfig): ConfigValidationResult

  /** Scan state and register all compatible processors */
  registerQueues(): Promise<void>

  /** Close all queues and connections */
  close(): Promise<void>
}

/**
 * Queue processor metadata
 */
export type QueueProcessorsMeta = Record<
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
export type CoreQueueProcessor<
  APIFunction = CoreAPIFunctionSessionless<any, any>,
> = {
  queueName: string
  func: APIFunction
  config?: PikkuWorkerConfig
  docs?: APIDocs
  session?: undefined
  tags?: string[]
}
