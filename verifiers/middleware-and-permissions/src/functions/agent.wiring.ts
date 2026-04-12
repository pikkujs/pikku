import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import {
  testAIMiddleware,
  secondAIMiddleware,
} from '../middleware/ai-middleware.js'
import { wireChannelMiddleware } from '../middleware/channel-middleware.js'

export const testAgent = pikkuAIAgent({
  name: 'testAgent',
  description: 'Test agent with AI middleware',
  goal: 'Help users test AI middleware functionality.',
  model: 'test-model',
  aiMiddleware: [testAIMiddleware, secondAIMiddleware],
  channelMiddleware: [wireChannelMiddleware],
})

export const agentNoAIMiddleware = pikkuAIAgent({
  name: 'agent-no-ai-middleware',
  description: 'Agent without AI middleware',
  goal: 'Help users with simple tasks.',
  model: 'test-model',
})
