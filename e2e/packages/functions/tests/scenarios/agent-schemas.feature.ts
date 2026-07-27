/**
 * When an agent declares an `output` schema and offers no tools, the runner asks
 * the model for a structured object and surfaces it as the run result
 * (`result.object ?? result.text`), rather than the plain assistant text.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

export const agentSchemasStructuredResultScenario = pikkuScenario<
  void,
  { structured: true }
>({
  title: 'A tool-free agent with an output schema returns the parsed object',
  description: 'The result is the parsed object, not the assistant text',
  tags: ['scenario', 'agent-protocol', 'agent-schemas'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: 'structuredAgent',
      script: 'structured-object',
      message: 'classify this',
      threadId: thread.threadId,
      resourceId: 'agent-schemas',
    })
    await scenario.then('sees the parsed fields', 'expectsResultObject', {
      run,
      fields: {
        sentiment: 'positive',
        summary: 'all good',
        score: 0.9,
      },
    })
    return { structured: true }
  },
})

export const agentSchemasFeature = pikkuFeature({
  name: 'An output schema produces a structured result',
  description:
    'A tool-free agent with an output schema surfaces the parsed object as its result',
  tags: ['agent-protocol', 'agent-schemas'],
  scenarios: [agentSchemasStructuredResultScenario],
})
