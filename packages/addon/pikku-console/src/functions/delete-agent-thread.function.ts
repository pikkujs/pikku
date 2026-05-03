import { MissingServiceError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'

export const deleteAgentThread = pikkuSessionlessFunc<
  { threadId: string },
  { deleted: boolean }
>({
  title: 'Delete Agent Thread',
  description:
    'Deletes an AI agent thread and all its associated messages and runs via cascade.',
  expose: true,
  auth: false,
  func: async ({ agentRunService }, input) => {
    if (!agentRunService) throw new MissingServiceError('agentRunService is not available')
    const deleted = await agentRunService.deleteThread(input.threadId)
    return { deleted }
  },
})
