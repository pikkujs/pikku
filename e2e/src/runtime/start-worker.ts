import { stopSingletonServices } from '@pikku/core'
import { createSchedulerRuntimeHandlers } from '@pikku/core/scheduler'
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
  const singletonServices = await createSingletonServices(config, {
    queueService: infrastructure.queueService as any,
    schedulerService: infrastructure.schedulerService as any,
    workflowService: infrastructure.workflowService as any,
  })

  infrastructure.schedulerService?.setServices(
    createSchedulerRuntimeHandlers({
      singletonServices,
      createWireServices,
    })
  )
  infrastructure.workflowService?.setServices(
    singletonServices,
    createWireServices,
    config
  )

  const queueWorkers = infrastructure.createQueueWorkers?.(
    singletonServices,
    createWireServices
  )
  if (!queueWorkers) {
    throw new Error('Queue workers are not configured')
  }

  await queueWorkers.registerQueues()
  await infrastructure.schedulerService?.start?.()

  singletonServices.logger.info('E2E_WORKER_READY')

  const shutdown = async () => {
    await infrastructure.schedulerService?.stop?.()
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
