import { pikkuAIMiddleware } from '#pikku/agent/pikku-agent-types.gen.js'

export const testAIMiddleware = pikkuAIMiddleware<{ count: number }>({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info({ type: 'ai-middleware', name: 'modifyInput', phase: 'before' })
    return { messages, instructions }
  },
  modifyOutputStream: async ({ logger }, { allEvents, event, state }) => {
    logger.info({
      type: 'ai-middleware',
      name: 'modifyOutputStream',
      phase: 'before',
    })
    state.count = ((state.count as number) ?? 0) + 1
    return event
  },
  modifyOutput: async ({ logger }, { text, messages }) => {
    logger.info({
      type: 'ai-middleware',
      name: 'modifyOutput',
      phase: 'before',
    })
    return { text, messages }
  },
})

export const secondAIMiddleware = pikkuAIMiddleware({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info({
      type: 'ai-middleware',
      name: 'second-modifyInput',
      phase: 'before',
    })
    return { messages, instructions }
  },
})
