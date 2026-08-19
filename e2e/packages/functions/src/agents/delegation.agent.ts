import { z } from 'zod'
import { pikkuAgent } from '#pikku/agent/pikku-agent-types.gen.js'

/**
 * A sub-agent whose model is itself a mock script, so its behaviour is
 * deterministic even though a parent invokes it with the sub-agent's own
 * configured model (not the caller's per-request override).
 */
export const deterministicSubAgent = pikkuAgent({
  name: 'deterministic-sub-agent',
  description: 'A deterministic sub-agent used to prove delegation executes',
  goal: 'You are a helper sub-agent that answers in one line.',
  model: 'mock/sub-agent-text',
  maxSteps: 2,
})

/**
 * Delegate mode (the default): the sub-agent's text streams straight to the
 * client.
 */
export const delegateParentAgent = pikkuAgent({
  name: 'delegate-parent-agent',
  description: 'Delegates to a sub-agent and lets its output reach the client',
  goal: 'You route the request to your sub-agent.',
  model: 'openai/gpt-5.6-luna',
  agents: [deterministicSubAgent],
  maxSteps: 5,
})

/**
 * Supervise mode: the sub-agent returns its result to this agent, whose own
 * reply reaches the client while the sub-agent's text is suppressed.
 */
export const superviseParentAgent = pikkuAgent({
  name: 'supervise-parent-agent',
  description: 'Supervises a sub-agent and summarises its result',
  goal: 'You supervise the sub-agent and prefix your reply with "SUPERVISOR:".',
  model: 'openai/gpt-5.6-luna',
  agents: [deterministicSubAgent],
  agentMode: 'supervise',
  maxSteps: 5,
})

export const DelegateWorkingMemory = z.object({
  topic: z.string().optional(),
})

/**
 * Delegate mode with a working-memory notepad. A delegating parent's own text
 * is hidden from the client, but the `<working_memory>` blocks it writes there
 * still have to be collected — including the ones it writes after it has handed
 * off, which is what separates this agent from `delegateParentAgent`.
 */
export const workingMemoryDelegateParentAgent = pikkuAgent({
  name: 'working-memory-delegate-parent-agent',
  description:
    'Delegates to a sub-agent while keeping a working-memory notepad',
  goal: 'You route the request to your sub-agent and keep notes.',
  model: 'openai/gpt-5.6-luna',
  agents: [deterministicSubAgent],
  memory: { workingMemory: DelegateWorkingMemory },
  maxSteps: 5,
})
