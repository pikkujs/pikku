import { pikkuWorkflowFunc } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * Always-failing RPC for unhappy path testing
 *
 * @summary RPC function that always fails to test retry exhaustion
 * @description This function tests the unhappy path of workflow retry logic. It intentionally
 * fails on every attempt, regardless of retry count. Used to verify that workflows correctly
 * handle retry exhaustion and transition to failed status when all retry attempts are depleted.
 * Logs attempt count and step metadata for debugging.
 */
export const alwaysFailsRPC = pikkuSessionlessFunc<
  { value: number },
  { result: number }
>({
  func: async ({ logger, workflowStep }, data) => {
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
 * Unhappy path retry workflow
 *
 * @summary Workflow that tests retry exhaustion and failure behavior
 * @description This workflow demonstrates the unhappy path for retry logic in Pikku workflows.
 * It invokes an RPC that always fails, exhausting all retry attempts (3 total: initial + 2 retries).
 * Also demonstrates workflow cancellation when input value is negative. Tests that workflows
 * correctly fail after retries are exhausted and that cancellation works as expected.
 */
export const unhappyRetryWorkflow = pikkuWorkflowFunc<
  { value: number },
  { result: number }
>(async ({ workflow }, data) => {
  // If value is negative, cancel the workflow immediately
  if (data.value < 0) {
    await workflow.cancel(`Workflow cancelled: value ${data.value} is negative`)
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
})

/**
 * Trigger unhappy retry workflow
 *
 * @summary HTTP endpoint that starts the unhappy retry workflow and polls for failure
 * @description This function triggers the unhappy path retry workflow and polls the workflow
 * service until it fails or is cancelled. Returns error details, attempt counts, and all step
 * information. Demonstrates the pattern for testing workflow failure scenarios end-to-end,
 * including proper error handling and result reporting for failed workflows.
 */
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
  func: async ({ rpc, workflowService, logger }, data) => {
    // Start the workflow
    const { runId } = await rpc.startWorkflow('unhappyRetry', data)

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
