import type { ConfigValidationResult, CoreQueueWorker } from './queue.types.js'
import { getQueueWorkers } from './queue-runner.js'
import type { QueueConfigMapping } from './validate-worker-config.js'
import { validateWorkerConfig } from './validate-worker-config.js'
import type { Logger } from '../../services/logger.js'

/** Called by {@link registerQueueWorkers} once per wired worker, to attach it to the adapter's backend. */
export type QueueRegistrationCallback<T = any> = (
  queueName: string,
  processor: CoreQueueWorker
) => Promise<T>

/**
 * Validates every wired queue worker's config against an adapter's mapping and registers each one through `registerCallback`.
 *
 * A worker whose registration throws is logged and skipped, so one bad worker
 * does not stop the rest.
 *
 * @param configMappings - Which {@link PikkuWorkerConfig} keys the adapter supports and how they map.
 * @param logger - Receives registration progress, config warnings and failures.
 * @param registerCallback - Attaches one worker to the backend.
 * @returns The config validation result for each queue.
 */
export async function registerQueueWorkers<T = any>(
  configMappings: QueueConfigMapping,
  logger: Logger,
  registerCallback: QueueRegistrationCallback<T>
): Promise<Record<string, ConfigValidationResult[]>> {
  const configValidation: Record<string, ConfigValidationResult[]> = {}
  const queueWorkers = getQueueWorkers()

  for (const [queueName, processor] of queueWorkers) {
    logger?.info(`Registering queue processor: ${queueName}`)
    const validationResult = validateWorkerConfig(
      configMappings,
      processor.config
    )

    configValidation[queueName] = configValidation[queueName] || []
    configValidation[queueName].push(validationResult)

    if (validationResult.warnings.length > 0) {
      logger?.warn(
        `Configuration warnings for queue ${queueName}:`,
        validationResult.warnings
      )
    }

    try {
      await registerCallback(queueName, processor)
      logger?.info(`Successfully registered queue processor: ${queueName}`)
    } catch (error) {
      logger?.error(`Failed to register queue processor ${queueName}:`, error)
    }
  }

  return configValidation
}
