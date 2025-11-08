import { pikkuWorkflowFunc } from '../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

/**
 * RPC function that fails on first attempt, succeeds on retry
 * This tests the HAPPY PATH - retries work and workflow succeeds
 */
export const flakyHappyRPC = pikkuSessionlessFunc<
  { value: number },
  { result: number; attempt: number }
>({
  func: async ({ logger, workflowStep }, data) => {
    const attempt = workflowStep?.attemptCount ?? 0

    logger.info(`🔄 [HAPPY] flakyHappyRPC - Attempt #${attempt}`)
    logger.info(`   runId: ${workflowStep?.runId ?? 'N/A'}`)
    logger.info(`   stepId: ${workflowStep?.stepId ?? 'N/A'}`)

    // Fail ONLY on first attempt
    if (attempt === 1) {
      logger.error(`❌ [HAPPY] Attempt #1 - FAILING (will retry)`)
      throw new Error('[HAPPY] First attempt fails - will retry and succeed')
    }

    logger.info(`✅ [HAPPY] Attempt #${attempt} - SUCCESS!`)
    return {
      result: data.value * 2,
      attempt,
    }
  },
})

/**
 * Workflow that tests HAPPY PATH retry logic
 * - Step fails on first attempt (attemptCount=1)
 * - Step succeeds on second attempt (attemptCount=2)
 * - Workflow completes successfully
 */
export const happyRetryWorkflow = pikkuWorkflowFunc<
  { value: number },
  { result: number; finalAttempt: number; message: string }
>(async ({ workflow }, data) => {
  const result = await workflow.do(
    'Step that fails once then succeeds',
    'flakyHappyRPC',
    data,
    {
      retries: 2, // Allow up to 2 retries (3 total attempts)
      retryDelay: '1s',
    }
  )

  return {
    result: result.result,
    finalAttempt: result.attempt,
    message: `Workflow succeeded after ${result.attempt} attempts`,
  }
})

// RPC function to trigger the happy retry workflow
export const happyRetry = pikkuSessionlessFunc<
  { value: number },
  { runId: string }
>({
  func: async ({ rpc }, data) => {
    return await rpc.startWorkflow('happyRetry', data)
  },
})
