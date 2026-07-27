/**
 * The agent surface is exercised against a scripted model rather than a real
 * one, so these assertions are about Pikku's own behaviour — the tool loop, the
 * event ordering, what is offered to the model — and not about whether an LLM
 * happens to cooperate. The script is chosen per request via the model override
 * (`mock/<script>`), which keeps scenarios independent of each other.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const AGENT = 'todoReadAgent'
const RESOURCE_ID = 'agent-protocol'
const PLAIN_TEXT_REPLY = 'The mock model replied with plain text.'

export const agentProtocolSingleStepReplyScenario = pikkuScenario<
  void,
  { calls: 1 }
>({
  title: 'A single-step agent returns the scripted reply',
  description: 'One model call in, the scripted text out',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'hello',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees the scripted reply', 'expectsRunResult', {
      run,
      equals: PLAIN_TEXT_REPLY,
    })
    await scenario.then('sees one model call', 'expectsModelCallCount', {
      calls: run.ownCalls,
      count: 1,
    })
    return { calls: 1 }
  },
})

export const agentProtocolToolThenAnswerScenario = pikkuScenario<
  void,
  { calls: 2 }
>({
  title: 'The agent loop runs a tool and then answers',
  description: 'A tool call costs a second model call, which sees its result',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'tool-then-text',
      message: 'check my todos',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees the scripted reply', 'expectsRunResult', {
      run,
      equals: 'I checked your todos.',
    })
    await scenario.then('sees two model calls', 'expectsModelCallCount', {
      calls: run.ownCalls,
      count: 2,
    })
    await scenario.then('sees listTodos offered first', 'expectsOfferedTools', {
      calls: run.ownCalls,
      index: 1,
      offered: ['todos__listTodos'],
    })
    await scenario.then(
      'sees the tool result replayed on the second call',
      'expectsModelCall',
      { calls: run.ownCalls, index: 2, receivedToolResult: true }
    )
    return { calls: 2 }
  },
})

export const agentProtocolStepIndexPerCallScenario = pikkuScenario<
  void,
  { calls: 3 }
>({
  title: 'Each model call is one agent step',
  description: 'Step indexes are the loop’s record of how far it went round',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'two-tools-then-text',
      message: 'check twice',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees three model calls', 'expectsModelCallCount', {
      calls: run.ownCalls,
      count: 3,
    })
    await scenario.then('sees one step per call', 'expectsStepIndexes', {
      calls: run.ownCalls,
      indexes: [0, 1, 2],
    })
    return { calls: 3 }
  },
})

export const agentProtocolOffersItsOwnToolsScenario = pikkuScenario<
  void,
  { offered: string[] }
>({
  title: 'The agent’s own tools are offered to the model',
  description: 'Every offered tool arrives with an input schema',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'what can you do',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    const offered = await scenario.then(
      'sees both todo tools, each with a schema',
      'expectsOfferedTools',
      {
        calls: run.ownCalls,
        index: 1,
        offered: ['todos__listTodos', 'todos__deleteTodo'],
        allHaveSchemas: true,
      }
    )
    return { offered: offered.toolNames }
  },
})

export const agentProtocolInstructionsAreBuiltScenario = pikkuScenario<
  void,
  { instructed: true }
>({
  title: 'Instructions are built from the agent definition',
  description: 'The agent definition reaches the model as instructions',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'hi',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees non-empty instructions', 'expectsModelCall', {
      calls: run.ownCalls,
      index: 1,
      instructionsNonEmpty: true,
    })
    return { instructed: true }
  },
})

export const agentProtocolTemperatureReachesModelScenario = pikkuScenario<
  void,
  { temperature: 0.3 }
>({
  title: 'A per-request temperature reaches the model',
  description: 'The request overrides the agent’s own setting',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when('runs the agent at 0.3', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'hi at 0.3',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
      temperature: 0.3,
    })
    await scenario.then('sees the temperature applied', 'expectsModelCall', {
      calls: run.ownCalls,
      index: 1,
      temperature: 0.3,
    })
    return { temperature: 0.3 }
  },
})

export const agentProtocolStreamEnvelopeScenario = pikkuScenario<
  void,
  { streamed: true }
>({
  title: 'Streaming emits a well-formed run envelope',
  description: 'RUN_STARTED opens it, RUN_FINISHED closes it',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when('streams the agent', 'streamsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'stream hello',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees the run envelope', 'expectsStreamEnvelope', {
      types: stream.types,
      startsWith: 'RUN_STARTED',
      endsWith: 'RUN_FINISHED',
    })
    await scenario.then('sees text content', 'expectsStreamEvents', {
      types: stream.types,
      contains: ['TEXT_MESSAGE_CONTENT'],
    })
    return { streamed: true }
  },
})

export const agentProtocolStreamMatchesRunScenario = pikkuScenario<
  void,
  { matched: true }
>({
  title: 'Streamed text matches the synchronous result',
  description: 'The same script over both transports produces the same text',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const syncThread = await scenario.given(
      'opens a thread for the sync run',
      'startsAgentThread'
    )
    const streamThread = await scenario.given(
      'opens a thread for the streamed run',
      'startsAgentThread'
    )
    const run = await scenario.when('runs the agent', 'runsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'same both ways',
      threadId: syncThread.threadId,
      resourceId: RESOURCE_ID,
    })
    const stream = await scenario.when('streams the agent', 'streamsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'same both ways',
      threadId: streamThread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees the same text', 'expectsStreamText', {
      text: stream.text,
      equals: run.result,
    })
    return { matched: true }
  },
})

export const agentProtocolStreamToolCallIsBracketedScenario = pikkuScenario<
  void,
  { correlated: true }
>({
  title: 'A streamed tool call is bracketed and precedes its result',
  description: 'The result carries the id the call was opened with',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when('streams the agent', 'streamsAgent', {
      agent: AGENT,
      script: 'tool-then-text',
      message: 'stream a tool',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees the call opened first', 'expectsStreamOrder', {
      types: stream.types,
      before: 'TOOL_CALL_START',
      after: 'TOOL_CALL_RESULT',
    })
    await scenario.then('sees the call closed first', 'expectsStreamOrder', {
      types: stream.types,
      before: 'TOOL_CALL_END',
      after: 'TOOL_CALL_RESULT',
    })
    await scenario.then(
      'sees the result correlated to the call',
      'expectsToolCallCorrelation',
      { toolCallId: stream.toolCallId, toolResultId: stream.toolResultId }
    )
    return { correlated: true }
  },
})

export const agentProtocolStreamStepEnvelopeScenario = pikkuScenario<
  void,
  { steps: 2 }
>({
  title: 'One step envelope is emitted per model call',
  description: 'A tool call means two steps, so two of each envelope',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when('streams the agent', 'streamsAgent', {
      agent: AGENT,
      script: 'tool-then-text',
      message: 'count the steps',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees two step envelopes', 'expectsStreamEvents', {
      types: stream.types,
      counts: { STEP_STARTED: 2, STEP_FINISHED: 2 },
    })
    return { steps: 2 }
  },
})

export const agentProtocolReportsTokenUsageScenario = pikkuScenario<
  void,
  { reported: true }
>({
  title: 'The run reports token usage',
  description: 'RUN_FINISHED carries the run’s usage',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const stream = await scenario.when('streams the agent', 'streamsAgent', {
      agent: AGENT,
      script: 'text-only',
      message: 'usage please',
      threadId: thread.threadId,
      resourceId: RESOURCE_ID,
    })
    await scenario.then('sees non-zero usage', 'expectsTokenUsage', {
      totalTokens: stream.totalTokens,
    })
    return { reported: true }
  },
})

export const agentProtocolUnknownAgentIsRefusedScenario = pikkuScenario<
  void,
  { calls: 0 }
>({
  title: 'An unknown agent is refused',
  description: 'The refusal costs no model call at all',
  tags: ['scenario', 'agent-protocol'],
  func: async (_services, _data, { scenario }) => {
    const thread = await scenario.given('opens a thread', 'startsAgentThread')
    const run = await scenario.when(
      'runs an agent that does not exist',
      'runsAgent',
      {
        agent: 'noSuchAgent',
        script: 'text-only',
        message: 'hello nobody',
        threadId: thread.threadId,
        resourceId: RESOURCE_ID,
      }
    )
    await scenario.then('sees the call refused', 'expectsRunOutcome', {
      run,
      refused: true,
    })
    await scenario.then('sees no model call', 'expectsModelCallCount', {
      calls: run.modelCalls,
      count: 0,
    })
    return { calls: 0 }
  },
})

export const agentProtocolFeature = pikkuFeature({
  name: 'AI agent run and stream protocol',
  description:
    'The tool loop, the event ordering and what reaches the model, all against a scripted model',
  tags: ['agent-protocol'],
  scenarios: [
    agentProtocolSingleStepReplyScenario,
    agentProtocolToolThenAnswerScenario,
    agentProtocolStepIndexPerCallScenario,
    agentProtocolOffersItsOwnToolsScenario,
    agentProtocolInstructionsAreBuiltScenario,
    agentProtocolTemperatureReachesModelScenario,
    agentProtocolStreamEnvelopeScenario,
    agentProtocolStreamMatchesRunScenario,
    agentProtocolStreamToolCallIsBracketedScenario,
    agentProtocolStreamStepEnvelopeScenario,
    agentProtocolReportsTokenUsageScenario,
    agentProtocolUnknownAgentIsRefusedScenario,
  ],
})
