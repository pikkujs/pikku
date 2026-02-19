import { createFunctionRunner, stopSingletonServices } from '@pikku/core'
import {
  createConfig,
  createInfrastructure,
  createSingletonServices,
  createWireServices,
} from '../services.js'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const generatedDir = process.env.E2E_GENERATED_DIR || '.pikku'

async function main(): Promise<void> {
  const bootstrapPath = path.resolve(generatedDir, 'pikku-bootstrap.gen.js')
  await import(pathToFileURL(bootstrapPath).href)

  const config = await createConfig()
  const infrastructure = await createInfrastructure()
  const queueService = infrastructure.queueService as any
  const singletonServices = await createSingletonServices(config, {
    queueService,
  })
  const schedulerService = infrastructure.createSchedulerService?.(
    singletonServices.logger
  )
  const workflowService = infrastructure.createWorkflowService?.({
    logger: singletonServices.logger,
    queueService,
    schedulerService,
    workflow: config.workflow,
  })
  await workflowService?.init?.()
  singletonServices.workflowService = workflowService as any
  singletonServices.schedulerService = schedulerService as any
  const runFunction = createFunctionRunner(
    singletonServices,
    createWireServices
  )

  schedulerService?.setPikkuFunctionRunner(runFunction)
  workflowService?.setPikkuFunctionRunner(runFunction)

  const queueWorkers = infrastructure.createQueueWorkers?.(
    runFunction,
    singletonServices.logger
  )
  if (!queueWorkers) {
    throw new Error('Queue workers are not configured')
  }

  await queueWorkers.registerQueues()
  await schedulerService?.start?.()

  singletonServices.logger.info('E2E_WORKER_READY')

  const shutdown = async () => {
    await schedulerService?.stop?.()
    await infrastructure.close()
    await stopSingletonServices(singletonServices)
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
