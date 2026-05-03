import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const getAgentThreads = pikkuSessionlessFunc<
  { agentName?: string; limit?: number; offset?: number },
  any[]
>({
  title: 'Get Agent Threads',
  description:
    'Returns a list of AI agent threads from the database. Accepts optional filters: agentName, limit, and offset for pagination.',
  expose: true,
  auth: false,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService) throw new MissingServiceError('agentRunService is not available')
    return await agentRunService.listThreads({
      agentName: input?.agentName,
      limit: input?.limit,
      offset: input?.offset,
    })
  },
})
