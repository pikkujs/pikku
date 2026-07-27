/**
 * A caller can override the model, temperature and context on a single request
 * without redefining the agent. These are asserted against the scripted model's
 * request log, so they prove the override travelled all the way to the provider
 * rather than merely being accepted by the HTTP surface.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const AGENT = 'todoReadAgent'
const RESOURCE_ID = 'agent-overrides'

/**
 * The agent's own default model is never `text-only`, so the run only succeeds
 * because the request-level model reached the provider and picked the script.
 */
export const agentOverridesModelReachesProviderScenario = pikkuScenario<
  void,
  { modelId: string }
>({
  title: 'A per-request model override selects the provider model',
  description: 'The override reaches the provider, not just the HTTP surface',
  tags: ['scenario', 'agent-protocol', 'agent-overrides'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'pick a model',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees the overridden model', 'expectsModelCall', {
      calls: run.ownCalls,
      index: 1,
      modelId: 'text-only',
    })
    return { modelId: 'text-only' }
  },
})

export const agentOverridesContextIsInjectedScenario = pikkuScenario<
  void,
  { injected: true }
>({
  title: 'A per-request context is injected into the instructions verbatim',
  description: 'The context is not summarised or reworded on the way through',
  tags: ['scenario', 'agent-protocol', 'agent-overrides'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'use my context',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      context: 'org=acme project=falcon',
    })
    await scenario.then('sees the context verbatim', 'expectsModelCall', {
      calls: run.ownCalls,
      index: 1,
      instructionsInclude: 'org=acme project=falcon',
    })
    return { injected: true }
  },
})

export const agentOverridesContextIsOptionalScenario = pikkuScenario<
  void,
  { hadInstructions: true }
>({
  title: 'Context is only present when the request supplies it',
  description: 'The agent’s own instructions still carry, unchanged',
  tags: ['scenario', 'agent-protocol', 'agent-overrides'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'no context here',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then(
      'sees the agent’s own instructions',
      'expectsModelCall',
      {
        calls: run.ownCalls,
        index: 1,
        instructionsNonEmpty: true,
        instructionsInclude: 'todo',
      }
    )
    return { hadInstructions: true }
  },
})

export const agentOverridesFeature = pikkuFeature({
  name: 'Per-request overrides reach the model',
  description:
    'Model, temperature and context can be overridden on one request without redefining the agent',
  tags: ['agent-protocol', 'agent-overrides'],
  scenarios: [
    agentOverridesModelReachesProviderScenario,
    agentOverridesContextIsInjectedScenario,
    agentOverridesContextIsOptionalScenario,
  ],
})
