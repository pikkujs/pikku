import { pikkuSessionlessFunc } from '#pikku'

export const getAIWorkflows = pikkuSessionlessFunc<
  { agentName?: string },
  Array<{ workflowName: string; graphHash: string; graph: any }>
>({
  title: 'Get AI-Generated Workflows',
  description:
    'Returns workflow definitions created by AI agents from the workflow store. Optionally filters by agent name.',
  expose: true,
  auth: false,
  func: async ({ workflowRunService }, input) => {
    if (!workflowRunService) throw new Error('workflowRunService is not available')
    return await workflowRunService.getAIGeneratedWorkflows(input?.agentName)
  },
})
