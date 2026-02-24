/**
 * BullMQ Workflow Runner
 * Executes all workflows using BullMQ queue service and Redis workflow storage
 *
 * Usage:
 *   yarn test:bullmq          - Run DSL workflows
 *   yarn test:bullmq --graph  - Run graph-based workflows (graph* prefix)
 */

import { RedisWorkflowService } from '@pikku/redis'
import { BullServiceFactory } from '@pikku/queue-bullmq'
import { pikkuState } from '@pikku/core/internal'

import { createConfig, createSingletonServices } from '../services.js'
import { workflowTestData } from './workflow-test-data.js'

import '../../.pikku/pikku-bootstrap.gen.js'

const useGraph = process.argv.includes('--graph')
const POLL_INTERVAL_MS = 100
const TIMEOUT_MS = 30_000

async function main(): Promise<void> {
  console.log(
    `=== BullMQ Workflow Runner ${useGraph ? '(Graph Mode)' : '(DSL Mode)'} ===\n`
  )

  const config = await createConfig()

  const bullFactory = new BullServiceFactory()
  await bullFactory.init()

  const workflowService = new RedisWorkflowService(undefined)
  await workflowService.init()

  const singletonServices = await createSingletonServices(config, {
    queueService: bullFactory.getQueueService(),
    schedulerService: bullFactory.getSchedulerService(),
    workflowService,
  })

  const queueWorkers = bullFactory.getQueueWorkers()
  await queueWorkers.registerQueues()

  // Get registered workflows
  const meta = pikkuState(null, 'workflows', 'meta')
  const allWorkflowNames = Object.keys(meta)

  // Filter workflows based on mode
  // In graph mode: run only graph* workflows
  // In DSL mode: run only non-graph workflows
  const workflowNames = allWorkflowNames.filter((name) =>
    useGraph ? name.startsWith('graph') : !name.startsWith('graph')
  )

  singletonServices.logger.info(
    `Found ${workflowNames.length} workflows to execute (${allWorkflowNames.length} total registered)\n`
  )

  const results: Array<{
    name: string
    status: 'success' | 'failed' | 'skipped'
    error?: string
    duration: number
  }> = []

  for (const workflowName of workflowNames) {
    // For graph workflows, look up test data using the DSL workflow name
    // e.g., graphAutoRestockWorkflow -> autoRestockWorkflow
    const testDataKey = useGraph
      ? workflowName
          .replace(/^graph/, '')
          .replace(/^[A-Z]/, (c) => c.toLowerCase())
      : workflowName
    const testData = workflowTestData[testDataKey]

    if (!testData) {
      results.push({
        name: workflowName,
        status: 'skipped',
        error: `No test data defined (looked up: ${testDataKey})`,
        duration: 0,
      })
      console.log(`SKIP: ${workflowName} (no test data for ${testDataKey})`)
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

  await queueWorkers.close()
  await workflowService.close()
  await bullFactory.close()

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
