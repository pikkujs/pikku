// Type-checked via tsconfig.type-tests.json; no runtime assertions.

import { pikkuAgentMiddleware } from '../../middleware/middleware-factories.js'
import type { PikkuAgentMiddlewareHooks } from './agent.types.js'

const _singletonServicesCompile = pikkuAgentMiddleware<{ count: number }>({
  modifyInput: async ({ logger }, { messages, instructions }) => {
    logger.info(`agent input: ${messages.length} messages`)
    return { messages, instructions }
  },
  modifyOutputStream: async ({ logger }, { event, state }) => {
    state.count = (state.count ?? 0) + 1
    logger.info(`event: ${event.type}`)
    return event
  },
  afterStep: async ({ variables }, { stepNumber }) => {
    variables.get(`STEP_${stepNumber}`)
  },
  onError: async ({ logger }, { error }) => {
    logger.error(error.message)
  },
})
void _singletonServicesCompile

const _wireServiceIsNotAvailable: PikkuAgentMiddlewareHooks = {
  // @ts-expect-error — `http` is a wire service, and an agent run has no wire
  modifyInput: async ({ http }, { messages, instructions }) => {
    void http
    return { messages, instructions }
  },
}
void _wireServiceIsNotAvailable

const _wireServiceIsNotAvailableToTheFactory = pikkuAgentMiddleware({
  // @ts-expect-error — `channel` is a wire service, and an agent run has no wire
  afterToolCall: async ({ channel }, { result }) => {
    void channel
    return { result }
  },
})
void _wireServiceIsNotAvailableToTheFactory
