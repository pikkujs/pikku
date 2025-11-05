import { PgBossQueueService, PgBossQueueWorkers } from '@pikku/queue-pg-boss'
import { PgWorkflowStateService } from '@pikku/pg'
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
    const pgBossQueueService = new PgBossQueueService(undefined)

    // Create workflow state service with queue
    const workflowState = new PgWorkflowStateService(
      undefined,
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
