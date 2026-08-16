/**
 * `prepareStep` runs before each model call with the live tool array for that
 * step. Mutating the array narrows what the model is offered from that step on,
 * which is asserted against the scripted model's request log.
 */
import { pikkuFeature, pikkuScenario } from '#pikku/scenario'

export const agentPrepareStepNarrowsToolsScenario = pikkuScenario<
  void,
  { steps: 2 }
>({
  title: 'Tools offered on the first step are withdrawn on the next',
  description: 'Mutating the live tool array narrows the model’s menu',
  tags: ['scenario', 'agent-protocol', 'agent-prepare-step'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: 'prepareStepAgent',
      script: 'open-tool-then-text',
      message: 'narrow me',
      threadId: thread.threadId,
      resourceId: 'agent-prepare-step',
    })
    await scenario.then('sees two steps', 'expectsModelCallCount', {
      calls: run.ownCalls,
      count: 2,
    })
    await scenario.then(
      'sees the tool offered on step 1',
      'expectsOfferedTools',
      { calls: run.ownCalls, index: 1, offered: ['openTool'] }
    )
    await scenario.then('sees it withdrawn on step 2', 'expectsOfferedTools', {
      calls: run.ownCalls,
      index: 2,
      none: true,
    })
    return { steps: 2 }
  },
})

export const agentPrepareStepFeature = pikkuFeature({
  name: 'prepareStep narrows a step before it runs',
  description:
    'The live tool array a prepareStep hook mutates is what the model is offered',
  tags: ['agent-protocol', 'agent-prepare-step'],
  scenarios: [agentPrepareStepNarrowsToolsScenario],
})
