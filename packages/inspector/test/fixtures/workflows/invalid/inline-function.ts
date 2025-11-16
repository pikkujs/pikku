/**
 * Invalid: Using inline function in workflow.do (not allowed in simple workflows)
 */

import { pikkuSimpleWorkflowFunc } from '@pikku/cli'

export const invalidInlineWorkflow = pikkuSimpleWorkflowFunc<
  { email: string },
  { result: string }
>(async ({ workflow }, data) => {
  // This should fail - inline functions not allowed
  const result = await workflow.do(
    "Process data",
    () => {
      return data.email.toUpperCase()
    }
  )

  return { result }
})
