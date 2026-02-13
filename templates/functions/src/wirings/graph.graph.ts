import { pikkuWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'

export const todoReviewWorkflow = pikkuWorkflowGraph({
  description: 'Review overdue todos and send summary notification',
  tags: ['review', 'overdue', 'notification'],
  nodes: {
    fetchOverdue: 'fetchOverdueTodos',
    sendSummary: 'sendOverdueSummary',
  },
  config: {
    fetchOverdue: {
      input: () => ({ userId: 'user1' }),
      next: 'sendSummary',
    },
    sendSummary: {
      input: (ref) => ({
        userId: ref('fetchOverdue', 'userId'),
        overdueCount: ref('fetchOverdue', 'count'),
        todos: ref('fetchOverdue', 'todos'),
      }),
    },
  },
})
