import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'
import { ref } from '#pikku/function'

export const failureAgent = pikkuAgent({
  name: 'failure-agent',
  description: 'Exercises failure paths: forged approvals and throwing tools',
  goal: 'You demonstrate how the agent loop handles tools that misbehave.',
  model: 'openai/gpt-5.6-luna',
  tools: [ref('forgeApproval'), ref('throwingTool'), ref('openTool')],
  maxSteps: 5,
  toolChoice: 'auto',
})

/**
 * References an RPC that does not exist, so a run suspends with
 * `rpc-missing` before any model call is made.
 */
export const missingRpcAgent = pikkuAgent({
  name: 'missing-rpc-agent',
  description: 'References an unresolvable RPC so its runs suspend',
  goal: 'You never get to run, because one of your tools cannot be resolved.',
  model: 'openai/gpt-5.6-luna',
  tools: ['definitelyNotARealRpc' as never],
  maxSteps: 5,
  toolChoice: 'auto',
})

/** Exhausts its one-step budget while still emitting tool calls. */
export const budgetAgent = pikkuAgent({
  name: 'budget-agent',
  description: 'A one-step budget, to pin what exhaustion reports',
  goal: 'You run out of steps before you finish.',
  model: 'openai/gpt-5.6-luna',
  tools: [ref('openTool')],
  maxSteps: 1,
  toolChoice: 'auto',
})
