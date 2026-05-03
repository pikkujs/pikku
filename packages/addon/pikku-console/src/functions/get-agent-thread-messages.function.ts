import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const getAgentThreadMessages = pikkuSessionlessFunc<
  { threadId: string },
  any[]
>({
  description:
    'Returns all messages for a given AI agent thread, ordered by creation time.',
  expose: true,
  auth: false,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService)
      throw new MissingServiceError('agentRunService is not available')
    return await agentRunService.getThreadMessages(input.threadId)
  },
})
