/**
 * An agent can mix tool kinds: a first-party RPC function, a `graph:*` builtin,
 * and another agent exposed as a sub-agent tool. Each kind is resolved at
 * prepare time and offered to the model under its sanitised name (`:` becomes
 * `__`), and each carries an input schema.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

export const agentToolKindsAllOfferedScenario = pikkuScenario<
  void,
  { kinds: 3 }
>({
  title: 'RPC, graph-builtin and sub-agent tools are all offered',
  description: 'Each kind resolves and reaches the model with a schema',
  tags: ['scenario', 'agent-protocol', 'agent-tool-kinds'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: 'toolKindsAgent',
      script: 'text-only',
      message: 'what tools do you have',
      threadId: thread.threadId,
      resourceId: 'agent-tool-kinds',
    })
    await scenario.then('sees all three kinds', 'expectsOfferedTools', {
      calls: run.ownCalls,
      index: 1,
      offered: ['todos__listTodos', 'graph__math', 'toolKindsHelperAgent'],
      allHaveSchemas: true,
    })
    return { kinds: 3 }
  },
})

export const agentToolKindsFeature = pikkuFeature({
  name: 'Every kind of tool is resolved and offered to the model',
  description:
    'RPC functions, graph builtins and sub-agents all reach the model under a sanitised name',
  tags: ['agent-protocol', 'agent-tool-kinds'],
  scenarios: [agentToolKindsAllOfferedScenario],
})
