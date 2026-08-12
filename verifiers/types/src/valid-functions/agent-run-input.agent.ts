/**
 * A declared agent, so the generated `rpc.agent.run` resolves to its typed branch
 * rather than the empty-map fallback that accepts `any`.
 */

import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'

export const typedAgent = pikkuAIAgent({
  name: 'typedAgent',
  description: 'Agent used by the rpc.agent.run type constraints.',
  goal: 'Answer the message.',
  model: 'openai/gpt-5-mini',
  tools: [],
  maxSteps: 1,
})
