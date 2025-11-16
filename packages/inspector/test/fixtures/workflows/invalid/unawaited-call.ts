/**
 * Invalid: Not awaiting workflow.do (not allowed in simple workflows)
 */

import { pikkuSimpleWorkflowFunc } from '@pikku/cli'

export const invalidUnawaitedWorkflow = pikkuSimpleWorkflowFunc<
  { email: string },
  { result: string }
>(async ({ workflow }, data) => {
  // This should fail - workflow.do must be awaited
  workflow.do('Send email', 'sendEmail', { to: data.email })

  const result = await workflow.do('Get result', 'getResult', {})

  return { result }
})
