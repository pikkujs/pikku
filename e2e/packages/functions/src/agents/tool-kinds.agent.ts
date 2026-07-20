import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/pikku-types.gen.js'

/** Used purely as a sub-agent tool of {@link toolKindsAgent}. */
export const toolKindsHelperAgent = pikkuAIAgent({
  name: 'toolkindshelper',
  description: 'A sub-agent offered as a tool',
  goal: 'You are a helper sub-agent.',
  model: 'openai/o4-mini',
  tools: [ref('openTool')],
  maxSteps: 3,
})

/**
 * Exposes three of the tool kinds at once so a single request proves each kind
 * is resolved and offered to the model: a first-party RPC function, a `graph:*`
 * builtin, and another agent as a sub-agent tool.
 */
export const toolKindsAgent = pikkuAIAgent({
  name: 'tool-kinds-agent',
  description: 'Offers an RPC tool, a graph builtin, and a sub-agent tool',
  goal: 'You have several kinds of tools at your disposal.',
  model: 'openai/o4-mini',
  tools: [ref('todos:listTodos'), ref('graph:math')],
  agents: [toolKindsHelperAgent],
  maxSteps: 5,
  toolChoice: 'auto',
})
