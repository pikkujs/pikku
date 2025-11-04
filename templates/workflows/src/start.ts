import { BullQueueWorkers, BullQueueService } from '@pikku/queue-bullmq'
import { FileWorkflowStateService } from '@pikku/core/workflow'
import {
  createConfig,
  createSingletonServices,
  createSessionServices,
} from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    // Create queue service for workflows
    const bullQueueService = new BullQueueService(undefined)

    // Create workflow state service with queue
    const workflowState = new FileWorkflowStateService(
      '.workflows',
      bullQueueService
    )

    // Create singleton services with queue and workflowState
    const singletonServices = await createSingletonServices(config, {
      queueService: bullQueueService,
      workflowState,
    })

    singletonServices.logger.info('Starting workflow queue workers...')

    const bullQueueWorkers = new BullQueueWorkers(
      {},
      singletonServices,
      createSessionServices
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
