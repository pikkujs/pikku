/**
 * Example client for starting workflows via RPC
 */
import { PikkuRPCService } from '@pikku/core/rpc'
import { RedisWorkflowStateService } from '@pikku/redis'
import { BullQueueService } from '@pikku/queue-bullmq'
import {
  createConfig,
  createSingletonServices,
} from '../../functions/src/services.js'
import { TypedPikkuRPC } from '../../functions/.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js'
import '../../functions/.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    // Create queue service (required for workflows)
    const bullQueueService = new BullQueueService(undefined)

    // Create workflow state service to check status
    const workflowState = new RedisWorkflowStateService(
      undefined,
      bullQueueService
    )

    const singletonServices = await createSingletonServices(config, {
      queueService: bullQueueService,
      workflowState,
    })
    const logger = singletonServices.logger

    // Inject RPC service with singleton services
    const rpcService = new PikkuRPCService<
      typeof singletonServices,
      TypedPikkuRPC
    >()
    const servicesWithRPC = rpcService.injectRPCService(
      singletonServices,
      {},
      false
    )

    // Start the onboarding workflow via RPC
    const { runId } = await servicesWithRPC.rpc.startWorkflow('onboarding', {
      email: 'user@example.com',
      userId: 'user-123',
    })

    logger.info(`Workflow started with run ID: ${runId}`)

    // Poll for workflow completion
    let run = await workflowState.getRun(runId)
    while (run && run.status === 'running') {
      logger.info('Workflow still running...')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      run = await workflowState.getRun(runId)
    }

    if (run?.status === 'completed') {
      logger.info('Workflow completed successfully!')
      logger.info('Result:', run.output)
      process.exit(0)
    } else if (run?.status === 'failed') {
      logger.error('Workflow failed:', run.error)
      process.exit(1)
    } else {
      logger.error('Workflow not found')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('Failed to start workflow:', e.toString())
    process.exit(1)
  }
}

main()
