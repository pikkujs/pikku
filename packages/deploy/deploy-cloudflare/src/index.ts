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
  createWorker,
  updateWorker,
  deleteWorker,
  getWorker,
  listWorkers,
} from './workers.js'

// Queues
export {
  createQueue,
  deleteQueue,
  listQueues,
  createConsumer,
  deleteConsumer,
} from './queues.js'

// D1 Databases
export {
  createDatabase,
  deleteDatabase,
  executeQuery,
  listDatabases,
  getDatabase,
} from './d1.js'

// R2 Buckets
export { createBucket, deleteBucket, listBuckets } from './r2.js'

// Secrets
export { setSecret, deleteSecret, listSecrets } from './secrets.js'

// Cron Triggers
export { setCronTriggers, getCronTriggers } from './cron.js'

// Deploy orchestrator (CF API direct)
export { deploy } from './deploy.js'
export type { DeployOptions, DeployResult } from './deploy.js'

// Provider adapter
import { CloudflareProviderAdapter } from './adapter.js'
export { CloudflareProviderAdapter }
export const createAdapter = () => new CloudflareProviderAdapter()

// Wrangler TOML generator
export { generateWranglerToml } from './wrangler-toml.js'

// Infrastructure manifest
export { generateInfraManifest } from './infra-manifest.js'
export type {
  CloudflareInfraManifest,
  CloudflareUnitManifest,
} from './infra-manifest.js'

// Types
export type {
  CloudflareApiResponse,
  CloudflareApiError as CloudflareApiErrorResponse,
  CloudflareApiMessage,
  CloudflareResultInfo,
  CloudflareClientOptions,
  WorkerMetadata,
  WorkerBinding,
  WorkerBindingD1,
  WorkerBindingR2,
  WorkerBindingQueue,
  WorkerBindingService,
  WorkerBindingSecretText,
  WorkerBindingPlainText,
  WorkerBindingSecretsStore,
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
