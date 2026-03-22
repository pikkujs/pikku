import { PikkuExpressServer } from '@pikku/express'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { PikkuKysely, PgKyselyWorkflowService } from '@pikku/kysely-postgres'
import type { KyselyPikkuDB } from '@pikku/kysely-postgres'
import { InMemoryTriggerService, ConsoleLogger } from '@pikku/core/services'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    const config = await createConfig()
    const logger = new ConsoleLogger()

    const pikkuKysely = new PikkuKysely<KyselyPikkuDB>(logger, connectionString)
    await pikkuKysely.init()

    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()

    const schedulerService = pgBossFactory.getSchedulerService()

    const workflowService = new PgKyselyWorkflowService(pikkuKysely.kysely)
    await workflowService.init()

    const singletonServices = await createSingletonServices(config, {
      logger,
      queueService: pgBossFactory.getQueueService(),
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

    const pgBossQueueWorkers = pgBossFactory.getQueueWorkers()

    singletonServices.logger.info('Registering workflow queue workers...')
    await pgBossQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )

    await schedulerService.start()

    const triggerService = new InMemoryTriggerService()
    await triggerService.start()

    singletonServices.logger.info('Trigger service started')
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
