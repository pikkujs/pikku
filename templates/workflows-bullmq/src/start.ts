import { PikkuExpressServer } from '@pikku/express'
import { BullServiceFactory } from '@pikku/queue-bullmq'
import { RedisWorkflowService, RedisTriggerService } from '@pikku/redis'
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

    const workflowService = new RedisWorkflowService(undefined)

    const singletonServices = await createSingletonServices(config, {
      queueService: bullFactory.getQueueService(),
      schedulerService: bullFactory.getSchedulerService(),
      workflowService,
    })

    workflowService.setServices(singletonServices, createWireServices, config)

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
      singletonServices,
      createWireServices
    )

    singletonServices.logger.info('Registering workflow queue workers...')
    await bullQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )

    const triggerService = new RedisTriggerService(singletonServices)
    await triggerService.init()

    await triggerService.register({
      trigger: 'test-event',
      input: { eventName: 'order-created' },
      target: { rpc: 'onTestEvent' },
    })

    await triggerService.start()
    singletonServices.logger.info('Trigger service started')
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
