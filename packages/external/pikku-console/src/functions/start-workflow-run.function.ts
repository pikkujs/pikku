import { pikkuSessionlessFunc } from '#pikku'

export const startWorkflowRun = pikkuSessionlessFunc<
  { workflowName: string; input?: any },
  { runId: string }
>({
  title: 'Start Workflow Run',
  description: 'Starts a new workflow run by name with optional input.',
  expose: true,
  auth: false,
  func: async (_services, { workflowName, input }, { rpc }) => {
    return await (rpc as any).startWorkflow(workflowName, input || {}, {
      wire: { type: 'rpc' },
    })
  },
})
