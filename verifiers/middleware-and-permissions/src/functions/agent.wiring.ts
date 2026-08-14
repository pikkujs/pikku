import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import {
  testAgentMiddleware,
  secondAgentMiddleware,
} from '../middleware/agent-middleware.js'
import { wireChannelMiddleware } from '../middleware/channel-middleware.js'

export const testAgent = pikkuAgent({
  name: 'testAgent',
  description: 'Test agent with AI middleware',
  goal: 'Help users test AI middleware functionality.',
  model: 'test-provider/test-model',
  agentMiddleware: [testAgentMiddleware, secondAgentMiddleware],
  channelMiddleware: [wireChannelMiddleware],
})

export const agentNoAgentMiddleware = pikkuAgent({
  name: 'agent-no-agent-middleware',
  description: 'Agent without AI middleware',
  goal: 'Help users with simple tasks.',
  model: 'test-provider/test-model',
})
