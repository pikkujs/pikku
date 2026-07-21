import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'
import { isPermittedUser } from '../functions/adversarial.functions.js'

/**
 * Gated at the agent level rather than the tool level. The agent's own gate
 * resolves its permissions by reference, so unlike the tool-list filter it does
 * not depend on a name lookup.
 */
export const restrictedAgent = pikkuAIAgent({
  name: 'restricted-agent',
  description: 'Refuses to run at all for a caller who fails its permission',
  goal: 'You only answer permitted callers.',
  model: 'openai/gpt-5-mini',
  permissions: { permitted: isPermittedUser },
  tools: [ref('openTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})

export const permissionsAgent = pikkuAIAgent({
  name: 'permissions-agent',
  description: 'Exercises permission filtering of an agent’s tool list',
  goal: 'You demonstrate which tools survive permission filtering.',
  model: 'openai/gpt-5-mini',
  tools: [ref('openTool'), ref('gatedTool'), ref('dataGatedTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})

export const gatedOnlyAgent = pikkuAIAgent({
  name: 'gated-only-agent',
  description: 'Every tool is gated, so an unpermitted caller is offered none',
  goal: 'You demonstrate an agent whose entire tool list can be filtered away.',
  model: 'openai/gpt-5-mini',
  tools: [ref('gatedTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})
