import type { ConfigValidationResult, CoreQueueWorker } from './queue.types.js'
import { getQueueWorkers } from './queue-runner.js'
import type { QueueConfigMapping } from './validate-worker-config.js'
import { validateWorkerConfig } from './validate-worker-config.js'
import type { Logger } from '../../services/logger.js'

export type QueueRegistrationCallback<T = any> = (
  queueName: string,
  processor: CoreQueueWorker
) => Promise<T>

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
