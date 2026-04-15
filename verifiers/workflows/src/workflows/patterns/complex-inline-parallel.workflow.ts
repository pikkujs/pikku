/**
 * Complex Workflow with Inline Steps in Parallel
 * Verifies that inline functions work inside Promise.all patterns.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineParallelWorkflow = pikkuWorkflowComplexFunc<
  { emails: string[] },
  { count: number }
>({
  title: 'Complex Inline Parallel',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Parallel RPC steps using a real function
    const users = await Promise.all(
      data.emails.map(async (email) =>
        workflow.do(`Create ${email}`, 'userCreate', { email, name: email })
      )
    )

    // Inline step after parallel
    const combined = await workflow.do('Combine results', async () => {
      return { count: users.length }
    })

    return { count: combined.count }
  },
})
