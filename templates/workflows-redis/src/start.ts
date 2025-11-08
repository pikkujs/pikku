import { PikkuExpressServer } from '@pikku/express'
import { BullServiceFactory } from '@pikku/queue-bullmq'
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

    // Create BullMQ service factory
    const bullFactory = new BullServiceFactory()
    await bullFactory.init()

    // Create workflow state service
    const workflowState = new RedisWorkflowStateService(undefined)

    // Create singleton services with queue and workflowState
    const singletonServices = await createSingletonServices(config, {
      queueService: bullFactory.getQueueService(),
      schedulerService: bullFactory.getSchedulerService(),
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

    const bullQueueWorkers = bullFactory.getQueueWorkers(
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
