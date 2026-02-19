import { PikkuExpressServer } from '@pikku/express'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { PgWorkflowService } from '@pikku/pg'
import { InMemoryTriggerService } from '@pikku/core/services'
import { createFunctionRunner } from '@pikku/core'
import postgres from 'postgres'
import {
  createConfig,
  createWireServices,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    const sql = postgres(connectionString)

    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()

    const singletonServices = await createSingletonServices(config, {
      queueService: pgBossFactory.getQueueService(),
    })
    const schedulerService = pgBossFactory.getSchedulerService(
      singletonServices.logger
    )
    const workflowService = new PgWorkflowService(sql, 'pikku', {
      queueService: pgBossFactory.getQueueService(),
      schedulerService,
      logger: singletonServices.logger,
      workflow: config.workflow,
    })
    await workflowService.init()
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

    const pgBossQueueWorkers = pgBossFactory.getQueueWorkers(
      runFunction,
      singletonServices.logger
    )

    singletonServices.logger.info('Registering workflow queue workers...')
    await pgBossQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )

    await schedulerService.start()

    const triggerService = new InMemoryTriggerService(singletonServices.logger)
    triggerService.setPikkuFunctionRunner(runFunction)
    await triggerService.start()

    singletonServices.logger.info('Trigger service started')
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
