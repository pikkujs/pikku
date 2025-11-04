/**
 * Example client for starting workflows via RPC
 */
import { createConfig, createSingletonServices } from '../src/services.js'
import '../.pikku/pikku-bootstrap.gen.js'
import { rpcService } from '@pikku/core/rpc'
import type { TypedPikkuRPC } from '../.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js'
import { FileWorkflowStateService } from '@pikku/core/workflow'
import { BullQueueService } from '@pikku/queue-bullmq'

async function main(): Promise<void> {
  try {
    const config = await createConfig()

    // Create queue service (required for workflows)
    const bullQueueService = new BullQueueService(undefined)

    // Create workflow state service to check status
    const workflowState = new FileWorkflowStateService(
      '.workflows',
      bullQueueService
    )

    const singletonServices = await createSingletonServices(config, {
      queueService: bullQueueService,
      workflowState,
    })

    // Initialize RPC service with singleton services
    const servicesWithRPC = rpcService.injectRPCService(
      singletonServices,
      { type: 'cli' } as any,
      false
    ) as typeof singletonServices & { rpc: TypedPikkuRPC }

    // Start the onboarding workflow via RPC
    const { runId } = await servicesWithRPC.rpc.startWorkflow('onboarding', {
      email: 'user@example.com',
      userId: 'user-123',
    })

    singletonServices.logger.info(`Workflow started with run ID: ${runId}`)

    // Poll for workflow completion
    let run = await singletonServices.workflowState!.getRun(runId)
    while (run && run.status === 'running') {
      singletonServices.logger.info('Workflow still running...')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      run = await singletonServices.workflowState!.getRun(runId)
    }

    if (run?.status === 'completed') {
      singletonServices.logger.info('Workflow completed successfully!')
      singletonServices.logger.info('Result:', run.output)
      process.exit(0)
    } else if (run?.status === 'failed') {
      singletonServices.logger.error('Workflow failed:', run.error)
      process.exit(1)
    } else {
      singletonServices.logger.error('Workflow not found')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('Failed to start workflow:', e.toString())
    process.exit(1)
  }
}

main()
