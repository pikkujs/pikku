/**
 * Cloudflare API response and resource types for @pikku/addon-cloudflare.
 */

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

/** A single error entry returned by the Cloudflare API. */
export interface CloudflareApiError {
  code: number
  message: string
}

/** A single message entry returned by the Cloudflare API. */
export interface CloudflareApiMessage {
  code: number
  message: string
}

/** Standard envelope for all Cloudflare v4 API responses. */
export interface CloudflareApiResponse<T> {
  success: boolean
  errors: CloudflareApiError[]
  messages: CloudflareApiMessage[]
  result: T
  result_info?: CloudflareResultInfo
}

/** Pagination metadata returned alongside list endpoints. */
export interface CloudflareResultInfo {
  page: number
  per_page: number
  total_count: number
  total_pages: number
}

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

/** Metadata returned for a deployed Worker script. */
export interface WorkerMetadata {
  id: string
  etag: string
  created_on: string
  modified_on: string
  usage_model: string
  handlers: string[]
  last_deployed_from?: string
}

/** A binding that connects a Worker to another Cloudflare resource. */
export type WorkerBinding =
  | WorkerBindingD1
  | WorkerBindingR2
  | WorkerBindingQueue
  | WorkerBindingService
  | WorkerBindingSecretText
  | WorkerBindingPlainText
  | WorkerBindingSecretsStore
  | WorkerBindingAI
  | WorkerBindingKVNamespace

export interface WorkerBindingD1 {
  type: 'd1'
  name: string
  id: string
}

export interface WorkerBindingR2 {
  type: 'r2_bucket'
  name: string
  bucket_name: string
}

export interface WorkerBindingQueue {
  type: 'queue'
  name: string
  queue_name: string
}

export interface WorkerBindingService {
  type: 'service'
  name: string
  service: string
  environment?: string
}

export interface WorkerBindingSecretText {
  type: 'secret_text'
  name: string
  text: string
}

export interface WorkerBindingPlainText {
  type: 'plain_text'
  name: string
  text: string
}

export interface WorkerBindingSecretsStore {
  type: 'secrets_store'
  name: string
  store_id: string
}

export interface WorkerBindingAI {
  type: 'ai'
  name: string
}

export interface WorkerBindingKVNamespace {
  type: 'kv_namespace'
  name: string
  namespace_id: string
}

/** Route pattern to attach to a Worker. */
export interface WorkerRoute {
  pattern: string
  zone_id?: string
  zone_name?: string
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

/** A Cloudflare Queue resource. */
export interface QueueMetadata {
  queue_id: string
  queue_name: string
  created_on: string
  modified_on: string
  producers_total_count: number
  consumers_total_count: number
}

/** A consumer bound to a Queue. */
export interface QueueConsumer {
  consumer_id: string
  script_name: string
  queue_name: string
  settings: QueueConsumerSettings
  created_on: string
}

export interface QueueConsumerSettings {
  batch_size?: number
  max_retries?: number
  max_wait_time_ms?: number
  max_concurrency?: number
}

// ---------------------------------------------------------------------------
// D1
// ---------------------------------------------------------------------------

/** A Cloudflare D1 database resource. */
export interface D1DatabaseMetadata {
  uuid: string
  name: string
  version: string
  num_tables: number
  file_size: number
  created_at: string
}

/** Result of executing a SQL query against D1. */
export interface D1QueryResult {
  results: Record<string, unknown>[]
  success: boolean
  meta: {
    served_by: string
    duration: number
    changes: number
    last_row_id: number
    changed_db: boolean
    size_after: number
    rows_read: number
    rows_written: number
  }
}

// ---------------------------------------------------------------------------
// R2
// ---------------------------------------------------------------------------

/** A Cloudflare R2 bucket resource. */
export interface R2BucketMetadata {
  name: string
  creation_date: string
  location?: string
}

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

/** An entry from the secrets list endpoint (value is never returned). */
export interface WorkerSecretEntry {
  name: string
  type: string
}

// ---------------------------------------------------------------------------
// Cron Triggers
// ---------------------------------------------------------------------------

/** A cron trigger schedule attached to a Worker. */
export interface CronTrigger {
  cron: string
  created_on?: string
  modified_on?: string
}

// ---------------------------------------------------------------------------
// Containers (beta)
// ---------------------------------------------------------------------------
// Client options
// ---------------------------------------------------------------------------

/** Configuration for creating a CloudflareClient instance. */
export interface CloudflareClientOptions {
  accountId: string
  apiToken: string
  /** Override the base URL (useful for testing). */
  baseUrl?: string
}
