/**
 * Invalid: Using while loop (not allowed in simple workflows)
 */

import { pikkuSimpleWorkflowFunc } from '@pikku/cli'

export const invalidWhileWorkflow = pikkuSimpleWorkflowFunc<
  { maxRetries: number },
  { success: boolean }
>(async ({ workflow }, data) => {
  let retries = 0

  // This should fail - while loops not allowed
  while (retries < data.maxRetries) {
    await workflow.do(
      "Try operation",
      "tryOperation",
      { attempt: retries }
    )
    retries++
  }

  return { success: true }
})
