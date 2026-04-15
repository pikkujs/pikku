/**
 * Complex Workflow with Inline Steps in Switch
 * Verifies that inline functions work inside switch/case control flow.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineSwitchWorkflow = pikkuWorkflowComplexFunc<
  { action: string; email: string },
  { status: string }
>({
  title: 'Complex Inline Switch',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Inline step for preprocessing
    await workflow.do('Prepare', async () => {
      return { action: data.action, ready: true }
    })

    switch (data.action) {
      case 'create':
        await workflow.do('Create user', 'userCreate', {
          email: data.email,
          name: data.action,
        })
        break
      case 'transform':
        // Inline step in a switch case
        await workflow.do('Transform locally', async () => {
          return { transformed: true }
        })
        break
      default:
        await workflow.do('Send fallback email', 'emailSend', {
          to: data.email,
          subject: 'Fallback',
          body: 'Unknown action',
        })
    }

    // Inline step after switch
    await workflow.do('Finalize', async () => {
      return { done: true }
    })

    return { status: 'done' }
  },
})
