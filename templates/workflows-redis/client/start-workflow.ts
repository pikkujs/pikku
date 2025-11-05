/**
 * Example client for starting workflows via HTTP
 */
import { RedisWorkflowStateService } from '@pikku/redis'
import { BullQueueService } from '@pikku/queue-bullmq'
import '../../functions/.pikku/pikku-bootstrap.gen.js'
import { pikkuFetch } from './pikku-fetch.gen.js'

// Configure server URL from environment or use default
const url = process.env.HELLO_WORLD_URL_PREFIX || 'http://localhost:4002'
pikkuFetch.setServerUrl(url)

async function main(): Promise<void> {
  try {
    // Create queue service (required for workflows)
    const bullQueueService = new BullQueueService(undefined)

    // Create workflow state service to check status
    const workflowState = new RedisWorkflowStateService(
      undefined,
      bullQueueService
    )

    // Start the onboarding workflow via HTTP
    const { runId } = await pikkuFetch.post('/workflow/start', {
      email: 'user@example.com',
      userId: 'user-123',
    })

    console.log(`Workflow started with run ID: ${runId}`)

    // Poll for workflow completion
    let run = await workflowState.getRun(runId)
    while (run && run.status === 'running') {
      console.log('Workflow still running...')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      run = await workflowState.getRun(runId)
    }

    if (run?.status === 'completed') {
      console.log('Workflow completed successfully!')
      console.log('Result:', run.output)
      process.exit(0)
    } else if (run?.status === 'failed') {
      console.error('Workflow failed:', run.error)
      process.exit(1)
    } else {
      console.error('Workflow not found')
      process.exit(1)
    }
  } catch (e: any) {
    console.error('Failed to start workflow:', e.toString())
    process.exit(1)
  }
}

main()
