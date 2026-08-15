/**
 * A parent agent lists another agent under `agents`, which the framework
 * exposes to the model as a tool. Calling that tool runs the sub-agent under its
 * OWN configured model (not the caller's per-request override), so a fixture
 * sub-agent on `mock/sub-agent-text` behaves deterministically.
 *
 * In the default `delegate` mode the sub-agent's own text streams to the client;
 * in `supervise` mode it is suppressed and only the parent's summarising reply
 * is streamed. These protocol checks replace the browser-driven router/supervise
 * console scenarios.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/scenarios/pikku-scenario-types.gen.js'

const RESOURCE_ID = 'agent-delegation'
const SCRIPT = 'delegate-then-text'

/**
 * The two call arrays differ here and the difference is the point: the run made
 * three model calls in total, but only two of them are the parent's own. Reading
 * `modelCalls` for the count would silently assert something else.
 */
export const agentDelegationRunsSubAgentModelScenario = pikkuScenario<
  void,
  { calls: 2 }
>({
  title: 'Delegating runs the sub-agent’s own model, not the caller’s override',
  description: 'The sub-agent is not bound by the per-request model override',
  tags: ['scenario', 'agent-protocol', 'agent-delegation'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the parent agent', 'runsAgent', {
      agent: 'delegateParentAgent',
      script: SCRIPT,
      message: 'delegate please',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then(
      'sees the sub-agent’s own model invoked',
      'expectsModelCallMatching',
      {
        calls: run.modelCalls,
        modelId: 'sub-agent-text',
        userMessage: 'handle the task',
      }
    )
    await scenario.then(
      'sees two calls of the parent’s own',
      'expectsModelCallCount',
      { calls: run.ownCalls, count: 2 }
    )
    return { calls: 2 }
  },
})

export const agentDelegationModeStreamsSubAgentScenario = pikkuScenario<
  void,
  { streamed: true }
>({
  title: 'In delegate mode the sub-agent’s text reaches the client stream',
  description: 'The client hears the sub-agent directly',
  tags: ['scenario', 'agent-protocol', 'agent-delegation'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when(
      'streams the parent agent',
      'streamsAgent',
      {
        agent: 'delegateParentAgent',
        script: SCRIPT,
        message: 'delegate please',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      }
    )
    await scenario.then('sees the sub-agent’s reply', 'expectsStreamText', {
      text: stream.text,
      contains: 'SUBAGENT-REPLY',
      doesNotContain: 'SUPERVISOR',
    })
    return { streamed: true }
  },
})

export const agentDelegationSuperviseSuppressesSubAgentScenario = pikkuScenario<
  void,
  { suppressed: true }
>({
  title: 'In supervise mode the sub-agent’s text is suppressed',
  description: 'Only the parent’s summarising reply reaches the client',
  tags: ['scenario', 'agent-protocol', 'agent-delegation'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when(
      'streams the supervising agent',
      'streamsAgent',
      {
        agent: 'superviseParentAgent',
        script: SCRIPT,
        message: 'supervise please',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      }
    )
    await scenario.then('sees only the parent’s reply', 'expectsStreamText', {
      text: stream.text,
      contains: 'SUPERVISOR',
      doesNotContain: 'SUBAGENT-REPLY',
    })
    return { suppressed: true }
  },
})

export const agentDelegationFeature = pikkuFeature({
  name: 'An agent delegates to a sub-agent',
  description:
    'The sub-agent runs under its own model, and the mode decides whose voice reaches the client',
  tags: ['agent-protocol', 'agent-delegation'],
  scenarios: [
    agentDelegationRunsSubAgentModelScenario,
    agentDelegationModeStreamsSubAgentScenario,
    agentDelegationSuperviseSuppressesSubAgentScenario,
  ],
})
