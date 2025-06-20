import { APIDocs, CoreUserSession } from '../../types/core.types.js'
import { CoreAPIFunctionSessionless } from '../../function/functions.types.js'

/**
 * Unified queue configuration that translates to different queue systems
 */
export interface PikkuQueueConfig {
  /** Maximum number of concurrent message processors */
  concurrency?: number
  /** Maximum retry attempts for failed jobs */
  retryAttempts?: number
  /** Initial retry delay in milliseconds */
  retryDelay?: number
  /** Retry backoff strategy */
  retryBackoff?: 'linear' | 'exponential' | 'fixed'
  /** Queue for failed messages after max retries */
  deadLetterQueue?: string
  /** Number of messages to process in batch */
  batchSize?: number
  /** Message visibility timeout in seconds */
  visibilityTimeout?: number
  /** How long to retain completed jobs in seconds */
  messageRetention?: number
  /** Enable priority queues where supported */
  priority?: boolean
  /** Enable FIFO ordering where supported */
  fifo?: boolean
  /** Polling interval for pull-based queues in ms */
  pollInterval?: number
  /** Number of messages to prefetch */
  prefetch?: number
  /** Keep N completed jobs for inspection */
  removeOnComplete?: number
  /** Keep N failed jobs for inspection */
  removeOnFail?: number
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
  applied: Partial<PikkuQueueConfig>
  ignored: Partial<PikkuQueueConfig>
  warnings: string[]
  fallbacks: { [key: string]: any }
}

/**
 * Queue job representation
 */
export interface QueueJob<T = any, R = any> {
  queueName: string
  data: T
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  result?: R
  id?: string
  progress?: number
  attemptsMade?: number
  maxAttempts?: number
  createdAt?: Date
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

  /** Wait for job completion and get result (for queues that support results) */
  waitForResult<R>(
    queueName: string,
    jobId: string,
    timeout?: number
  ): Promise<R>
}

/**
 * Queue service interface that queue adapters implement
 */
export interface QueueAdaptor {
  /** Service name identifier */
  name: string

  /** Queue capabilities matrix */
  capabilities: QueueCapabilities

  /** Whether this queue service supports job results */
  supportsResults: boolean

  /** Translate Pikku config to native queue config */
  translateConfig(pikkuConfig: PikkuQueueConfig): any

  /** Validate config and return warnings */
  validateAndTranslateConfig(
    config: PikkuQueueConfig,
    logger: any
  ): ConfigValidationResult

  /** Scan state and register all compatible processors */
  registerQueues(): Promise<void>

  /** Close all queues and connections */
  close(): Promise<void>
}

/**
 * Queue processor metadata
 */
export type QueueProcessorsMeta<UserSession extends CoreUserSession = any> =
  Record<
    string,
    {
      pikkuFuncName: string
      schemaName?: string
      queueName: string
      session?: UserSession
      docs?: APIDocs
      tags?: string[]
      config?: PikkuQueueConfig
    }
  >

/**
 * Core queue processor definition
 */
export type CoreQueueProcessor<
  InputData = any,
  OutputData = any,
  APIFunction = CoreAPIFunctionSessionless<InputData, OutputData>,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  name: string
  queueName: string
  func: APIFunction
  config?: PikkuQueueConfig
  docs?: APIDocs
  session?: UserSession
  tags?: string[]
}
