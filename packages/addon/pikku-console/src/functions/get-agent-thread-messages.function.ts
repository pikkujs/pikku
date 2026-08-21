import { pikkuFunc } from '#pikku/addon/function'
import { isThreadOwner } from './is-thread-owner.permission.js'

export const getAgentThreadMessages = pikkuFunc<{ threadId: string }, any[]>({
  title: 'Get Agent Thread Messages',
  description:
    'Returns all messages for a given AI agent thread, ordered by creation time. A caller without the admin scope may only read a thread its own session owns.',
  expose: true,
  scopes: ['pikku:console:agents:read'],
  permissions: { owner: isThreadOwner },
  func: async ({ agentRunService }, input) => {
    return await agentRunService.getThreadMessages(input.threadId)
  },
})
