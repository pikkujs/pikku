import { MissingServiceError } from '@pikku/core/errors'
import { pikkuFunc } from '#pikku'

export const getAgentThreadRuns = pikkuFunc<
  { threadId: string },
  any[]
>({
  title: 'Get Agent Thread Runs',
  description:
    'Returns all runs for a given AI agent thread, ordered by creation time descending.',
  expose: true,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService)
      throw new MissingServiceError('agentRunService is not available')
    return await agentRunService.getThreadRuns(input.threadId)
  },
})
