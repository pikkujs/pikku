import { pikkuWorkflowFunc } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * RPC function that ALWAYS fails
 * This tests the UNHAPPY PATH - retries exhausted, workflow fails
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
 * Workflow that tests UNHAPPY PATH retry logic
 * - Step fails on attempt 1
 * - Step fails on attempt 2 (retry #1)
 * - Step fails on attempt 3 (retry #2)
 * - Retries exhausted → workflow fails
 */
export const unhappyRetryWorkflow = pikkuWorkflowFunc<
  { value: number },
  { result: number }
>(async ({ workflow }, data) => {
  // This will fail after exhausting all retries
  const result = await workflow.do(
    'Step that always fails',
    'alwaysFailsRPC',
    data,
    {
      retries: 2, // Allow 2 retries (3 total attempts), then fail
      retryDelay: '500ms',
    }
  )

  // This code should never be reached
  return { result: result.result }
})

// RPC function to trigger the unhappy retry workflow
export const unhappyRetry = pikkuSessionlessFunc<
  { value: number },
  { runId: string }
>({
  func: async ({ rpc }, data) => {
    return await rpc.startWorkflow('unhappyRetry', data)
  },
})
