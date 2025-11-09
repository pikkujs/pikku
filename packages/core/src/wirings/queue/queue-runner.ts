import type { CoreServices, PikkuInteraction } from '../../types/core.types.js'
import type { CoreQueueWorker, QueueJob, PikkuQueue } from './queue.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'
import { getErrorResponse, PikkuError } from '../../errors/error-handler.js'
import { pikkuState } from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import {
  CreateSessionServices,
  PikkuWiringTypes,
} from '../../types/core.types.js'
import { rpcService } from '../rpc/rpc-runner.js'

/**
 * Error class for queue processor not found
 */
class QueueWorkerNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Queue processor not found: ${name}`)
  }
}

/**
 * Error class for when a queue job is explicitly failed
 */
export class QueueJobFailedError extends PikkuError {
  constructor(jobId: string, reason?: string) {
    super(`Queue job ${jobId} failed${reason ? `: ${reason}` : ''}`)
    this.name = 'QueueJobFailedError'
  }
}

/**
 * Error class for when a queue job is explicitly discarded
 */
export class QueueJobDiscardedError extends PikkuError {
  constructor(jobId: string, reason?: string) {
    super(`Queue job ${jobId} discarded${reason ? `: ${reason}` : ''}`)
    this.name = 'QueueJobDiscardedError'
  }
}
/**
 * Add a queue processor to the system
 */
export const wireQueueWorker = <
  InputData = any,
  OutputData = any,
  PikkuFunctionConfig extends CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<InputData, OutputData>
  > = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<InputData, OutputData>
  >,
>(
  queueWorker: CoreQueueWorker<PikkuFunctionConfig>
) => {
  // Get processor metadata
  const meta = pikkuState('queue', 'meta')
  const processorMeta = meta[queueWorker.queueName]
  if (!processorMeta) {
    throw new Error(
      `Queue processor metadata not found for '${queueWorker.queueName}'. Make sure to run the CLI to generate metadata.`
    )
  }

  // Register the function with pikku
  addFunction(processorMeta.pikkuFuncName, {
    func: queueWorker.func.func,
    auth: queueWorker.func.auth,
    permissions: queueWorker.func.permissions,
    middleware: queueWorker.func.middleware as any,
    tags: queueWorker.func.tags,
    docs: queueWorker.func.docs as any,
  })

  // Store processor definition in state - runtime adapters will pick this up
  const registrations = pikkuState('queue', 'registrations')
  registrations.set(queueWorker.queueName, queueWorker)
}

/**
 * Get all registered queue processors
 */
export function getQueueWorkers(): Map<string, CoreQueueWorker> {
  return pikkuState('queue', 'registrations')
}

/**
 * Stop and remove a queue processor
 */
export async function removeQueueWorker(name: string): Promise<void> {
  const registrations = pikkuState('queue', 'registrations')
  const registration = registrations.get(name)

  if (!registration) {
    throw new QueueWorkerNotFoundError(name)
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
  updateProgress,
}: {
  singletonServices: CoreServices
  createSessionServices?: CreateSessionServices
  job: QueueJob
  updateProgress?: (progress: number | string | object) => Promise<void>
}): Promise<void> {
  const logger = singletonServices.logger

  const meta = pikkuState('queue', 'meta')
  const processorMeta = meta[job.queueName]
  if (!processorMeta) {
    throw new Error(`Processor metadata not found for: ${job.queueName}`)
  }

  // Get the queue worker registration to access middleware
  const registrations = pikkuState('queue', 'registrations')
  const queueWorker = registrations.get(job.queueName)
  if (!queueWorker) {
    throw new Error(`Queue worker registration not found for: ${job.queueName}`)
  }

  // Create the queue interaction object
  const queue: PikkuQueue = {
    queueName: job.queueName,
    jobId: job.id,
    updateProgress:
      updateProgress ||
      (async (progress: number | string | object) => {
        logger.info(`Job ${job.id} progress: ${progress}`)
        // Default implementation - just log the progress
      }),
    fail: async (reason?: string) => {
      throw new QueueJobFailedError(job.id, reason)
    },
    discard: async (reason?: string) => {
      throw new QueueJobDiscardedError(job.id, reason)
    },
  }

  try {
    logger.info(`Processing job ${job.id} in queue ${job.queueName}`)

    const interaction: PikkuInteraction = { queue }
    // Use provided singleton services
    const getAllServices = async () => {
      const sessionServices = await createSessionServices?.(
        singletonServices,
        { queue },
        undefined
      )

      const services = rpcService.injectRPCService(
        {
          ...singletonServices,
          ...sessionServices,
        },
        interaction,
        false
      )

      return services
    }

    // Execute the pikku function with the job data
    const result = await runPikkuFunc(
      PikkuWiringTypes.queue,
      job.queueName,
      processorMeta.pikkuFuncName,
      {
        singletonServices,
        getAllServices,
        auth: false,
        data: () => job.data,
        inheritedMiddleware: processorMeta.middleware,
        wireMiddleware: queueWorker.middleware,
        tags: queueWorker.tags,
        interaction,
      }
    )

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
