import {
  wireWorkflow,
  pikkuWorkflowGraph,
} from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { createAndNotifyWorkflow } from '../functions/workflow.functions.js'
import type { Priority } from '../schemas.js'

/**
 * RPC to start the createAndNotifyWorkflow.
 * This exposes workflow starting via RPC for clients.
 */
export const startCreateAndNotifyWorkflow = pikkuSessionlessFunc<
  { userId: string; title: string; priority: Priority; dueDate?: string },
  { runId: string }
>({
  expose: true,
  auth: false,
  func: async (_services, data, { rpc }) => {
    return rpc.startWorkflow('createAndNotifyWorkflow', data)
  },
})

wireWorkflow({
  wires: {
    http: { route: '/workflow/create-todo', method: 'post' },
  },
  func: createAndNotifyWorkflow,
})

/**
 * Graph Workflow: Review overdue todos and send summary.
 * Graph workflows are defined in wiring files for proper type inference.
 */
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
  },
  config: {
    fetchOverdue: {
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

wireWorkflow({
  graph: todoReviewWorkflow,
})
