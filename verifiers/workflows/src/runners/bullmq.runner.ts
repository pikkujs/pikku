/**
 * BullMQ Workflow Runner
 * Executes all workflows using BullMQ queue service and Redis workflow storage
 * Uses inline execution mode for testing without requiring queue workers
 */

import { RedisWorkflowService } from '@pikku/redis'
import { BullServiceFactory } from '@pikku/queue-bullmq'
import { pikkuState, rpcService } from '@pikku/core'

import {
  createConfig,
  createSingletonServices,
  createWireServices,
} from '../services.js'
import { workflowTestData } from './workflow-test-data.js'

// Import bootstrap to register all workflows
import '../../.pikku/pikku-bootstrap.gen.js'

async function main(): Promise<void> {
  console.log('=== BullMQ Workflow Runner ===\n')

  const config = await createConfig()

  // Create BullMQ service factory
  const bullFactory = new BullServiceFactory()
  await bullFactory.init()

  // Create workflow state service (Redis)
  const workflowService = new RedisWorkflowService(undefined)
  await workflowService.init()

  // Create singleton services with queue and workflow service
  const singletonServices = await createSingletonServices(config, {
    queueService: bullFactory.getQueueService(),
    schedulerService: bullFactory.getSchedulerService(),
    workflowService,
  })

  workflowService.setServices(
    singletonServices,
    createWireServices as any,
    config
  )

  // Create RPC service for inline execution
  const rpc = rpcService.getContextRPCService(singletonServices, {})

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
      // Start workflow with inline execution (no queue workers needed)
      const { runId } = await workflowService.startWorkflow(
        workflowName,
        testData,
        rpc,
        { inline: true }
      )

      // Get final run state
      const run = await workflowService.getRun(runId)
      const duration = Date.now() - startTime

      if (run?.status === 'completed') {
        results.push({
          name: workflowName,
          status: 'success',
          duration,
        })
        console.log(`PASS: ${workflowName} (${duration}ms)`)
      } else if (run?.status === 'cancelled') {
        // Cancelled workflows are expected in some test cases
        results.push({
          name: workflowName,
          status: 'success',
          duration,
        })
        console.log(`PASS: ${workflowName} [cancelled] (${duration}ms)`)
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

  // Cleanup
  await workflowService.close()
  await bullFactory.close()

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('Runner failed:', error)
  process.exit(1)
})
