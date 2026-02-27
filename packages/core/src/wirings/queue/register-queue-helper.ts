import type { ConfigValidationResult, CoreQueueWorker } from './queue.types.js'
import { getQueueWorkers } from './queue-runner.js'
import type { QueueConfigMapping } from './validate-worker-config.js'
import { validateWorkerConfig } from './validate-worker-config.js'
import type { Logger } from '../../services/logger.js'

/**
 * Queue processor registration callback
 */
export type QueueRegistrationCallback<T = any> = (
  queueName: string,
  processor: CoreQueueWorker
) => Promise<T>

/**
 * Helper function to register queue processors with validation
 * This centralizes the common logic for looping over processors and validating configs
 *
 * @param configMappings - Configuration mapping for the queue implementation
 * @param registerCallback - Callback to register each individual queue processor
 * @param logger - Optional logger for info/error messages
 * @returns Record of validation results by queue name
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
    // Validate the processor configuration
    const validationResult = validateWorkerConfig(
      configMappings,
      processor.config
    )

    // Store validation results
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
