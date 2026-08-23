import type { AgentStreamEvent } from '@pikku/core/agent'
import { pikkuAgentMiddleware, pikkuChannelMiddleware } from '#pikku/middleware'

// @snippet start channelMiddleware
export const traceAgentStream = pikkuChannelMiddleware<any, AgentStreamEvent>(
  async ({ logger }, event, next) => {
    logger.debug({ event: 'agent_stream', type: event.type })
    await next(event)
  }
)
// @snippet end channelMiddleware

// @snippet start agentMiddleware
export const countAgentCharacters = pikkuAgentMiddleware<{
  charCount: number
}>({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info({ event: 'agent_input', messages: messages.length })
    return { messages, instructions }
  },
  modifyOutputStream: async (_services, { event, state }) => {
    if (event.type === 'text-delta') {
      state.charCount = (state.charCount ?? 0) + event.text.length
    }
    return event
  },
})
// @snippet end agentMiddleware
