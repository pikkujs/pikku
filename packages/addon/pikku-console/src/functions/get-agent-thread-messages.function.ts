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
    if (!agentRunService) throw new Error('agentRunService is not available')
    return await agentRunService.getThreadMessages(input.threadId)
  },
})
