import { wireWorkflow } from '../../.pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '../../.pikku/pikku-types.gen.js'
import { createAndNotifyWorkflow } from '../functions/workflow.functions.js'
import type { Priority } from '../schemas.js'

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
