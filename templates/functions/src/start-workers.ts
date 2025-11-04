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

    const bullQueueService = new BullQueueService(undefined)
    const workflowState = new FileWorkflowStateService(
      '.workflows',
      bullQueueService
    )

    const singletonServices = await createSingletonServices(config, {
      queueService: bullQueueService,
      workflowState,
    })

    console.log('🚀 Starting workflow queue workers...')

    const bullQueueWorkers = new BullQueueWorkers(
      {},
      singletonServices,
      createSessionServices
    )

    console.log('📝 Registering workflow queue workers...')
    await bullQueueWorkers.registerQueues()
    console.log('✅ Workflow workers ready and listening for jobs')
  } catch (e: any) {
    console.error('❌ Error:', e.toString())
    process.exit(1)
  }
}

main()
