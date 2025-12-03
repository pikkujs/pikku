import {
  pikkuWorkflowFunc,
  WorkflowCancelledException,
} from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'

/**
 * RPC function that ALWAYS fails
 * This tests the UNHAPPY PATH - retries exhausted, workflow fails
 */
export const alwaysFailsRPC = pikkuSessionlessFunc<
  { value: number },
  { result: number }
>({
  func: async ({ logger }, data, { workflowStep }) => {
    const attempt = workflowStep?.attemptCount ?? 0

    logger.error(`🔄 [UNHAPPY] alwaysFailsRPC - Attempt #${attempt}`)
    logger.error(`   runId: ${workflowStep?.runId ?? 'N/A'}`)
    logger.error(`   stepId: ${workflowStep?.stepId ?? 'N/A'}`)
    logger.error(`❌ [UNHAPPY] Attempt #${attempt} - ALWAYS FAILS`)

    throw new Error(
      `[UNHAPPY] Attempt ${attempt} failed - will exhaust retries`
    )
  },
})

/**
 * UNHAPPY PATH: Workflow that exhausts retries and fails
 */
export const unhappyRetryWorkflow = pikkuWorkflowFunc<
  { value: number },
  { result: number }
>({
  func: async ({}, data, { workflow }) => {
    // If value is negative, cancel the workflow immediately
    if (data.value < 0) {
      throw new WorkflowCancelledException(
        `Workflow cancelled: value ${data.value} is negative`
      )
    }

    // This will fail after exhausting all retries
    const result = await workflow.do(
      'Step that always fails',
      'alwaysFailsRPC',
      data,
      {
        retries: 2, // Allow 2 retries (3 total attempts), then fail
        retryDelay: '1s',
      }
    )

    // This code should never be reached
    return { result: result.result }
  },
  tags: ['test', 'retry', 'unhappy'],
})

// RPC function to trigger the unhappy retry workflow and wait for completion
export const unhappyRetry = pikkuSessionlessFunc<
  { value: number },
  {
    error: string
    attempts: number
    steps: Array<{
      stepName: string
      status: string
      attemptCount: number
      error?: { message: string }
    }>
  }
>({
  func: async ({ workflowService, logger }, data, { rpc }) => {
    // Start the workflow
    const { runId } = await rpc.startWorkflow('unhappyRetryWorkflow', data)

    logger.info(`[TEST] Workflow started: ${runId}`)

    // Poll for completion (with timeout)
    const maxWaitMs = 30000 // 30 seconds
    const pollIntervalMs = 2000 // 2 seconds
    const startTime = Date.now()

    while (Date.now() - startTime < maxWaitMs) {
      const run = await workflowService!.getRun(runId)

      if (!run) {
        logger.error(`[TEST] Workflow run not found: ${runId}`)
        throw new Error(`Workflow run not found: ${runId}`)
      }

      logger.info(`[TEST] Workflow status: ${run.status}`)

      if (run.status === 'completed') {
        logger.info(`[TEST] Workflow completed unexpectedly`)
        throw new Error(
          'Expected workflow to fail, but it completed successfully'
        )
      }

      if (run.status === 'failed') {
        logger.info(`[TEST] Workflow failed as expected: ${run.error?.message}`)
        // Get all steps to return for validation
        const steps = await workflowService!.getRunHistory(runId)
        return {
          error: run.error?.message || 'Unknown error',
          attempts: 3, // All 3 attempts exhausted
          steps: steps.map((s: any) => ({
            stepName: s.stepName,
            status: s.status,
            attemptCount: s.attemptCount,
            error: s.error ? { message: s.error.message } : undefined,
          })),
        }
      }

      if (run.status === 'cancelled') {
        logger.info(`[TEST] Workflow was cancelled`)
        // Get all steps to return for validation
        const steps = await workflowService!.getRunHistory(runId)
        return {
          error: run.error?.message || 'Workflow cancelled',
          attempts: 0,
          steps: steps.map((s: any) => ({
            stepName: s.stepName,
            status: s.status,
            attemptCount: s.attemptCount,
            error: s.error ? { message: s.error.message } : undefined,
          })),
        }
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    throw new Error(`Workflow timed out after ${maxWaitMs}ms`)
  },
})
