import type { PikkuRawWire } from '../../types/core.types.js'
import type { CoreQueueWorker, QueueJob, PikkuQueue } from './queue.types.js'
import type {
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
} from '../../function/functions.types.js'
import { getErrorResponse, PikkuError } from '../../errors/error-handler.js'
import { PikkuMissingMetaError } from '../../errors/errors.js'
import {
  getSingletonServices,
  getCreateWireServices,
  pikkuState,
} from '../../pikku-state.js'
import { addFunction, runPikkuFunc } from '../../function/function-runner.js'
import { resolveQueueJobIdentity } from './queue-identity.js'

class QueueWorkerNotFoundError extends PikkuError {
  constructor(name: string) {
    super(`Queue processor not found: ${name}`)
  }
}

export class QueueJobFailedError extends PikkuError {
  constructor(jobId: string, reason?: string) {
    super(`Queue job ${jobId} failed${reason ? `: ${reason}` : ''}`)
    this.name = 'QueueJobFailedError'
  }
}

export class QueueJobDiscardedError extends PikkuError {
  constructor(jobId: string, reason?: string) {
    super(`Queue job ${jobId} discarded${reason ? `: ${reason}` : ''}`)
    this.name = 'QueueJobDiscardedError'
  }
}

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
  const meta = pikkuState(null, 'queue', 'meta')
  const processorMeta = meta[queueWorker.name]
  if (!processorMeta) {
    console.warn(
      `[pikku] Skipping queue worker '${queueWorker.name}' — metadata not found. Consider moving this wiring to its own file.`
    )
    return
  }

  addFunction(processorMeta.pikkuFuncId, {
    func: queueWorker.func.func,
    auth: queueWorker.func.auth,
    permissions: queueWorker.func.permissions,
    middleware: queueWorker.func.middleware as any,
    tags: queueWorker.func.tags,
  })

  const registrations = pikkuState(null, 'queue', 'registrations')
  registrations.set(queueWorker.name, queueWorker)
}

export function getQueueWorkers(): Map<string, CoreQueueWorker> {
  return pikkuState(null, 'queue', 'registrations')
}

export async function removeQueueWorker(name: string): Promise<void> {
  const registrations = pikkuState(null, 'queue', 'registrations')
  const registration = registrations.get(name)

  if (!registration) {
    throw new QueueWorkerNotFoundError(name)
  }

  registrations.delete(name)
}

export async function runQueueJob({
  job,
  updateProgress,
  traceId,
}: {
  job: QueueJob
  updateProgress?: (progress: number | string | object) => Promise<void>
  traceId?: string
}): Promise<void> {
  const singletonServices = getSingletonServices()
  const createWireServices = getCreateWireServices()
  const resolvedTraceId = traceId ?? `q-${job.id}`
  const logger =
    singletonServices.logger.scope?.(resolvedTraceId) ??
    singletonServices.logger

  const meta = pikkuState(null, 'queue', 'meta')
  const processorMeta = meta[job.queueName]
  if (!processorMeta) {
    throw new PikkuMissingMetaError(
      `Missing generated metadata for queue worker '${job.queueName}'`
    )
  }

  const registrations = pikkuState(null, 'queue', 'registrations')
  const queueWorker = registrations.get(job.queueName)
  if (!queueWorker) {
    throw new Error(`Queue worker registration not found for: ${job.queueName}`)
  }

  // knowledge: decisions/security/queue-job-identities-are-signed-at-enqueue.md
  const pikkuUserId = await resolveQueueJobIdentity({
    claimedIdentity: job.pikkuUserId,
    binding: { queueName: job.queueName, jobId: job.id, data: job.data },
    secrets: singletonServices.secrets,
    logger,
  })

  const queue: PikkuQueue = {
    queueName: job.queueName,
    jobId: job.id,
    pikkuUserId,
    updateProgress:
      updateProgress ||
      (async (progress: number | string | object) => {
        logger.info(`Job ${job.id} progress: ${progress}`)
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

    const wire: PikkuRawWire = {
      traceId: resolvedTraceId,
      queue,
    }

    const result = await runPikkuFunc(
      'queue',
      job.queueName,
      processorMeta.pikkuFuncId,
      {
        singletonServices,
        createWireServices,
        auth: false,
        data: () => job.data,
        inheritedMiddleware: processorMeta.middleware,
        wireMiddleware: queueWorker.middleware,
        tags: queueWorker.tags,
        wire,
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

    throw error
  }
}
