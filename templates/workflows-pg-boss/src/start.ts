import { PikkuExpressServer } from '@pikku/express'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import {
  PgWorkflowService,
  PgTriggerService,
  PgDeploymentService,
} from '@pikku/pg'
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

    const workflowService = new PgWorkflowService(sql)
    await workflowService.init()

    const singletonServices = await createSingletonServices(config, {
      queueService: pgBossFactory.getQueueService(),
      schedulerService: pgBossFactory.getSchedulerService(),
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

    const pgBossQueueWorkers = pgBossFactory.getQueueWorkers(
      singletonServices,
      createWireServices
    )

    singletonServices.logger.info('Registering workflow queue workers...')
    await pgBossQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )

    const deploymentService = new PgDeploymentService(sql, 'pikku')
    await deploymentService.init()
    await deploymentService.start()

    const triggerService = new PgTriggerService(
      singletonServices,
      deploymentService,
      sql,
      'pikku'
    )
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
