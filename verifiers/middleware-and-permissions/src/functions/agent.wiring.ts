import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import {
  testAIMiddleware,
  secondAIMiddleware,
} from '../middleware/ai-middleware.js'
import { wireChannelMiddleware } from '../middleware/channel-middleware.js'

export const testAgent = pikkuAIAgent({
  name: 'test-agent',
  description: 'Test agent with AI middleware',
  instructions: 'You are a test agent.',
  model: 'test-model',
  aiMiddleware: [testAIMiddleware, secondAIMiddleware],
  channelMiddleware: [wireChannelMiddleware],
})

export const agentNoAIMiddleware = pikkuAIAgent({
  name: 'agent-no-ai-middleware',
  description: 'Agent without AI middleware',
  instructions: 'You are a simple agent.',
  model: 'test-model',
})
