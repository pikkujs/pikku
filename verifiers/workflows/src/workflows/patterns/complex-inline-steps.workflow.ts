/**
 * Complex Workflow with Inline Steps
 * Verifies that pikkuWorkflowComplexFunc supports inline functions
 * while still enforcing DSL rules for control flow.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineWorkflow = pikkuWorkflowComplexFunc<
  { email: string; name: string },
  { result: string }
>({
  title: 'Complex Inline Steps',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    const user = await workflow.do('Create user', 'userCreate', {
      email: data.email,
      name: data.name,
    })

    // Inline step — should produce InlineStepMeta
    const processed = await workflow.do('Process locally', async () => {
      return { greeting: 'Hello ' + user.id }
    })

    // Branch with mixed RPC and inline steps
    if (data.name === 'admin') {
      await workflow.do('Send welcome', 'emailSend', {
        to: data.email,
        subject: 'Welcome',
        body: processed.greeting,
      })
    } else {
      await workflow.do('Log result', async () => {
        return { logged: true }
      })
    }

    return { result: processed.greeting }
  },
})
