import { PgBossQueueService, PgBossQueueWorkers } from '@pikku/queue-pg-boss'
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

    // Create queue service for workflows
    const pgBossQueueService = new PgBossQueueService(connectionString)
    // Create workflow state service with queue
    const workflowState = new PgWorkflowStateService(
      postgres(connectionString),
      pgBossQueueService
    )

    // Create singleton services with queue and workflowState
    const singletonServices = await createSingletonServices(config, {
      queueService: pgBossQueueService,
      workflowState,
    })

    workflowState.setServices(singletonServices, createSessionServices as any)

    singletonServices.logger.info('Starting workflow queue workers...')

    const pgBossQueueWorkers = new PgBossQueueWorkers(
      {},
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
