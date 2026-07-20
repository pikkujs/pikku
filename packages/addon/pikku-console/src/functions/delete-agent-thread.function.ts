import { pikkuFunc } from '#pikku'

export const deleteAgentThread = pikkuFunc<
  { threadId: string },
  { deleted: boolean }
>({
  title: 'Delete Agent Thread',
  description:
    'Deletes an AI agent thread and all its associated messages and runs via cascade.',
  expose: true,
  func: async ({ agentRunService }, input) => {
    const deleted = await agentRunService.deleteThread(input.threadId)
    return { deleted }
  },
})
