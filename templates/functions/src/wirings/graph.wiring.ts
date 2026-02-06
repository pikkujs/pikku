import { wireWorkflowGraph } from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { wireHTTP, graph } from '../../.pikku/pikku-types.gen.js'

export const todoReviewWorkflow = wireWorkflowGraph({
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

wireHTTP({
  auth: false,
  method: 'post',
  route: '/workflow/review',
  func: graph('todoReviewWorkflow', 'fetchOverdue'),
})
