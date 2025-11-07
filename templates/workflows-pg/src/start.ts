import { PikkuExpressServer } from '@pikku/express'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { PgWorkflowStateService } from '@pikku/pg'
import postgres from 'postgres'
import {
  createConfig,
  createSessionServices,
  createSingletonServices,
} from '../../functions/src/services.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

// Use DATABASE_URL environment variable or provide a connection string
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    // Create pg-boss service factory
    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()

    // Create workflow state service
    const workflowState = new PgWorkflowStateService(postgres(connectionString))
    await workflowState.init()

    // Create singleton services with queue and workflowState
    const singletonServices = await createSingletonServices(config, {
      queueService: pgBossFactory.getQueueService(),
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

    const pgBossQueueWorkers = pgBossFactory.getQueueWorkers(
      singletonServices,
      createSessionServices as any
    )

    singletonServices.logger.info('Registering workflow queue workers...')
    await pgBossQueueWorkers.registerQueues()
    singletonServices.logger.info(
      'Workflow workers ready and listening for jobs'
    )
  } catch (e: any) {
    console.error(e.toString())
    process.exit(1)
  }
}

main()
