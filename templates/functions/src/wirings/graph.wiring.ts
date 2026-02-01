import {
  wireWorkflowGraph,
  pikkuWorkflowGraph,
} from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { wireHTTP } from '../../.pikku/pikku-types.gen.js'

export const todoReviewWorkflow = pikkuWorkflowGraph({
  description: 'Review overdue todos and send summary notification',
  tags: ['review', 'overdue', 'notification'],
  nodes: {
    fetchOverdue: 'fetchOverdueTodos',
    sendSummary: 'sendOverdueSummary',
  },
  wires: {
    http: [
      {
        route: '/workflow/review',
        method: 'post',
        startNode: 'fetchOverdue',
      },
    ],
    trigger: [
      {
        name: 'test-event',
        startNode: 'fetchOverdue',
      },
    ],
    schedule: [
      {
        cron: '0 9 * * 1',
        startNode: 'fetchOverdue',
      },
    ],
    queue: [
      {
        name: 'todo-review-queue',
        startNode: 'fetchOverdue',
      },
    ],
    cli: [
      {
        command: 'review-todos',
        startNode: 'fetchOverdue',
      },
    ],
    mcp: {
      tool: [
        {
          name: 'reviewOverdueTodos',
          startNode: 'fetchOverdue',
        },
      ],
    },
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

wireWorkflowGraph({
  graph: todoReviewWorkflow,
})

wireHTTP({
  method: 'post',
  route: '/workflow/review',
  workflow: true,
})
