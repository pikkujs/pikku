import { pikkuFunc } from '#pikku/addon/function'
import { isThreadOwner } from './is-thread-owner.permission.js'

export const deleteAgentThread = pikkuFunc<
  { threadId: string },
  { deleted: boolean }
>({
  title: 'Delete Agent Thread',
  description:
    'Deletes an AI agent thread and all its associated messages and runs via cascade. A caller without the admin scope may only delete a thread its own session owns.',
  expose: true,
  scopes: ['pikku:console:agents:manage'],
  permissions: { owner: isThreadOwner },
  func: async ({ agentRunService }, input) => {
    const deleted = await agentRunService.deleteThread(input.threadId)
    return { deleted }
  },
})
