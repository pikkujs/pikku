import { pikkuAgentMiddleware } from '#pikku/middleware'

export const testAgentMiddleware = pikkuAgentMiddleware<{ count: number }>({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info({
      type: 'agent-middleware',
      name: 'modifyInput',
      phase: 'before',
    })
    return { messages, instructions }
  },
  modifyOutputStream: async ({ logger }, { allEvents, event, state }) => {
    logger.info({
      type: 'agent-middleware',
      name: 'modifyOutputStream',
      phase: 'before',
    })
    state.count = ((state.count as number) ?? 0) + 1
    return event
  },
  modifyOutput: async ({ logger }, { text, messages }) => {
    logger.info({
      type: 'agent-middleware',
      name: 'modifyOutput',
      phase: 'before',
    })
    return { text, messages }
  },
})

export const secondAgentMiddleware = pikkuAgentMiddleware({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info({
      type: 'agent-middleware',
      name: 'second-modifyInput',
      phase: 'before',
    })
    return { messages, instructions }
  },
})
