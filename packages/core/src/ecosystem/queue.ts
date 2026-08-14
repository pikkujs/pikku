export {
  QueueJobDiscardedError,
  QueueJobFailedError,
} from '../wirings/queue/queue-runner.js'
export type {
  ConfigValidationResult,
  CoreQueueWorker,
  JobOptions,
  PikkuJobConfig,
  PikkuWorkerConfig,
  QueueWorkers,
  QueueWorkersMeta,
} from '../wirings/queue/queue.types.js'
export { registerQueueWorkers } from '../wirings/queue/register-queue-helper.js'
export type { QueueConfigMapping } from '../wirings/queue/validate-worker-config.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { Logger } from '../services/logger.js'
export type { QueueRegistrationCallback } from '../wirings/queue/register-queue-helper.js'
