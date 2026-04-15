/**
 * Complex Workflow with Inline Steps in Parallel
 * Verifies that inline functions work inside Promise.all patterns.
 */

import { pikkuWorkflowComplexFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

export const complexInlineParallelWorkflow = pikkuWorkflowComplexFunc<
  { items: string[] },
  { results: unknown[] }
>({
  title: 'Complex Inline Parallel',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Parallel RPC steps
    const fetched = await Promise.all(
      data.items.map(async (item) =>
        workflow.do(`Fetch ${item}`, 'dataFetch', { name: item })
      )
    )

    // Inline step after parallel
    const combined = await workflow.do('Combine results', async () => {
      return { all: fetched.map((f) => f.name) }
    })

    return { results: combined.all }
  },
})
