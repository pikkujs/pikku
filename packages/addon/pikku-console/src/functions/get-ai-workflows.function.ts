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
  func: async ({ workflowService }, input) => {
    if (!workflowService) throw new Error('workflowService is not available')
    return await workflowService.getAIGeneratedWorkflows(input?.agentName)
  },
})
