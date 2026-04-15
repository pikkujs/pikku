/**
 * Complex Workflow with Inline Steps in Switch
 * Verifies that inline functions work inside switch/case control flow.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineSwitchWorkflow = pikkuWorkflowComplexFunc<
  { action: string; payload: unknown },
  { status: string }
>({
  title: 'Complex Inline Switch',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Inline step for preprocessing
    const prepared = await workflow.do('Prepare', async () => {
      return { action: data.action, ready: true }
    })

    switch (data.action) {
      case 'create':
        await workflow.do('Create record', 'recordCreate', {
          payload: data.payload,
        })
        break
      case 'transform':
        // Inline step in a switch case
        await workflow.do('Transform locally', async () => {
          return { transformed: true }
        })
        break
      default:
        await workflow.do('Default handler', 'defaultHandler', {
          action: data.action,
        })
    }

    // RPC step after switch
    await workflow.do('Finalize', 'finalize', { action: data.action })

    return { status: 'done' }
  },
})
