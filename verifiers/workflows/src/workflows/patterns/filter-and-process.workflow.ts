/**
 * Filter and Predicates Workflow
 * Demonstrates filter, some, every, and other array predicates
 */

import { pikkuWorkflowFunc } from '../../../.pikku/workflow/pikku-workflow-types.gen.js'

/**
 * Filter and process workflow
 */
export const filterAndProcessWorkflow = pikkuWorkflowFunc<
  { items: Array<{ id: string; status: string; priority: number }> },
  { processedCount: number; skippedCount: number }
>({
  title: 'Filter And Process',
  tags: ['patterns'],
  func: async (_services, data, { workflow }) => {
    // Filter to get only active items
    const activeItems = data.items.filter((item) => item.status === 'active')

    // Filter further for high priority
    const highPriorityItems = activeItems.filter((item) => item.priority > 5)

    // Process high priority items
    for (const item of highPriorityItems) {
      await workflow.do(`Process high priority item ${item.id}`, 'taskCreate', {
        title: `Process ${item.id}`,
        description: `Priority: ${item.priority}`,
      })
    }

    return {
      processedCount: highPriorityItems.length,
      skippedCount: data.items.length - highPriorityItems.length,
    }
  },
})
