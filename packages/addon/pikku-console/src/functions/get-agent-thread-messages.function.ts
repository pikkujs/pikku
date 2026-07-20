import { pikkuFunc } from '#pikku'

export const getAgentThreadMessages = pikkuFunc<{ threadId: string }, any[]>({
  title: 'Get Agent Thread Messages',
  description:
    'Returns all messages for a given AI agent thread, ordered by creation time.',
  expose: true,
  func: async ({ agentRunService }, input) => {
    return await agentRunService.getThreadMessages(input.threadId)
  },
})
