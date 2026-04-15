/**
 * Complex Workflow with Inline Steps
 * Verifies that pikkuWorkflowComplexFunc supports inline functions
 * while still enforcing DSL rules for control flow.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineWorkflow = pikkuWorkflowComplexFunc<
  { name: string; priority: string },
  { result: string }
>({
  title: 'Complex Inline Steps',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // RPC step
    const fetched = await workflow.do('Fetch data', 'dataFetch', {
      name: data.name,
    })

    // Inline step — should produce InlineStepMeta
    const processed = await workflow.do('Process locally', async () => {
      return { value: fetched.name + ' processed' }
    })

    // Branch with mixed RPC and inline steps
    if (data.priority === 'high') {
      await workflow.do('Priority notify', 'sendNotification', {
        message: processed.value,
      })
    } else {
      await workflow.do('Log result', async () => {
        return { logged: true }
      })
    }

    return { result: processed.value }
  },
})
