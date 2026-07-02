import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const getAIWorkflows = pikkuFunc<
  { agentName?: string },
  Array<{ workflowName: string; graphHash: string; graph: any }>
>({
  title: 'Get AI-Generated Workflows',
  description:
    'Returns workflow definitions created by AI agents from the workflow store. Optionally filters by agent name.',
  expose: true,
  func: async ({ workflowService }, input) => {
    if (!workflowService)
      throw new MissingServiceError('workflowService is not available')
    return await workflowService.getAIGeneratedWorkflows(input?.agentName)
  },
})
