/**
 * @pikku/deploy-cloudflare — Cloudflare API adapter for Pikku.
 *
 * Provides typed wrappers around the Cloudflare REST API for managing
 * Workers, Queues, D1, R2, Secrets, and Cron Triggers.
 */

// Client
export { CloudflareClient, CloudflareApiError } from './client.js'

// Workers
export {
  updateWorker,
  deleteWorker,
  getWorker,
  listWorkers,
} from './workers.js'

// Queues
export {
  deleteConsumer,
} from './queues.js'

// D1 Databases
export {
  createDatabase,
  deleteDatabase,
  executeQuery,
  getDatabase,
} from './d1.js'

// R2 Buckets
export { deleteBucket } from './r2.js'

// Secrets
export { setSecret, deleteSecret, listSecrets } from './secrets.js'

// Cron Triggers
export { getCronTriggers } from './cron.js'

// Deploy orchestrator (CF API direct)
export { deploy } from './deploy.js'
export type { DeployOptions, DeployResult } from './deploy.js'

// Provider adapter
import { CloudflareProviderAdapter } from './adapter.js'
import type { CloudflareProviderAdapterOptions } from './adapter.js'
export { CloudflareProviderAdapter }
export type {
  DeploymentUnit,
  DeploymentManifest,
  EntryGenerationContext,
  PlatformServiceContributor,
  CloudflareProviderAdapterOptions,
} from './adapter.js'
export const createAdapter = (options: CloudflareProviderAdapterOptions = {}) =>
  new CloudflareProviderAdapter(options)
export type {
  CloudflareInfraManifest,
} from './infra-manifest.js'

// Types
export type {
  CloudflareApiError as CloudflareApiErrorResponse,
  WorkerMetadata,
  WorkerBinding,
  WorkerRoute,
  QueueMetadata,
  QueueConsumer,
  QueueConsumerSettings,
  D1DatabaseMetadata,
  D1QueryResult,
  R2BucketMetadata,
  WorkerSecretEntry,
  CronTrigger,
} from './types.js'
