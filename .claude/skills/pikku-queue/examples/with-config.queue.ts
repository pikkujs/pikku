import { wireQueueWorker } from './pikku-types.gen.js'
import { sendEmail } from './functions/email-worker.function.js'
import type { PikkuWorkerConfig } from '@pikku/core'

/**
 * Queue worker with configuration from static config object
 *
 * IMPORTANT: Not all config options are supported by all queue types
 * See the specific queue adapter skill for your queue type
 *
 * Note: config.ts is only created once at startup, so we use a static
 * queueConfig object here instead of calling createConfig()
 */

// Static queue configuration (imported from config file or defined inline)
const queueConfig: PikkuWorkerConfig = {
  batchSize: 10,
  visibilityTimeout: 300,
  pollInterval: 1000,
  removeOnComplete: 100,
  removeOnFail: 1000,
}

wireQueueWorker({
  queue: 'email',
  func: sendEmail,
  config: queueConfig,
})
