/**
 * Example client for starting workflows via HTTP
 */
import { PgBossQueueService } from '@pikku/queue-pg-boss'
import { PgWorkflowStateService } from '@pikku/pg'
import '../../functions/.pikku/pikku-bootstrap.gen.js'
import postgres from 'postgres'
import { pikkuFetch } from './pikku-fetch.gen.js'

// Use DATABASE_URL environment variable or provide a connection string
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    // Create queue service (required for workflows)
    const pgBossQueueService = new PgBossQueueService(connectionString)
    // Create workflow state service to check status
    const workflowState = new PgWorkflowStateService(
      postgres(connectionString),
      pgBossQueueService
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
