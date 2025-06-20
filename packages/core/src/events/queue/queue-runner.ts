import type { CoreServices } from '../../types/core.types.js'
import type { CoreQueueProcessor, QueueJob } from './queue.types.js'
import type { CoreAPIFunctionSessionless } from '../../function/functions.types.js'
import { getErrorResponse } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { CreateSessionServices } from '../../types/core.types.js'

/**
 * Error class for queue processor not found
 */
class QueueProcessorNotFoundError extends Error {
  constructor(name: string) {
    super(`Queue processor not found: ${name}`)
  }
}
/**
 * Add a queue processor to the system
 */
export const addQueueProcessor = <
  InputData = any,
  OutputData = any,
  APIFunction extends CoreAPIFunctionSessionless<
    InputData,
    OutputData
  > = CoreAPIFunctionSessionless<InputData, OutputData>,
>(
  queueProcessor: CoreQueueProcessor<InputData, OutputData, APIFunction>
) => {
  // Get processor metadata
  const meta = pikkuState('queue', 'meta')
  const processorMeta = meta[queueProcessor.name]
  if (!processorMeta) {
    throw new Error(
      `Queue processor metadata not found for '${queueProcessor.name}'. Make sure to run the CLI to generate metadata.`
    )
  }

  // Register the function with pikku
  addFunction(processorMeta.pikkuFuncName, {
    func: queueProcessor.func,
  })

  // Store processor definition in state - runtime adapters will pick this up
  const registrations = pikkuState('queue', 'registrations')
  registrations.set(queueProcessor.name, queueProcessor)
}

/**
 * Get all registered queue processors
 */
export function getQueueProcessors(): Map<string, CoreQueueProcessor> {
  return pikkuState('queue', 'registrations')
}

/**
 * Stop and remove a queue processor
 */
export async function removeQueueProcessor(name: string): Promise<void> {
  const registrations = pikkuState('queue', 'registrations')
  const registration = registrations.get(name)

  if (!registration) {
    throw new QueueProcessorNotFoundError(name)
  }

  registrations.delete(name)
}

/**
 * Process a single queue job - this function is called by queue consumers
 */
export async function runQueueJob({
  singletonServices,
  createSessionServices,
  job,
}: {
  singletonServices: CoreServices
  createSessionServices?: CreateSessionServices
  job: QueueJob
}): Promise<any> {
  const logger = singletonServices.logger

  const meta = pikkuState('queue', 'meta')
  const processorMeta = meta[job.queueName]
  if (!processorMeta) {
    throw new Error(`Processor metadata not found for: ${job.queueName}`)
  }

  try {
    logger.debug(`Processing job ${job.id} in queue ${job.queueName}`)

    // Use provided singleton services
    const getAllServices = () => ({
      ...singletonServices,
      ...(createSessionServices
        ? createSessionServices(singletonServices, {}, undefined)
        : {}),
    })

    // Execute the pikku function with the job data
    const result = await runPikkuFunc(processorMeta.pikkuFuncName, {
      getAllServices,
      data: job.data,
    })

    logger.debug(
      `Successfully processed job ${job.id} in queue ${job.queueName}`
    )
    return result
  } catch (error: any) {
    logger.error(
      `Error processing job ${job.id} in queue ${job.queueName}:`,
      error
    )

    const errorResponse = getErrorResponse(error)
    if (errorResponse != null) {
      logger.error('Processed error response:', errorResponse)
    }

    // Re-throw the error so the queue service can handle retries/DLQ
    throw error
  }
}
