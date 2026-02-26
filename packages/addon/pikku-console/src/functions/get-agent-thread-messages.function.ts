import { pikkuSessionlessFunc } from '#pikku'

export const getAgentThreadMessages = pikkuSessionlessFunc<
  { threadId: string },
  any[]
>({
  title: 'Get Agent Thread Messages',
  description:
    'Returns all messages for a given AI agent thread, ordered by creation time.',
  expose: true,
  auth: false,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService) return []
    return await agentRunService.getThreadMessages(input.threadId)
  },
})
