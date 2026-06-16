import type { AIStreamEvent } from '@pikku/core/ai-agent'
import { pikkuChannelMiddleware } from '../.pikku/pikku-types.gen.js'
import { pikkuAIMiddleware } from '../.pikku/agent/pikku-agent-types.gen.js'

// The better-auth session-bridge middleware is generated into auth.gen.ts by the
// pikku CLI (from the `pikkuBetterAuth` export in src/auth.ts) — no manual wiring here.

export const appendModified = pikkuChannelMiddleware<any, AIStreamEvent>(
  async (_services, event, next) => {
    if (event.type === 'text-delta') {
      await next({ ...event, text: event.text + ' - modified' })
    } else {
      await next(event)
    }
  }
)

export const logAgentIO = pikkuAIMiddleware<{ charCount: number }>({
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
