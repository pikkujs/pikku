import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

export const permissionsAgent = pikkuAIAgent({
  name: 'permissions-agent',
  description: 'Exercises permission filtering of an agent’s tool list',
  goal: 'You demonstrate which tools survive permission filtering.',
  model: 'openai/o4-mini',
  tools: [ref('openTool'), ref('gatedTool'), ref('dataGatedTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})

export const gatedOnlyAgent = pikkuAIAgent({
  name: 'gated-only-agent',
  description: 'Every tool is gated, so an unpermitted caller is offered none',
  goal: 'You demonstrate an agent whose entire tool list can be filtered away.',
  model: 'openai/o4-mini',
  tools: [ref('gatedTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})
