import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const getAgentThreads = pikkuFunc<
  { agentName?: string; resourceId?: string; limit?: number; offset?: number },
  any[]
>({
  title: 'Get Agent Threads',
  description:
    'Returns a list of AI agent threads from the database. Accepts optional filters: agentName, resourceId, limit, and offset for pagination.',
  expose: true,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService)
      throw new MissingServiceError('agentRunService is not available')
    return await agentRunService.listThreads({
      agentName: input?.agentName,
      resourceId: input?.resourceId,
      limit: input?.limit,
      offset: input?.offset,
    })
  },
})
