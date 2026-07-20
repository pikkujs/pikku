import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'

/**
 * A sub-agent whose model is itself a mock script, so its behaviour is
 * deterministic even though a parent invokes it with the sub-agent's own
 * configured model (not the caller's per-request override).
 */
export const deterministicSubAgent = pikkuAIAgent({
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
export const delegateParentAgent = pikkuAIAgent({
  name: 'delegate-parent-agent',
  description: 'Delegates to a sub-agent and lets its output reach the client',
  goal: 'You route the request to your sub-agent.',
  model: 'openai/gpt-4o-mini',
  agents: [deterministicSubAgent],
  maxSteps: 5,
})

/**
 * Supervise mode: the sub-agent returns its result to this agent, whose own
 * reply reaches the client while the sub-agent's text is suppressed.
 */
export const superviseParentAgent = pikkuAIAgent({
  name: 'supervise-parent-agent',
  description: 'Supervises a sub-agent and summarises its result',
  goal: 'You supervise the sub-agent and prefix your reply with "SUPERVISOR:".',
  model: 'openai/gpt-4o-mini',
  agents: [deterministicSubAgent],
  agentMode: 'supervise',
  maxSteps: 5,
})
