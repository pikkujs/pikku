import { pikkuSessionlessFunc } from '#pikku'
import { streamAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamChannel } from '@pikku/core/ai-agent'

export const streamAgentRun = pikkuSessionlessFunc<
  { agentName: string; message: string; threadId: string; resourceId?: string },
  any
>({
  title: 'Stream Agent Run',
  description: 'SSE stream of agent conversation responses.',
  expose: false,
  auth: false,
  func: async (services, data, { channel }) => {
    if (!channel) return
    await streamAIAgent(
      data.agentName,
      {
        message: data.message,
        threadId: data.threadId,
        resourceId: data.resourceId || 'forge-playground',
      },
      channel as unknown as AIStreamChannel,
      { singletonServices: services }
    )
  },
})
