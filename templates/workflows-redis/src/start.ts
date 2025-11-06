import { PikkuExpressServer } from '@pikku/express'
import { BullQueueWorkers, BullQueueService } from '@pikku/queue-bullmq'
import { RedisWorkflowStateService } from '@pikku/redis'
import {
  createConfig,
  createSessionServices,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    // Create queue service for workflows
    const bullQueueService = new BullQueueService(undefined)

    // Create workflow state service with queue
    const workflowState = new RedisWorkflowStateService(
      undefined,
      bullQueueService
    )

    // Create singleton services with queue and workflowState
    const singletonServices = await createSingletonServices(config, {
      queueService: bullQueueService,
      workflowState,
    })

    workflowState.setServices(singletonServices, createSessionServices as any)

    // Start HTTP server for workflow triggers
    const appServer = new PikkuExpressServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices,
      createSessionServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    singletonServices.logger.info('Starting workflow queue workers...')

    const bullQueueWorkers = new BullQueueWorkers(
      {},
      singletonServices,
      createSessionServices as any
    )

    singletonServices.logger.info('Registering workflow queue workers...')
    await bullQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
