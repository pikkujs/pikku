import { authBearer } from '@pikku/core/middleware'
import type { AIStreamEvent } from '@pikku/core/ai-agent'
import {
  addHTTPMiddleware,
  pikkuChannelMiddleware,
} from '../.pikku/pikku-types.gen.js'
import { pikkuAIMiddleware } from '../.pikku/agent/pikku-agent-types.gen.js'

export const httpAuthMiddleware = () => addHTTPMiddleware('*', [authBearer({})])

export const appendModified = pikkuChannelMiddleware<any, AIStreamEvent>(
  async (_services, event, next) => {
    if (event.type === 'text-delta') {
      await next({ ...event, text: event.text + ' - modified' })
    } else {
      await next(event)
    }
  }
)

export const logAgentIO = pikkuAIMiddleware<
  AIStreamEvent,
  { charCount: number }
>({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info(`Agent input: ${messages.length} messages`)
    return { messages, instructions }
  },
  modifyOutputStream: async (_services, { event, state }) => {
    if (event.type === 'text-delta') {
      state.charCount = (state.charCount ?? 0) + event.text.length
    }
    return event
  },
})
