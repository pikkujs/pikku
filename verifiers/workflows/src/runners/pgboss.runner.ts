/**
 * PG-Boss Workflow Runner
 * Executes all workflows using PG-Boss queue service and PostgreSQL workflow storage
 */

import { PgWorkflowService } from '@pikku/pg'
import { PgBossServiceFactory } from '@pikku/queue-pg-boss'
import { pikkuState } from '@pikku/core/internal'
import postgres from 'postgres'

import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../services.js'
import { workflowTestData } from './workflow-test-data.js'

import '../../.pikku/pikku-bootstrap.gen.js'

const connectionString =
  process.env.DATABASE_URL ||
  'postgres://postgres:password@localhost:5432/pikku_queue'

const POLL_INTERVAL_MS = 100
const TIMEOUT_MS = 30_000

async function main(): Promise<void> {
  console.log('=== PG-Boss Workflow Runner ===\n')

  const config = await createConfig()

  const pgBossFactory = new PgBossServiceFactory(connectionString)
  await pgBossFactory.init()

  const workflowService = new PgWorkflowService(postgres(connectionString))
  await workflowService.init()

  const singletonServices = await createSingletonServices(config, {
    queueService: pgBossFactory.getQueueService(),
    schedulerService: pgBossFactory.getSchedulerService(),
    workflowService,
  })

  workflowService.setServices(
    singletonServices,
    createWireServices as any,
    config
  )

  const queueWorkers = pgBossFactory.getQueueWorkers(
    singletonServices,
    createWireServices as any
  )
  await queueWorkers.registerQueues()

  // Get registered workflows
  const meta = pikkuState(null, 'workflows', 'meta')
  const workflowNames = Object.keys(meta)

  console.log(`Found ${workflowNames.length} workflows to execute\n`)

  const results: Array<{
    name: string
    status: 'success' | 'failed' | 'skipped'
    error?: string
    duration: number
  }> = []

  for (const workflowName of workflowNames) {
    const testData = workflowTestData[workflowName]

    if (!testData) {
      results.push({
        name: workflowName,
        status: 'skipped',
        error: 'No test data defined',
        duration: 0,
      })
      console.log(`SKIP: ${workflowName} (no test data)`)
      continue
    }

    const startTime = Date.now()

    try {
      const { runId } = await workflowService.startWorkflow(
        workflowName,
        testData,
        { type: 'test' },
        null
      )

      let run = await workflowService.getRun(runId)
      const deadline = Date.now() + TIMEOUT_MS
      while (
        run &&
        run.status !== 'completed' &&
        run.status !== 'failed' &&
        run.status !== 'cancelled'
      ) {
        if (Date.now() > deadline) {
          throw new Error(
            `Timed out after ${TIMEOUT_MS}ms (status: ${run.status})`
          )
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
        run = await workflowService.getRun(runId)
      }

      const duration = Date.now() - startTime

      if (run?.status === 'completed' || run?.status === 'cancelled') {
        results.push({
          name: workflowName,
          status: 'success',
          duration,
        })
        console.log(
          `PASS: ${workflowName}${run.status === 'cancelled' ? ' [cancelled]' : ''} (${duration}ms)`
        )
      } else {
        results.push({
          name: workflowName,
          status: 'failed',
          error: `Unexpected status: ${run?.status}`,
          duration,
        })
        console.log(
          `FAIL: ${workflowName} - status: ${run?.status} (${duration}ms)`
        )
      }
    } catch (error: any) {
      const duration = Date.now() - startTime
      results.push({
        name: workflowName,
        status: 'failed',
        error: error.message,
        duration,
      })
      console.log(`FAIL: ${workflowName} - ${error.message} (${duration}ms)`)
    }
  }

  // Print summary
  console.log('\n=== Summary ===')
  const passed = results.filter((r) => r.status === 'success').length
  const failed = results.filter((r) => r.status === 'failed').length
  const skipped = results.filter((r) => r.status === 'skipped').length

  console.log(`Passed:  ${passed}`)
  console.log(`Failed:  ${failed}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Total:   ${results.length}`)

  if (failed > 0) {
    console.log('\n=== Failed Workflows ===')
    for (const result of results.filter((r) => r.status === 'failed')) {
      console.log(`  ${result.name}: ${result.error}`)
    }
  }

  if (skipped > 0) {
    console.log('\n=== Skipped Workflows ===')
    for (const result of results.filter((r) => r.status === 'skipped')) {
      console.log(`  ${result.name}: ${result.error}`)
    }
  }

  await workflowService.close()
  await pgBossFactory.close()

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
