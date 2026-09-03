import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

/** Used purely as a sub-agent tool of {@link toolKindsAgent}. */
export const toolKindsHelperAgent = pikkuAgent({
  name: 'toolkindshelper',
  description: 'A sub-agent offered as a tool',
  goal: 'You are a helper sub-agent.',
  model: 'chat',
  tools: [ref('openTool')],
  maxSteps: 3,
})

/**
 * Exposes three of the tool kinds at once so a single request proves each kind
 * is resolved and offered to the model: a first-party RPC function, a `graph:*`
 * builtin, and another agent as a sub-agent tool.
 */
export const toolKindsAgent = pikkuAgent({
  name: 'tool-kinds-agent',
  description: 'Offers an RPC tool, a graph builtin, and a sub-agent tool',
  goal: 'You have several kinds of tools at your disposal.',
  model: 'chat',
  tools: [ref('todos:listTodos'), ref('graph:math')],
  agents: [toolKindsHelperAgent],
  maxSteps: 5,
  toolChoice: 'auto',
})
