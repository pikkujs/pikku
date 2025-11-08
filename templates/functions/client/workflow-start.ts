/**
 * Example client for starting workflows via HTTP
 */
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { PgWorkflowStateService } from '@pikku/pg'
import postgres from 'postgres'
import { pikkuFetch } from '../.pikku/pikku-fetch.gen.js'

// Configure server URL from environment or use default
const url = process.env.HELLO_WORLD_URL_PREFIX || 'http://localhost:4002'
pikkuFetch.setServerUrl(url)

// Use DATABASE_URL environment variable or provide a connection string
const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

async function main(): Promise<void> {
  try {
    // Create pg-boss service factory
    const pgBossFactory = new PgBossServiceFactory(connectionString)
    await pgBossFactory.init()

    // Create workflow state service to check status
    const workflowState = new PgWorkflowStateService(postgres(connectionString))

    // Start the onboarding workflow via HTTP
    const { runId } = await pikkuFetch.post('/workflow/start', {
      email: 'user@example.com',
      userId: 'user-123',
    })

    console.log(`Workflow started with run ID: ${runId}`)

    // Poll for workflow completion
    let run = await workflowState.getRun(runId)
    while (run && run.status === 'running') {
      const steps = await workflowState.getRunSteps(runId)
      const lastStep = steps[steps.length - 1]
      if (lastStep) {
        console.log(
          `Workflow still running... Last step: ${lastStep.stepName} (${lastStep.status})`
        )
      } else {
        console.log('Workflow still running...')
      }
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
