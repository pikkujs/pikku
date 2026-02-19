import { PikkuExpressServer } from '@pikku/express'
import { BullServiceFactory } from '@pikku/queue-bullmq'
import { RedisWorkflowService } from '@pikku/redis'
import { InMemoryTriggerService } from '@pikku/core/services'
import { createFunctionRunner } from '@pikku/core'
import {
  createConfig,
  createWireServices,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const bullFactory = new BullServiceFactory()
    await bullFactory.init()

    const singletonServices = await createSingletonServices(config, {
      queueService: bullFactory.getQueueService(),
    })
    const schedulerService = bullFactory.getSchedulerService(
      singletonServices.logger
    )
    const workflowService = new RedisWorkflowService(undefined, 'workflows', {
      queueService: bullFactory.getQueueService(),
      schedulerService,
      logger: singletonServices.logger,
      workflow: config.workflow,
    })
    singletonServices.workflowService = workflowService
    singletonServices.schedulerService = schedulerService
    const runFunction = createFunctionRunner(
      singletonServices,
      createWireServices
    )

    schedulerService.setPikkuFunctionRunner(runFunction)
    workflowService.setPikkuFunctionRunner(runFunction)

    const appServer = new PikkuExpressServer(
      { ...config, port: 4002, hostname: 'localhost' },
      singletonServices,
      createWireServices
    )
    appServer.enableExitOnSigInt()
    await appServer.init()
    await appServer.start()

    singletonServices.logger.info('Starting workflow queue workers...')

    const bullQueueWorkers = bullFactory.getQueueWorkers(
      runFunction,
      singletonServices.logger
    )

    singletonServices.logger.info('Registering workflow queue workers...')
    await bullQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )

    const triggerService = new InMemoryTriggerService(singletonServices.logger)
    triggerService.setPikkuFunctionRunner(runFunction)

    await schedulerService.start()
    await triggerService.start()
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
