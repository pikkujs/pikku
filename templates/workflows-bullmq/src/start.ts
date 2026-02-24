import { PikkuExpressServer } from '@pikku/express'
import { BullServiceFactory } from '@pikku/queue-bullmq'
import { RedisWorkflowService } from '@pikku/redis'
import { InMemoryTriggerService } from '@pikku/core/services'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const bullFactory = new BullServiceFactory()
    await bullFactory.init()

    const workflowService = new RedisWorkflowService(undefined)

    const schedulerService = bullFactory.getSchedulerService()

    const singletonServices = await createSingletonServices(config, {
      queueService: bullFactory.getQueueService(),
      schedulerService,
      workflowService,
    })

    const appServer = new PikkuExpressServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices.logger
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    singletonServices.logger.info('Starting workflow queue workers...')

    const bullQueueWorkers = bullFactory.getQueueWorkers()

    singletonServices.logger.info('Registering workflow queue workers...')
    await bullQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )

    const triggerService = new InMemoryTriggerService()

    await schedulerService.start()
    await triggerService.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
