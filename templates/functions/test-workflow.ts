import { createConfig, createSingletonServices } from './src/services.js'
import './.pikku/pikku-bootstrap.gen.js'
import { rpcService } from '@pikku/core/rpc'
import type { TypedPikkuRPC } from './.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js'
import { FileWorkflowStateService } from '@pikku/core/workflow'
import { BullQueueService } from '@pikku/queue-bullmq'

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

    const servicesWithRPC = {
      ...singletonServices,
      rpc: rpcService as typeof singletonServices & { rpc: TypedPikkuRPC },
    }

    console.log('🚀 Starting workflow: onboarding')
    const { runId } = await servicesWithRPC.rpc.startWorkflow('onboarding', {
      email: 'test@example.com',
      userId: 'user-123',
    })

    console.log(`✅ Workflow started with runId: ${runId}`)
    console.log('⏳ Polling for completion...')

    let run = await singletonServices.workflowState!.getRun(runId)
    while (run && run.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      run = await singletonServices.workflowState!.getRun(runId)
      console.log(`   Status: ${run?.status}`)
    }

    console.log(`\n🎉 Workflow completed with status: ${run?.status}`)
    if (run?.result) {
      console.log('Result:', JSON.stringify(run.result, null, 2))
    }
    if (run?.error) {
      console.error('Error:', run.error)
    }

    process.exit(0)
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

main()
