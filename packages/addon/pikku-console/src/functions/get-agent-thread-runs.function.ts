import { pikkuSessionlessFunc } from '#pikku'

export const getAgentThreadRuns = pikkuSessionlessFunc<
  { threadId: string },
  any[]
>({
  title: 'Get Agent Thread Runs',
  description:
    'Returns all runs for a given AI agent thread, ordered by creation time descending.',
  expose: true,
  auth: false,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService) return []
    return await agentRunService.getThreadRuns(input.threadId)
  },
})
